/**
 * workspace-map — v0.4.0
 *
 * Keeps a cached, incrementally maintained map of the workspace (directory tree
 * + per-file summaries) so the agent has structural awareness of multi-file
 * repositories.
 *
 * v0.4.0 highlights:
 * - Model summarizer never blocks the session hook: outline mode refreshes
 *   notes synchronously; model mode enqueues them. Nothing is summarized at
 *   all in "tree" injection mode.
 * - Changed files are annotated in the injected tree (~ src/x.ts) and digests
 *   name the touched files, so the price of a re-injection buys real signal.
 * - Option values are validated (typos in inject/injectStrategy/summarizer
 *   now warn + fall back instead of silently degrading).
 * - Honest tree truncation, opportunistic cache pruning, binary-file markers,
 *   richer stats (per-kind summarizer counts, walk duration), JSON output
 *   with changed/updatedAt, and a config schema file.
 * - Project auto-detection (monorepo, language, framework) with auto-tuning.
 * - Parallel directory walks and concurrent summarization.
 * - Glob patterns for ignore/include with symbol search.
 *
 * See README.md for options.
 */

import { Plugin } from "@opencode/plugin"
import type { Context, Cleanup } from "@opencode/plugin/promise/plugin"
import type { StorageScanOptions, StorageScanResult } from "@opencode/plugin"
import { promises as fs } from "node:fs"
import { createWriteStream } from "node:fs"
import * as path from "node:path"
import * as os from "node:os"
import { createHash } from "node:crypto"

// Import modules
import {
  DEFAULT_IGNORES,
  TOP_LEVEL_IGNORES,
  DOT_DIR_ALLOW,
  DOT_FILE_ALLOW,
  SECRET_EXT,
  SECRET_STEM,
  SECRET_STEM_EXT,
  LOCKFILES,
  BINARY_EXT,
  CODE_EXT,
  DATA_EXT,
  WRITE_TOOLS,
  DEFAULT_OPTIONS,
  type Options,
  type FileEntry,
  type Stats,
  type WorkspaceMapInput,
  type SymbolInfo,
  type SummarySections,
  type MonorepoPackage,
  type SummarizerKind,
  TOOL_NAME,
  REFRESH_CAP,
  loadSidecarConfig,
  validateOptions,
  detectProject,
  autoTuneOptions,
  resolveSummarizer,
  getFallbackChain,
  detectOptimalWalkConcurrency,
} from "./src/config/index.js"

import { discoverPackages } from "./src/config/index.js"
import { initializeMetrics, shutdownMetrics, getMetricsCollector } from "./src/metrics/index.js"

import {
  globToRegex,
  compileGitignore,
  gitignored,
} from "./src/fs/gitignore.js"

import {
  createFilterContext,
  setGitignore,
  skipDir,
  skipFile,
  ensureGitignore,
  walk,
  extOf,
} from "./src/fs/filter.js"

import { getChangedFiles } from "./src/fs/vcs.js"

import { outlineSummarize, modelSummary, lspSummarize } from "./src/summarizers/index.js"

import { loadCache, migrateLegacy, saveEntry, pruneCache } from "./src/storage/cache.js"

import { buildFullMapping, buildDigest, buildInjectionRev } from "./src/injection/builder.js"

import { renderTree, focusFiles, mapRev, buildTree, addPathToMutableNode, removePathFromMutableNode, updateGeneratedStatusInMutableNode, convertToImmutable, createMutableNode } from "./src/injection/render.js"

import { createWorkspaceMapTool } from "./src/tool/index.js"
import { registerWatchCommand, registerCLICommands } from "./src/cli/index.js"

import { enqueue, setDisposed } from "./src/utils/enqueue.js"

import { hash, locKey, entryPrefix, LEGACY_PREFIX } from "./src/utils/hash.js"

import { createSemaphore } from "./src/utils/semaphore.js"

const VERSION = "0.4.0"

export default Plugin.define({
  id: "workspace-map",
  async setup(ctx: Context): Promise<Cleanup> {
    const api = ctx
    const startMsg = `[workspace-map] SETUP START ${JSON.stringify({ location: api.location?.directory, options: ctx.options })}`
    console.error(startMsg)
    try {
      await fs.appendFile(path.join(os.tmpdir(), "wm-setup.log"), startMsg + "\n")
    } catch {}

    const sidecar = await loadSidecarConfig()
    const opts: Options = {
      ...DEFAULT_OPTIONS,
      ...sidecar,
      ...((ctx.options as Partial<Options>) ?? {}),
      ignore: [...DEFAULT_IGNORES, ...((sidecar.ignore as string[]) ?? []), ...((ctx.options as any)?.ignore ?? [])],
      ignoreExtra: [...((sidecar.ignoreExtra as string[]) ?? []), ...((ctx.options as any)?.ignoreExtra ?? [])],
      include: [...((sidecar.include as string[]) ?? []), ...((ctx.options as any)?.include ?? [])],
    }

    const root: string = path.resolve(api.location?.directory ?? api.location?.project?.directory ?? process.cwd())

    // Auto-tune options based on project type
    const project = await detectProject(root)
    autoTuneOptions(opts, project, (msg) => { if (opts.debug) console.error("[workspace-map]", msg) })
    
    // Auto-detect optimal walk concurrency if set to "auto"
    if (opts.walkConcurrency === "auto" && opts.autoTune) {
      const optimalConcurrency = await detectOptimalWalkConcurrency(root, (msg) => { if (opts.debug) console.error("[workspace-map]", msg) })
      opts.walkConcurrency = optimalConcurrency
    }

    validateOptions(opts, (msg) => { if (opts.debug) console.error("[workspace-map]", msg) })

    const lk = locKey(root)
    const ENTRY_PREFIX = entryPrefix(lk)

    // State variables (must be defined before tool registration)
    const cache = new Map<string, FileEntry>()
    const reverseDeps = new Map<string, Set<string>>() // imported file -> set of importers
    const recentBySession = new Map<string, Map<string, number>>()
    const recentGlobal = new Map<string, number>()
    const injectionState = new Map<string, { rev: string }>()
    const stats: Stats = {
      summaries: 0,
      skippedByRule: 0,
      walks: 0,
      fullInjections: 0,
      digestInjections: 0,
      dirtyFlushes: 0,
      warmups: 0,
      sessions: 0,
      files: 0,
      outlineSummaries: 0,
      modelSummaries: 0,
      skippedSummaries: 0,
      lastWalkMs: 0,
      lastInjectionChars: 0,
      lastInjectionAt: 0,
      // Cost tracking
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUsd: 0,
      costBySummarizer: {
        outline: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
        model: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
        lsp: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
      } as Record<SummarizerKind, { inputTokens: number; outputTokens: number; costUsd: number }>,
    }

    let filesCache: { at: number; files: string[] } = { at: 0, files: [] }
    let vcsCache: { at: number; files: string[] } = { at: 0, files: [] }
    let modelRefCache: { providerID: string; id: string } | undefined
    let flushTimer: ReturnType<typeof setTimeout> | undefined
    let disposed = false
    let gitignore: ReturnType<typeof compileGitignore> | undefined
    let pendingWrites: { rels: string[]; sessionID?: string }[] = []

    // Tree cache for incremental updates (mutable tree with Map children)
    let treeCache: ReturnType<typeof createMutableNode> | null = null

    // Initialize metrics if enabled (after cache is declared)
    const metricsCollector = await initializeMetrics(opts)
    if (metricsCollector) {
      metricsCollector.setCacheSize(cache.size)
    }

    const ignoreSet = new Set([...opts.ignore, ...opts.ignoreExtra])

    // Compile glob patterns to regex for ignore/include
    const ignoreGlobs = [...opts.ignore, ...opts.ignoreExtra]
      .filter((p) => p.includes("*") || p.includes("?"))
      .map((p) => new RegExp("^" + globToRegex(p) + "$"))
    const includeGlobs = opts.include
      .filter((p) => p.includes("*") || p.includes("?"))
      .map((p) => new RegExp("^" + globToRegex(p) + "$"))

    function matchesGlobs(rel: string, globs: RegExp[]): boolean {
      return globs.some((re) => re.test(rel))
    }

    const home = path.resolve(os.homedir())
    const broadRoot =
      root.toLowerCase() === home.toLowerCase() ||
      path.parse(root).root.toLowerCase() === root.toLowerCase() ||
      root.toLowerCase() === path.dirname(home).toLowerCase()
    const effectiveMaxFiles = broadRoot && !opts.allowBroadRoot ? Math.min(opts.maxFiles, 800) : opts.maxFiles

    const log = (...args: unknown[]) => {
      if (opts.debug) console.error("[workspace-map]", ...args)
    }

    // Cost tracking
    let costLogTimer: ReturnType<typeof setTimeout> | undefined
    function trackCost(kind: SummarizerKind, inputTokens: number, outputTokens: number): void {
      if (!opts.costTracking?.enabled) return
      const inputPrice = opts.costTracking.inputTokenPriceUsd ?? 0.0000015
      const outputPrice = opts.costTracking.outputTokenPriceUsd ?? 0.000006
      const cost = inputTokens * inputPrice + outputTokens * outputPrice
      
      stats.totalInputTokens += inputTokens
      stats.totalOutputTokens += outputTokens
      stats.totalCostUsd += cost
      stats.costBySummarizer[kind].inputTokens += inputTokens
      stats.costBySummarizer[kind].outputTokens += outputTokens
      stats.costBySummarizer[kind].costUsd += cost
    }

    function startCostLogging(): void {
      if (!opts.costTracking?.enabled) return
      const interval = opts.costTracking.logIntervalMs ?? 60_000
      costLogTimer = setInterval(() => {
        if (stats.totalCostUsd > 0) {
          log(`Cost summary: $${stats.totalCostUsd.toFixed(6)} (${stats.totalInputTokens} in / ${stats.totalOutputTokens} out tokens)`)
          log(`  By summarizer: outline=${stats.costBySummarizer.outline.costUsd.toFixed(6)}, model=${stats.costBySummarizer.model.costUsd.toFixed(6)}, lsp=${stats.costBySummarizer.lsp.costUsd.toFixed(6)}`)
        }
      }, interval)
    }

    function stopCostLogging(): void {
      if (costLogTimer) clearTimeout(costLogTimer)
    }

    // ---------------------------------------------------------------- helpers

    function toRel(input: unknown): string | undefined {
      if (typeof input !== "string" || !input.trim()) return undefined
      const abs = path.isAbsolute(input) ? input : path.resolve(root, input)
      const rel = path.relative(root, abs)
      if (!rel || rel.startsWith("..")) return undefined
      return rel.split(path.sep).join("/")
    }

    interface ToolInput {
      filePath?: string
      file_path?: string
      path?: string
      files?: Array<string | { path?: string; filePath?: string }>
      filePaths?: string[]
      edits?: Array<{ filePath?: string; path?: string; file?: string; fileRelPath?: string }>
      patch?: string
      diff?: string
    }

    function relsFromInput(input: ToolInput): string[] {
      const out: string[] = []
      const pushRel = (p: unknown) => {
        const rel = toRel(p)
        if (rel && !out.includes(rel)) out.push(rel)
      }
      pushRel(input?.filePath ?? input?.file_path ?? input?.path)
      for (const f of input?.files ?? []) pushRel(typeof f === "string" ? f : f?.path ?? f?.filePath)
      for (const f of input?.filePaths ?? []) pushRel(f)
      for (const e of input?.edits ?? []) pushRel(e?.filePath ?? e?.path ?? e?.file ?? e?.fileRelPath)
      const patchText = typeof input?.patch === "string" ? input.patch : typeof input?.diff === "string" ? input.diff : ""
      if (patchText) {
        for (const m of patchText.matchAll(/^\*{3}\s+(?:Update File|Add File|Delete File)\s*:\s*(.+)$/gm)) {
          pushRel(m[1].trim())
        }
      }
      return out
    }

    function isSecret(rel: string): boolean {
      const base = (rel.split("/").pop() ?? rel).toLowerCase()
      if (base === ".env" || base.startsWith(".env.") || base.startsWith(".env-")) return true
      const ext = "." + extOf(base)
      if (SECRET_EXT.has(ext)) return true
      const stem = base.includes(".") ? base.slice(0, base.lastIndexOf(".")) : base
      if (SECRET_STEM.test(stem)) return ext === "." || SECRET_STEM_EXT.has(ext)
      return false
    }

    // Register tool EARLY (synchronously) so agent sees it immediately
    if (opts.registerTool) {
      const regMsg = "registering workspace_map tool (early)"
      console.error(regMsg)
      ;(async () => { try { await fs.appendFile(path.join(os.tmpdir(), "wm-setup.log"), regMsg + "\n") } catch {} })()
      await api.tool.transform((editor: any) => {
        editor.add(createWorkspaceMapTool(api, opts, root, lk, cache, reverseDeps, stats, recentBySession, recentGlobal, listFiles, getChangedFilesCached, summarizeMany, log, project))
      })
    }

    // Register watch command
    if (opts.watchEnabled) {
      registerWatchCommand(api, opts, root, cache, stats, listFiles, summarizeMany, log)
    }

    // ------------------------------------------------------------ filesystem

    const filterCtx = createFilterContext(opts, stats, root, effectiveMaxFiles, log)

    // Register CLI commands
    registerCLICommands({
      api,
      opts,
      root,
      cache,
      stats,
      reverseDeps,
      listFiles,
      summarizeMany,
      getChangedFilesCached,
      log,
      project,
      broadRoot,
      entryPrefix: ENTRY_PREFIX,
      filesCache,
      vcsCache,
      filterCtx,
      treeCache,
    })

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
      if (!treeCache) {
        treeCache = createMutableNode("", "", false)
        for (const f of out) {
          addPathToMutableNode(treeCache, f, filterCtx.isGenerated)
        }
      } else {
        // Find removed files and remove from tree
        for (const rel of oldFiles) {
          if (!newFiles.has(rel)) {
            removePathFromMutableNode(treeCache!, rel)
          }
        }
        
        // Find added files and add to tree
        for (const rel of newFiles) {
          if (!oldFiles.has(rel)) {
            addPathToMutableNode(treeCache!, rel, filterCtx.isGenerated)
          }
        }
        
        // Update generated status for existing files (in case it changed)
        for (const rel of newFiles) {
          if (oldFiles.has(rel)) {
            updateGeneratedStatusInMutableNode(treeCache!, rel, filterCtx.isGenerated(rel))
          }
        }
      }
      
      filesCache = { at: Date.now(), files: out }
      stats.files = out.length
      stats.walks++
      stats.lastWalkMs = walkDurationMs
      
      // Record walk metrics
      if (metricsCollector) {
        metricsCollector.recordWalk(out.length, walkDurationMs)
      }
      
      // Prune cache entries whose files have vanished
      if (out.length < effectiveMaxFiles && (force || cache.size > out.length)) {
        const currentFiles = new Set(out)
        for (const rel of [...cache.keys()]) {
          if (!currentFiles.has(rel)) {
            cleanupReverseDeps(rel)
          }
        }
        await pruneCache(api, lk, out, cache)
      }
      return out
    }

    // ---------------------------------------------------------- summarizers

    async function summarize(rel: string, force: boolean): Promise<void> {
      const summarizeStartMs = Date.now()
      const abs = path.join(root, rel)
      let st: Awaited<ReturnType<typeof fs.stat>>
      try {
        st = await fs.stat(abs)
      } catch {
        if (cache.delete(rel)) {
          cleanupReverseDeps(rel)
          try { await api.storage.remove(ENTRY_PREFIX + rel) } catch {}
        }
        return
      }
      if (!st.isFile()) return

      const prev = cache.get(rel)
      if (!force && prev && prev.mtimeMs === st.mtimeMs && prev.size === st.size) {
        // Cache hit
        if (metricsCollector) {
          metricsCollector.recordCacheHit()
        }
        return
      }

      // Cache miss - will need to summarize
      if (metricsCollector) {
        metricsCollector.recordCacheMiss()
      }

      // Per-extension max file size (falls back to global maxFileBytes)
      const ext = "." + extOf(rel)
      const maxBytes = opts.maxFileBytesByExt?.[ext] ?? opts.maxFileBytes
      if (st.size > maxBytes) {
        cleanupReverseDeps(rel)
        stats.skippedByRule++
        stats.skippedSummaries++
        await saveEntry(api, lk, {
          rel,
          size: st.size,
          mtimeMs: st.mtimeMs,
          summary: `${extOf(rel) || "binary"} file · ${st.size} bytes · too large to summarize`,
          symbols: [],
          imports: [],
          kind: "skipped",
          updatedAt: Date.now(),
        }, cache, opts, log)
        return
      }

      // Check if file is generated - skip summarization but include in tree
      if (filterCtx.isGenerated(rel)) {
        cleanupReverseDeps(rel)
        stats.skippedSummaries++
        await saveEntry(api, lk, {
          rel,
          size: st.size,
          mtimeMs: st.mtimeMs,
          summary: `${extOf(rel) || "generated"} file · ${st.size} bytes · generated file (not summarized)`,
          symbols: [],
          imports: [],
          kind: "generated",
          updatedAt: Date.now(),
        }, cache, opts, log)
        return
      }

      let content: string
      try {
        content = await fs.readFile(abs, "utf8")
      } catch {
        return
      }
      if (content.includes("\u0000")) {
        cleanupReverseDeps(rel)
        stats.skippedSummaries++
        await saveEntry(api, lk, {
          rel,
          size: st.size,
          mtimeMs: st.mtimeMs,
          summary: `${extOf(rel) || "binary"} file · ${st.size} bytes · binary content`,
          symbols: [],
          imports: [],
          kind: "skipped",
          updatedAt: Date.now(),
        }, cache, opts, log)
        return
      }

      let result: { summary: string; symbols: Array<{ name: string; kind?: string }>; imports: string[]; sections?: SummarySections } | undefined
      let kind: "outline" | "model" | "lsp" = "outline"

      const extKey = ext.slice(1)
      const fallbackChain = getFallbackChain(extKey, opts)
      const pref = opts.summarizerPreference ?? DEFAULT_OPTIONS.summarizerPreference!

      // Try each summarizer in the fallback chain
      for (const summarizer of fallbackChain) {
        let m: { summary: string; symbols: Array<{ name: string; kind?: string }>; imports: string[]; sections?: SummarySections } | undefined

        if (summarizer === "model") {
          const modelResult = await modelSummary(rel, content, api, opts, log)
          if (modelResult) {
            m = { summary: modelResult.summary, symbols: modelResult.symbols.map(s => ({ name: s })), imports: [] }
            // Track model summarization cost
            if (modelResult.inputTokens && modelResult.outputTokens) {
              trackCost("model", modelResult.inputTokens, modelResult.outputTokens)
            }
          }
        } else if (summarizer === "lsp") {
          m = await lspSummarize(rel, content, api, opts, stats, log)
        } else if (summarizer === "outline") {
          m = await outlineSummarize(rel, content, opts, stats)
        }

        if (m) {
          result = m
          kind = summarizer
          break
        }

        // Log degradation if we're falling back from LSP
        if (summarizer === "lsp" && (pref.lspFallbackOnTimeout ?? true) && (pref.lspFallbackOnError ?? true)) {
          const nextIdx = fallbackChain.indexOf(summarizer) + 1
          const nextSummarizer = nextIdx < fallbackChain.length ? fallbackChain[nextIdx] : "outline"
          log(`lsp fallback: ${rel} - falling back to ${nextSummarizer}`)
        }
      }

      // Ultimate fallback to outline if all else fails
      if (!result) {
        result = await outlineSummarize(rel, content, opts, stats)
        kind = "outline"
      }

      const summarizeDurationMs = Date.now() - summarizeStartMs
      stats.summaries++
      if (kind === "model") stats.modelSummaries++
      else if (kind === "lsp") stats.modelSummaries++
      else stats.outlineSummaries++

      // Record summarize metrics
      if (metricsCollector) {
        metricsCollector.recordSummarize(summarizeDurationMs, kind)
      }

      // Update reverse dependency index
      if (opts.includeReverseDeps && result.imports.length > 0) {
        // Remove stale reverse deps for this file
        for (const [imported, importers] of reverseDeps) {
          if (importers.has(rel)) {
            importers.delete(rel)
            if (importers.size === 0) reverseDeps.delete(imported)
          }
        }
        // Add new reverse deps
        for (const imp of result.imports) {
          const existing = reverseDeps.get(imp)
          if (existing) {
            existing.add(rel)
          } else {
            reverseDeps.set(imp, new Set([rel]))
          }
        }
      }

      await saveEntry(api, lk, {
        rel,
        size: st.size,
        mtimeMs: st.mtimeMs,
        summary: result.summary,
        symbols: result.symbols as SymbolInfo[],
        imports: result.imports,
        kind,
        updatedAt: Date.now(),
        sections: result.sections,
      }, cache, opts, log)

      // Update cache size metric
      if (metricsCollector) {
        metricsCollector.setCacheSize(cache.size)
      }
    }

    async function summarizeMany(rels: string[], force: boolean): Promise<void> {
      if (rels.length === 0) return
      const semaphore = createSemaphore(opts.summarizeConcurrency)
      await Promise.all(
        rels.map((rel) => semaphore.acquire(() => summarize(rel, force))),
      )
    }

    function recordRecent(sessionID: string | undefined, rel: string): void {
      const target = sessionID ? getSessionRecent(sessionID) : recentGlobal
      target.set(rel, Date.now())
      if (target.size > 200) {
        const cutoff = Date.now() - 30 * 60_000
        for (const [key, at] of target) if (at < cutoff) target.delete(key)
      }
      pruneSessions()
    }

    function pruneSessions(): void {
      while (recentBySession.size > 128) {
        const oldest = recentBySession.keys().next().value
        if (oldest === undefined) break
        recentBySession.delete(oldest)
        injectionState.delete(oldest)
      }
      while (injectionState.size > 256) {
        const first = injectionState.keys().next().value
        if (first === undefined) break
        injectionState.delete(first)
      }
    }

    function getSessionRecent(sessionID: string): Map<string, number> {
      let m = recentBySession.get(sessionID)
      if (!m) {
        m = new Map()
        recentBySession.set(sessionID, m)
      }
      return m
    }

    const dirty = new Set<string>()

    function cleanupReverseDeps(rel: string): void {
      if (!opts.includeReverseDeps) return
      // Remove this file as an importer from all its imports
      for (const [imported, importers] of reverseDeps) {
        if (importers.has(rel)) {
          importers.delete(rel)
          if (importers.size === 0) reverseDeps.delete(imported)
        }
      }
    }

    function markDirty(sessionID: string | undefined, rel: string): void {
      if (disposed) return
      recordRecent(sessionID, rel)
      dirty.add(rel)
      if (flushTimer) clearTimeout(flushTimer)
      flushTimer = setTimeout(() => {
        flushTimer = undefined
        const batch = [...dirty]
        dirty.clear()
        stats.dirtyFlushes++
        void enqueue(async () => {
          for (const r of batch) await summarize(r, true)
          filesCache.at = 0
        }).catch((err) => log("flush failed", err))
      }, opts.debounceMs)
    }

    // ------------------------------------------------------------------ VCS

    async function getChangedFilesCached(): Promise<string[]> {
      if (vcsCache.at && Date.now() - vcsCache.at < 2_000) return vcsCache.files
      const files = await getChangedFiles(api, root, toRel)
      vcsCache = { at: Date.now(), files }
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

    // --------------------------------------------------------------- injection

    async function getInjection(sessionID: string | undefined): Promise<string> {
      if (opts.inject === "off" || broadRoot) return ""
      const key = sessionID ?? "<anonymous>"
      const changed = await getChangedFilesCached()
      const gitRepo = await detectGit()
      const needFresh = !filesCache.at || Date.now() - filesCache.at >= opts.treeTtlMs
      const changeSignal = dirty.size > 0 || changed.length > 0
      const files = !needFresh || (gitRepo && !changeSignal && filesCache.at > 0) ? filesCache.files : await listFiles(false)
      const rev = buildInjectionRev(files, changed, cache)
      const prev = injectionState.get(key)
      const sendFull =
        opts.injectStrategy === "always" ||
        !prev ||
        (opts.injectStrategy === "changed" && prev.rev !== rev)

      let text: string
      const injectionType = sendFull ? "full" : "digest"
      if (sendFull) {
        // Pass the cached tree (convert to immutable) to avoid rebuilding
        const tree = treeCache ? convertToImmutable(treeCache) : undefined
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

    // ------------------------------------------------------------------ setup

    await loadCache(api, lk, cache, log)
    void migrateLegacy(api, log).catch(() => undefined)

    if (!opts.enabled) {
      log("disabled")
      return async () => { disposed = true; setDisposed(true); if (flushTimer) clearTimeout(flushTimer) }
    }

    if (broadRoot && !opts.allowBroadRoot) {
      log(`broad root detected (${root}); disabling warmup and injection`)
    }

    if (opts.refreshOnWrite) {
      await api.tool.hook("execute.before", (event: any) => {
        if (disposed) return
        const tool = String(event?.tool ?? "").toLowerCase()
        if (!WRITE_TOOLS.has(tool)) return
        const rels = relsFromInput(event?.input)
        if (rels.length) {
          pendingWrites.push({ rels, sessionID: event?.sessionID })
          if (pendingWrites.length > 20) pendingWrites.shift()
        }
      })
      await api.tool.hook("execute.after", (event: any) => {
        if (disposed) return
        const tool = String(event?.tool ?? "").toLowerCase()
        if (!WRITE_TOOLS.has(tool)) return
        let rels = relsFromInput(event?.input)
        let sessionID: string | undefined = event?.sessionID
        if (!rels.length) {
          const popped = pendingWrites.shift()
          if (popped) {
            rels = popped.rels
            sessionID = sessionID ?? popped.sessionID
          }
        }
        for (const rel of rels) if (rel) markDirty(sessionID, rel)
      })
    }

    if (opts.inject !== "off" && !broadRoot) {
      await api.session.hook("context", async (event: any) => {
        try {
          const text = await getInjection(event?.sessionID)
          if (text) event.system.push({ type: "text", text })
        } catch (err) {
          log("injection failed", err)
          if (metricsCollector) {
            metricsCollector.recordError("injection")
          }
        }
      })
    }

    if (opts.warmupSummaries > 0 && !broadRoot) {
      void (async () => {
        try {
          const files = await listFiles(true)
          const changed = await getChangedFilesCached()
          let target: string[]
          if (changed.length) {
            target = changed.filter((f) => files.includes(f))
          } else {
            target = files
              .filter((f) => !f.includes("/") || /\.(ts|tsx|js|jsx|py|go|rs|java|kt|rb|php|cs|c|cpp|h)$/.test(f))
              .sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b))
          }
          for (const rel of target.slice(0, opts.warmupSummaries)) if (!cache.has(rel)) await summarize(rel, false)
          stats.warmups++
        } catch (err) {
          log("warmup failed", err)
          if (metricsCollector) {
            metricsCollector.recordError("warmup")
          }
        }
      })()
    }

    log(`ready v${VERSION} at ${root} (loc=${lk}${broadRoot ? ", broad" : ""})`)

    return async () => {
      disposed = true
      setDisposed(true)
      if (flushTimer) clearTimeout(flushTimer)
      if (costLogTimer) clearTimeout(costLogTimer)
      await shutdownMetrics()
    }
  },
})