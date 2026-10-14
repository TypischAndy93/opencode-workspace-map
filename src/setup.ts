import type { Context, Cleanup } from "@opencode/plugin/promise/plugin"
import type { Options, ProjectInfo, Stats, FileEntry, SummarizerKind, LogFn } from "./config/index.ts"
import { promises as fs } from "node:fs"
import * as path from "node:path"
import * as os from "node:os"
import { loadSidecarConfig, validateOptions, detectProject, autoTuneOptions, detectOptimalWalkConcurrency, mergeOptions } from "./config/index.js"
import { initializeMetrics, shutdownMetrics, getMetricsCollector } from "./metrics/index.js"
import { createFilterContext } from "./fs/filter.js"
import { loadCache, migrateLegacy } from "./storage/cache.js"
import { createWorkspaceMapTool } from "./tool/index.js"
import { registerWatchCommand, registerCLICommands } from "./cli/index.js"
import { setDisposed } from "./utils/enqueue.js"
import { locKey, entryPrefix } from "./utils/hash.js"
import { createSemaphore } from "./utils/semaphore.js"
import { globToRegex } from "./fs/gitignore.js"

const VERSION = "0.4.0"

export interface PluginContext {
  api: Context
  opts: Options
  root: string
  locKey: string
  ENTRY_PREFIX: string
  cache: Map<string, FileEntry>
  reverseDeps: Map<string, Set<string>>
  recentBySession: Map<string, Map<string, number>>
  recentGlobal: Map<string, number>
  injectionState: Map<string, { rev: string }>
  stats: Stats
  filesCache: { at: number; files: string[] }
  vcsCache: { at: number; files: string[] }
  modelRefCache: { providerID: string; id: string } | undefined
  flushTimer: ReturnType<typeof setTimeout> | undefined
  costLogTimer: ReturnType<typeof setTimeout> | undefined
  disposed: boolean
  gitignore: ReturnType<typeof import("./fs/gitignore.js").compileGitignore> | undefined
  pendingWrites: { rels: string[]; sessionID?: string }[]
  treeCache: ReturnType<typeof import("./injection/render.js").createMutableNode> | null
  sessionsWithInitialWalk: Set<string>
  ignoreSet: Set<string>
  ignoreGlobs: RegExp[]
  includeGlobs: RegExp[]
  broadRoot: boolean
  effectiveMaxFiles: number
  project: ProjectInfo
  metricsCollector: ReturnType<typeof getMetricsCollector> | null
  filterCtx: ReturnType<typeof createFilterContext>
  listFiles: (force: boolean) => Promise<string[]>
  getChangedFilesCached: () => Promise<string[]>
  summarizeMany: (rels: string[], force: boolean) => Promise<void>
}

export async function initializePlugin(api: Context): Promise<{ ctx: PluginContext; cleanup: Cleanup }> {
  const startMsg = `[workspace-map] SETUP START ${JSON.stringify({ location: api.location?.directory, options: api.options })}`
  console.error(startMsg)
  try {
    await fs.appendFile(path.join(os.tmpdir(), "wm-setup.log"), startMsg + "\n")
  } catch {}

  const sidecar = await loadSidecarConfig()
  // Merge defaults + sidecar config + plugin options, ensuring DEFAULT_IGNORES
  // (node_modules, dist, build, coverage, vendor, …) is always applied.
  const opts: Options = mergeOptions(sidecar, api.options as Partial<Options> | undefined)

  const root: string = path.resolve(api.location?.directory ?? api.location?.project?.directory ?? process.cwd())

  // Auto-tune options based on project type
  const project = await detectProject(root)
  const logFn: LogFn = (...args: unknown[]) => { if (opts.debug) console.error("[workspace-map]", ...args) }
  autoTuneOptions(opts, project, (msg) => logFn(msg))
  
  // Auto-detect optimal walk concurrency if set to "auto"
  if (opts.walkConcurrency === "auto" && opts.autoTune) {
    const optimalConcurrency = await detectOptimalWalkConcurrency(root, (msg) => logFn(msg))
    opts.walkConcurrency = optimalConcurrency
  }

  validateOptions(opts, (msg) => logFn(msg))

  const lk = locKey(root)
  const ENTRY_PREFIX = entryPrefix(lk)

  // State variables
  const cache = new Map<string, FileEntry>()
  const reverseDeps = new Map<string, Set<string>>()
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
    lspSummaries: 0,
    skippedSummaries: 0,
    lastWalkMs: 0,
    lastInjectionChars: 0,
    lastInjectionAt: 0,
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
  let costLogTimer: ReturnType<typeof setTimeout> | undefined
  let disposed = false
  let gitignore: ReturnType<typeof import("./fs/gitignore.js").compileGitignore> | undefined
  let pendingWrites: { rels: string[]; sessionID?: string }[] = []

  // Tree cache for incremental updates
  let treeCache: ReturnType<typeof import("./injection/render.js").createMutableNode> | null = null

  // Track sessions that have completed their initial walk
  const sessionsWithInitialWalk = new Set<string>()

  // Initialize metrics if enabled
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

  const home = path.resolve(os.homedir())
  const broadRoot =
    root.toLowerCase() === home.toLowerCase() ||
    path.parse(root).root.toLowerCase() === root.toLowerCase() ||
    root.toLowerCase() === path.dirname(home).toLowerCase()
  const effectiveMaxFiles = broadRoot && !opts.allowBroadRoot ? Math.min(opts.maxFiles, 800) : opts.maxFiles

  const filterCtx = await createFilterContext(opts, stats, root, effectiveMaxFiles, logFn)

  // Register CLI commands
  registerCLICommands({
    api,
    opts,
    root,
    cache,
    stats,
    reverseDeps,
    listFiles: async () => [], // placeholder, will be set later
    summarizeMany: async () => {}, // placeholder
    getChangedFilesCached: async () => [], // placeholder
    log: logFn,
    project,
    broadRoot,
    entryPrefix: ENTRY_PREFIX,
    filesCache,
    vcsCache,
    filterCtx,
    treeCache,
  })

  // Load cache
  await loadCache(api, lk, cache, logFn)
  void migrateLegacy(api, logFn).catch(() => undefined)

  const ctx: PluginContext = {
    api,
    opts,
    root,
    locKey: lk,
    ENTRY_PREFIX,
    cache,
    reverseDeps,
    recentBySession,
    recentGlobal,
    injectionState,
    stats,
    filesCache,
    vcsCache,
    modelRefCache,
    flushTimer,
    costLogTimer,
    disposed,
    gitignore,
    pendingWrites,
    treeCache,
    sessionsWithInitialWalk,
    ignoreSet,
    ignoreGlobs,
    includeGlobs,
    broadRoot,
    effectiveMaxFiles,
    project,
    metricsCollector,
    filterCtx,
    // These will be set after engines are created in index.ts
    listFiles: async () => { throw new Error("listFiles not initialized") },
    getChangedFilesCached: async () => { throw new Error("getChangedFilesCached not initialized") },
    summarizeMany: async () => { throw new Error("summarizeMany not initialized") },
  }

  if (!opts.enabled) {
    return {
      ctx,
      cleanup: async () => { 
        ctx.disposed = true; 
        setDisposed(true); 
        if (ctx.flushTimer) clearTimeout(ctx.flushTimer) 
        if (ctx.costLogTimer) clearTimeout(ctx.costLogTimer)
        await shutdownMetrics()
      }
    }
  }

  if (broadRoot && !opts.allowBroadRoot) {
    if (opts.debug) console.error(`[workspace-map] broad root detected (${root}); disabling warmup and injection`)
  }

  return { ctx, cleanup: async () => {} } // actual cleanup will be set by hooks
}