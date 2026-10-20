import type { Context } from "@opencode/plugin/promise/plugin"
import type { Options, FileEntry, Stats, Logger } from "./config/index.ts"
import type { MetricsCollector, NoOpMetricsCollector } from "./metrics/index.ts"
import { relsFromInput, type ToolInput } from "./utils/tool-input.js"
import { WRITE_TOOLS } from "./config/index.js"

type MetricsCollectorLike = MetricsCollector | NoOpMetricsCollector

interface ToolExecuteEvent {
  tool?: unknown
  input?: ToolInput
  sessionID?: string
}

interface SessionContextEvent {
  sessionID?: string
  system?: Array<{ type: string; text: string }>
}

export interface HooksManager {
  setupRefreshOnWriteHook(
    api: Context,
    opts: Options,
    root: string,
    disposed: { current: boolean },
    pendingWrites: { rels: string[]; sessionID?: string }[],
    markDirty: (sessionID: string | undefined, rel: string, debounceMs: number) => void,
    log: Logger
  ): void

  /** Wire watcher pause/resume around write tool execution so the watcher is
   *  paused while the agent is actively editing files. */
  setWatchPauseResume(pauseWatch: () => void, resumeWatch: () => void): void

  setupSessionContextHook(
    api: Context,
    opts: Options,
    broadRoot: boolean,
    disposed: { current: boolean },
    getInjection: (sessionID: string | undefined) => Promise<string>,
    log: Logger,
    metricsCollector: MetricsCollectorLike
  ): void

  setupWarmup(
    api: Context,
    opts: Options,
    broadRoot: boolean,
    disposed: { current: boolean },
    listFiles: (force: boolean) => Promise<string[]>,
    getChangedFilesCached: () => Promise<string[]>,
    summarizeMany: (rels: string[], force: boolean) => Promise<void>,
    cache: Map<string, FileEntry>,
    stats: Stats,
    log: Logger,
    metricsCollector: MetricsCollectorLike
  ): void
}

export function createHooksManager(): HooksManager {
  let pauseWatch: (() => void) | undefined
  let resumeWatch: (() => void) | undefined

  return {
    setupRefreshOnWriteHook(api, opts, root, disposed, pendingWrites, markDirty, log) {
      if (!opts.refreshOnWrite) return

      api.tool.hook("execute.before", (event) => {
        if (disposed.current) return
        const tool = String(event?.tool ?? "").toLowerCase()
        if (!WRITE_TOOLS.has(tool)) return
        // Pause watcher during active agent write execution
        pauseWatch?.()
        const rels = relsFromInput(event?.input as ToolInput, root)
        if (rels.length) {
          pendingWrites.push({ rels, sessionID: event?.sessionID })
          if (pendingWrites.length > 20) pendingWrites.shift()
        }
      })

      api.tool.hook("execute.after", (event) => {
        if (disposed.current) return
        const tool = String(event?.tool ?? "").toLowerCase()
        if (!WRITE_TOOLS.has(tool)) return
        // Resume watcher after agent write execution completes
        resumeWatch?.()
        let rels = relsFromInput(event?.input as ToolInput, root)
        let sessionID: string | undefined = event?.sessionID
        if (!rels.length) {
          const popped = pendingWrites.shift()
          if (popped) {
            rels = popped.rels
            sessionID = sessionID ?? popped.sessionID
          }
        }
        for (const rel of rels) if (rel) markDirty(sessionID, rel, opts.debounceMs)
      })
    },

    setWatchPauseResume(p: () => void, r: () => void) {
      pauseWatch = p
      resumeWatch = r
    },

    setupSessionContextHook(api, opts, broadRoot, disposed, getInjection, log, metricsCollector) {
      if (opts.inject === "off" || broadRoot) return

      log.debug("registering session.context hook")
      api.session.hook("context", async (event: SessionContextEvent) => {
        if (disposed.current) return
        try {
          const text = await getInjection(event?.sessionID)
          if (text) {
            event.system?.push({ type: "text", text })
          }
        } catch (err) {
          log.error("injection failed", { error: err })
          if (metricsCollector) {
            metricsCollector.recordError("injection")
          }
        }
      })
    },

    setupWarmup(api, opts, broadRoot, disposed, listFiles, getChangedFilesCached, summarizeMany, cache, stats, log, metricsCollector) {
      if (opts.warmupSummaries <= 0 || broadRoot) return

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
          for (const rel of target.slice(0, opts.warmupSummaries)) if (!cache.has(rel)) await summarizeMany([rel], false)
          stats.warmups++
        } catch (err) {
          log.error("warmup failed", { error: err })
          if (metricsCollector) {
            metricsCollector.recordError("warmup")
          }
        }
      })()
    },
  }
}