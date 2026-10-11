import type { Context } from "@opencode/plugin/promise/plugin"
import type { Options, FileEntry, Stats } from "./config/index.ts"
import { relsFromInput } from "./utils/tool-input.js"
import { WRITE_TOOLS } from "./config/index.js"

export type LogFn = (...args: unknown[]) => void

export interface HooksManager {
  setupRefreshOnWriteHook(
    api: Context,
    opts: Options,
    root: string,
    disposed: { current: boolean },
    pendingWrites: { rels: string[]; sessionID?: string }[],
    markDirty: (sessionID: string | undefined, rel: string, debounceMs: number) => void,
    log: LogFn
  ): void

  setupSessionContextHook(
    api: Context,
    opts: Options,
    broadRoot: boolean,
    disposed: { current: boolean },
    getInjection: (sessionID: string | undefined) => Promise<string>,
    log: LogFn,
    metricsCollector: any
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
    log: LogFn,
    metricsCollector: any
  ): void
}

export function createHooksManager(): HooksManager {
  return {
    setupRefreshOnWriteHook(api, opts, root, disposed, pendingWrites, markDirty, log) {
      if (!opts.refreshOnWrite) return

      api.tool.hook("execute.before", (event: any) => {
        if (disposed.current) return
        const tool = String(event?.tool ?? "").toLowerCase()
        if (!WRITE_TOOLS.has(tool)) return
        const rels = relsFromInput(event?.input, root)
        if (rels.length) {
          pendingWrites.push({ rels, sessionID: event?.sessionID })
          if (pendingWrites.length > 20) pendingWrites.shift()
        }
      })

      api.tool.hook("execute.after", (event: any) => {
        if (disposed.current) return
        const tool = String(event?.tool ?? "").toLowerCase()
        if (!WRITE_TOOLS.has(tool)) return
        let rels = relsFromInput(event?.input, root)
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

    setupSessionContextHook(api, opts, broadRoot, disposed, getInjection, log, metricsCollector) {
      if (opts.inject === "off" || broadRoot) return

      if (opts.debug) console.error("[workspace-map] registering session.context hook")
      api.session.hook("context", async (event: any) => {
        if (disposed.current) return
        try {
          const text = await getInjection(event?.sessionID)
          if (text) {
            event.system.push({ type: "text", text })
          }
        } catch (err) {
          log("injection failed", err)
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
          log("warmup failed", err)
          if (metricsCollector) {
            metricsCollector.recordError("warmup")
          }
        }
      })()
    },
  }
}