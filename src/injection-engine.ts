import type { Context } from "@opencode/plugin/promise/plugin"
import type { Options, FileEntry, Stats, ProjectInfo } from "./config/index.ts"
import { promises as fs } from "node:fs"
import * as path from "node:path"
import { getChangedFiles } from "./fs/vcs.js"
import { buildFullMapping, buildDigest, buildInjectionRev } from "./injection/builder.js"
import { renderTree, convertToImmutable, createMutableNode, addPathToMutableNode, removePathFromMutableNode, updateGeneratedStatusInMutableNode } from "./injection/render.js"
import { createFilterContext, ensureGitignore, walk } from "./fs/filter.js"
import { extOf, locKey } from "./config/index.js"
import { pruneCache } from "./storage/cache.js"

export type LogFn = (...args: unknown[]) => void

export interface InjectionEngine {
  listFiles(force: boolean): Promise<string[]>
  getInjection(sessionID: string | undefined): Promise<string>
  getChangedFilesCached(): Promise<string[]>
  detectGit(): Promise<boolean>
  cleanup(): void
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
  log: LogFn,
  project: ProjectInfo,
  filesCache: { at: number; files: string[] },
  vcsCache: { at: number; files: string[] },
  treeCache: { current: ReturnType<typeof createMutableNode> | null },
  summarizeMany: (rels: string[], force: boolean) => Promise<void>,
  recentBySession: Map<string, Map<string, number>>,
  recentGlobal: Map<string, number>,
  injectionState: Map<string, { rev: string }>,
  metricsCollector: any,
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
      log(`adaptive walk: concurrency ${currentConcurrency} → ${newConcurrency} (median latency: ${medianLatency.toFixed(2)}ms/file, target: ${targetLatency}ms)`)
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

  async function listFiles(force: boolean): Promise<string[]> {
    if (!force && Date.now() - filesCache.at < opts.treeTtlMs) return filesCache.files
    await ensureGitignore(filterCtx)
    const out: string[] = []
    const t0 = Date.now()
    await walk(filterCtx, root, "", out)
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
      await pruneCache(api, (await import("./utils/hash.js")).locKey(root), out, cache)
    }
    return out
  }

  async function getChangedFilesCached(): Promise<string[]> {
    if (vcsCacheLocal.at && Date.now() - vcsCacheLocal.at < 2_000) return vcsCacheLocal.files
    const files = await getChangedFiles(api, root, (input: unknown) => {
      if (typeof input !== "string" || !input.trim()) return undefined
      const abs = path.isAbsolute(input) ? input : path.resolve(root, input)
      const rel = path.relative(root, abs)
      if (!rel || rel.startsWith("..")) return undefined
      return rel.split(path.sep).join("/")
    })
    vcsCacheLocal = { at: Date.now(), files }
    return files
  }

  async function detectGit(): Promise<boolean> {
    let dir = root
    for (let i = 0; i < 8; i++) {
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

  async function getInjection(sessionID: string | undefined): Promise<string> {
    if (opts.inject === "off" || broadRoot) return ""
    const key = sessionID ?? "<anonymous>"
    const changed = await getChangedFilesCached()
    const gitRepo = await detectGit()
    const needFresh = !filesCache.at || Date.now() - filesCache.at >= opts.treeTtlMs
    const changeSignal = dirtyRef.current?.size > 0 || changed.length > 0

    // Force fresh walk for new sessions
    const forceWalkNewSession = opts.forceWalkOnNewSession ?? true
    const isNewSession = forceWalkNewSession && sessionID && !sessionsWithInitialWalk.has(sessionID)
    const shouldWalk = needFresh || changeSignal || isNewSession || !gitRepo

    if (isNewSession) {
      sessionsWithInitialWalk.add(sessionID)
    }

    const files = shouldWalk ? await listFiles(false) : filesCache.files
    const rev = buildInjectionRev(files, changed, cache)
    const prev = injectionState.get(key)
    const sendFull =
      opts.injectStrategy === "always" ||
      !prev ||
      (opts.injectStrategy === "changed" && prev.rev !== rev)

    if (opts.debug) {
      console.error(`[workspace-map] getInjection: key=${key}, injectStrategy=${opts.injectStrategy}, sendFull=${sendFull}, prev=${prev ? "yes" : "no"}, rev=${rev}`)
    }

    let text: string
    const injectionType = sendFull ? "full" : "digest"
    if (sendFull) {
      const tree = treeCache.current ? convertToImmutable(treeCache.current) : undefined
      text = await buildFullMapping(api, opts, stats, cache, reverseDeps, root, broadRoot, sessionID, listFiles, getChangedFilesCached, summarizeMany, recentBySession, recentGlobal, project, filterCtx.isGenerated, tree)
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

  return {
    listFiles,
    getInjection,
    getChangedFilesCached,
    detectGit,
    cleanup: stopAdaptiveWalkAdjustment,
  }

  // Start adaptive walk concurrency adjustment
  startAdaptiveWalkAdjustment()
}