import type { Context } from "@opencode/plugin/promise/plugin"
import type { Options, FileEntry, Stats, ProjectInfo, Logger, SummarizationPriority } from "./config/index.ts"
import type { MetricsCollector, NoOpMetricsCollector } from "./metrics/index.ts"

type MetricsCollectorLike = MetricsCollector | NoOpMetricsCollector
import { promises as fs } from "node:fs"
import * as path from "node:path"
import { getChangedFiles } from "./fs/vcs.js"
import { buildFullMapping, buildDigest, buildInjectionRev } from "./injection/builder.js"
import { renderTree, convertToImmutable, createMutableNode, addPathToMutableNode, removePathFromMutableNode, updateGeneratedStatusInMutableNode } from "./injection/render.js"
import { createFilterContext, ensureGitignore, walk } from "./fs/filter.js"
import { extOf, locKey } from "./config/index.js"
import { pruneCache } from "./storage/cache.js"
import { isCancelledError, raceCancellation } from "./utils/cancellation.js"

export interface InjectionEngine {
  listFiles(force: boolean, signal?: AbortSignal): Promise<string[]>
  getInjection(sessionID: string | undefined, signal?: AbortSignal): Promise<string>
  getChangedFilesCached(signal?: AbortSignal): Promise<string[]>
  detectGit(signal?: AbortSignal): Promise<boolean>
  cleanup(): void
  shutdown(): Promise<void>
}

export function createInjectionEngine(
  api: Context,
  opts: Options,
  root: string,
  cache: Map<string, FileEntry>,
  reverseDeps: Map<string, Set<string>>,
  stats: Stats,
  filterCtx: ReturnType<typeof createFilterContext>,
  broadRoot: boolean,
  effectiveMaxFiles: number,
  sessionsWithInitialWalk: Set<string>,
  log: Logger,
  project: ProjectInfo,
  filesCache: { at: number; files: string[] },
  vcsCache: { at: number; files: string[] },
  treeCache: { current: ReturnType<typeof createMutableNode> | null },
  summarizeMany: (rels: string[], force: boolean, priority?: SummarizationPriority, signal?: AbortSignal) => Promise<void>,
  recentBySession: Map<string, Map<string, number>>,
  recentGlobal: Map<string, number>,
  injectionState: Map<string, { rev: string }>,
  metricsCollector: MetricsCollectorLike,
  dirtyRef: { current: Set<string> }
): InjectionEngine {

  // Adaptive walk concurrency tracking
  const walkLatencies: number[] = []
  let adaptiveWalkTimer: ReturnType<typeof setTimeout> | undefined

  function recordWalkLatency(fileCount: number, durationMs: number): void {
    if (!opts.adaptiveWalkConcurrency) return

    const latencyPerFile = fileCount > 0 ? durationMs / fileCount : durationMs
    walkLatencies.push(latencyPerFile)

    // Keep only recent latencies (last 20 walks)
    if (walkLatencies.length > 20) {
      walkLatencies.shift()
    }
  }

  function adjustWalkConcurrency(): void {
    if (!opts.adaptiveWalkConcurrency) return
    if (walkLatencies.length < 3) return // Need some samples first

    const sorted = [...walkLatencies].sort((a, b) => a - b)
    const medianLatency = sorted[Math.floor(sorted.length / 2)]

    const minConcurrency = opts.adaptiveWalkMinConcurrency ?? 1
    const maxConcurrency = opts.adaptiveWalkMaxConcurrency ?? 16
    const targetLatency = opts.adaptiveWalkTargetLatencyMs ?? 5

    let currentConcurrency = typeof opts.walkConcurrency === "number" ? opts.walkConcurrency : 4
    let newConcurrency = currentConcurrency

    // Adjust based on median latency vs target
    if (medianLatency > targetLatency * 2 && currentConcurrency < maxConcurrency) {
      newConcurrency = Math.min(currentConcurrency + 1, maxConcurrency)
    } else if (medianLatency < targetLatency / 2 && currentConcurrency > minConcurrency) {
      newConcurrency = Math.max(currentConcurrency - 1, minConcurrency)
    }

    if (newConcurrency !== currentConcurrency) {
      opts.walkConcurrency = newConcurrency
      log.info("adaptive walk: concurrency adjusted", { 
        from: currentConcurrency, 
        to: newConcurrency, 
        medianLatencyMs: medianLatency.toFixed(2), 
        targetLatencyMs: targetLatency 
      })
    }
  }

  function startAdaptiveWalkAdjustment(): void {
    if (!opts.adaptiveWalkConcurrency) return
    const interval = (opts.adaptiveWalkAdjustmentInterval ?? 10) * 60_000 // Convert to minutes
    adaptiveWalkTimer = setInterval(adjustWalkConcurrency, interval)
  }

  function stopAdaptiveWalkAdjustment(): void {
    if (adaptiveWalkTimer) clearTimeout(adaptiveWalkTimer)
  }

  let vcsCacheLocal = vcsCache
  let shutdownSignal: AbortSignal | undefined
  
  // No-op AbortSignal for when no signal is provided
  const noopAbortSignal: AbortSignal = {
    aborted: false,
    onabort: null,
    reason: undefined,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
    throwIfAborted: () => {},
  }

  async function listFiles(force: boolean, signal?: AbortSignal): Promise<string[]> {
    if (!force && Date.now() - filesCache.at < opts.treeTtlMs) return filesCache.files
    await ensureGitignore(filterCtx)
    const out: string[] = []
    const t0 = Date.now()
    await walk(filterCtx, root, "", out, signal)
    const walkDurationMs = Date.now() - t0
    out.sort()

    // Incremental tree update
    const oldFiles = new Set(filesCache.files)
    const newFiles = new Set(out)

    // Initialize tree if needed
    if (!treeCache.current) {
      treeCache.current = createMutableNode("", "", false)
      for (const f of out) {
        addPathToMutableNode(treeCache.current, f, filterCtx.isGenerated)
      }
    } else {
      // Find removed files and remove from tree
      for (const rel of oldFiles) {
        if (!newFiles.has(rel)) {
          removePathFromMutableNode(treeCache.current!, rel)
        }
      }

      // Find added files and add to tree
      for (const rel of newFiles) {
        if (!oldFiles.has(rel)) {
          addPathToMutableNode(treeCache.current!, rel, filterCtx.isGenerated)
        }
      }

      // Update generated status for existing files
      for (const rel of newFiles) {
        if (oldFiles.has(rel)) {
          updateGeneratedStatusInMutableNode(treeCache.current!, rel, filterCtx.isGenerated(rel))
        }
      }
    }

    filesCache.at = Date.now()
    filesCache.files = out
    stats.files = out.length
    stats.walks++
    stats.lastWalkMs = walkDurationMs

    // Record walk metrics
    if (metricsCollector) {
      metricsCollector.recordWalk(out.length, walkDurationMs)
    }

    // Record latency for adaptive concurrency
    recordWalkLatency(out.length, walkDurationMs)

    // Prune cache entries whose files have vanished
    if (out.length < effectiveMaxFiles && (force || cache.size > out.length)) {
      const currentFiles = new Set(out)
      for (const rel of [...cache.keys()]) {
        if (!currentFiles.has(rel)) {
          // Remove reverse deps
          for (const [imported, importers] of reverseDeps) {
            if (importers.has(rel)) {
              importers.delete(rel)
              if (importers.size === 0) reverseDeps.delete(imported)
            }
          }
        }
      }
      await pruneCache(api, (await import("./utils/hash.js")).locKey(root), out, cache, log)
    }
    return out
  }

  async function getChangedFilesCached(signal?: AbortSignal): Promise<string[]> {
    if (vcsCacheLocal.at && Date.now() - vcsCacheLocal.at < 2_000) return vcsCacheLocal.files
    const files = await raceCancellation(
      getChangedFiles(api, root, (input: unknown) => {
        if (typeof input !== "string" || !input.trim()) return undefined
        const abs = path.isAbsolute(input) ? input : path.resolve(root, input)
        const rel = path.relative(root, abs)
        if (!rel || rel.startsWith("..")) return undefined
        return rel.split(path.sep).join("/")
      }),
      signal ?? noopAbortSignal
    )
    vcsCacheLocal = { at: Date.now(), files }
    return files
  }

  async function detectGit(signal?: AbortSignal): Promise<boolean> {
    let dir = root
    for (let i = 0; i < 8; i++) {
      // Check for cancellation
      signal?.throwIfAborted?.()
      try {
        await fs.stat(path.join(dir, ".git"))
        return true
      } catch {
        const parent = path.dirname(dir)
        if (parent === dir) break
        dir = parent
      }
    }
    return false
  }

  async function getInjection(sessionID: string | undefined, signal?: AbortSignal): Promise<string> {
    if (opts.inject === "off" || broadRoot) return ""
    const key = sessionID ?? "<anonymous>"
    const changed = await getChangedFilesCached(signal)
    const gitRepo = await detectGit(signal)
    const needFresh = !filesCache.at || Date.now() - filesCache.at >= opts.treeTtlMs
    const changeSignal = dirtyRef.current?.size > 0 || changed.length > 0

    // Force fresh walk for new sessions
    const forceWalkNewSession = opts.forceWalkOnNewSession ?? true
    const isNewSession = forceWalkNewSession && sessionID && !sessionsWithInitialWalk.has(sessionID)
    const shouldWalk = needFresh || changeSignal || isNewSession || !gitRepo

    if (isNewSession) {
      sessionsWithInitialWalk.add(sessionID)
    }

    const files = shouldWalk ? await listFiles(false, signal) : filesCache.files
    const rev = buildInjectionRev(files, changed, cache)
    const prev = injectionState.get(key)
    const sendFull =
      opts.injectStrategy === "always" ||
      !prev ||
      (opts.injectStrategy === "changed" && prev.rev !== rev)

    if (opts.debug) {
      log.debug("getInjection", { key, injectStrategy: opts.injectStrategy, sendFull, prev: prev ? "yes" : "no", rev })
    }

    let text: string
    const injectionType = sendFull ? "full" : "digest"
    if (sendFull) {
      const tree = treeCache.current ? convertToImmutable(treeCache.current) : undefined
      text = await raceCancellation(
        buildFullMapping(api, opts, stats, cache, reverseDeps, root, broadRoot, sessionID, listFiles, getChangedFilesCached, summarizeMany, recentBySession, recentGlobal, project, filterCtx.isGenerated, tree),
        signal ?? noopAbortSignal
      )
      stats.fullInjections++
    } else {
      text = buildDigest(files, changed, cache, broadRoot)
      stats.digestInjections++
    }
    injectionState.set(key, { rev })
    stats.lastInjectionChars = text.length
    stats.lastInjectionAt = Date.now()

    // Record injection metrics
    if (metricsCollector) {
      metricsCollector.recordInjection(text.length, injectionType)
    }

    return text
  }

  async function shutdown(): Promise<void> {
    stopAdaptiveWalkAdjustment()
    // Cancel any pending operations
    shutdownSignal = undefined
  }

  return {
    listFiles,
    getInjection,
    getChangedFilesCached,
    detectGit,
    cleanup: stopAdaptiveWalkAdjustment,
    shutdown,
  }

  // Start adaptive walk concurrency adjustment
  startAdaptiveWalkAdjustment()
}