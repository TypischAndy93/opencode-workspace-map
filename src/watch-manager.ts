import type { Options, FileEntry, Logger } from "./config/index.ts"
import { globToRegex } from "./fs/gitignore.ts"
import * as path from "node:path"
import * as fs from "node:fs/promises"
import * as fsSync from "node:fs"

/** Debounce strategy: "fixed" uses a constant delay, "adaptive" adapts to how
 *  often a file changes, "coalesce" groups rapid changes within a window. */
export type DebounceStrategy = "fixed" | "adaptive" | "coalesce"

/**
 * Per-invocation overrides. These take precedence over `opts.watch` and are
 * used by the `workspace-map:watch` CLI command (which exposes them as input).
 */
export interface WatchRuntimeOptions {
  debounceMs?: number
  pattern?: string
  once?: boolean
  batchChanges?: boolean
  batchTimeoutMs?: number
  smartDebounce?: boolean
  minDebounceMs?: number
  maxDebounceMs?: number
  debounceStrategy?: DebounceStrategy
  coalesceWindowMs?: number
  onBatchStart?: (count: number) => void
  onBatchComplete?: (count: number, durationMs: number) => void
  /** Run the watcher as a detached daemon process (CLI command only). */
  daemon?: boolean
  /** Write the daemon PID to this file (used with --daemon). */
  pidFile?: string
}

/** Minimal metrics surface the manager uses (kept structural to avoid a
 *  hard dependency on the metrics package). */
export interface MetricsCollectorLike {
  recordWatchBatch?: (count: number) => void
}

export interface WatchManagerDeps {
  root: string
  cache: Map<string, FileEntry>
  reverseDeps: Map<string, Set<string>>
  listFiles: (force: boolean) => Promise<string[]>
  summarizeMany: (rels: string[], force: boolean) => Promise<void>
  log: Logger
  metricsCollector?: MetricsCollectorLike | null
}

export interface WatchManager {
  start(): Promise<void>
  stop(): void
  isRunning(): boolean
  /** Resolves once `stop()` has been called (used for `once` mode / SIGINT). */
  whenStopped(): Promise<void>
  /** Temporarily suspend change handling (e.g. during active agent execution). */
  pause(): void
  /** Resume change handling after a pause. */
  resume(): void
  isPaused(): boolean
}

/** Polling fallback interval (ms). */
const POLL_INTERVAL = 5000

/**
 * The single watch implementation for the plugin. Both the automatic
 * background watcher (started during `setup` when `watchEnabled` is true) and
 * the manual `workspace-map:watch` CLI command delegate to this factory.
 */
export function createWatchManager(
  deps: WatchManagerDeps,
  opts: Options,
  runtime: WatchRuntimeOptions = {}
): WatchManager {
  const { root, cache, reverseDeps, listFiles, summarizeMany, log, metricsCollector } = deps

  const watchConfig = opts.watch ?? {}
  const debounceMs = runtime.debounceMs ?? watchConfig.debounceMs ?? opts.debounceMs ?? 750
  const batchChanges = runtime.batchChanges ?? watchConfig.batchChanges ?? true
  const batchTimeoutMs = runtime.batchTimeoutMs ?? watchConfig.batchTimeoutMs ?? 100
  const patternStr = runtime.pattern ?? opts.watchPattern
  const pattern = patternStr ? new RegExp(globToRegex(patternStr)) : null
  const once = runtime.once ?? false
  const smartDebounce = runtime.smartDebounce ?? watchConfig.smartDebounce ?? false
  const minDebounceMs = runtime.minDebounceMs ?? watchConfig.minDebounceMs ?? 50
  const maxDebounceMs = runtime.maxDebounceMs ?? watchConfig.maxDebounceMs ?? 2000
  const debounceStrategy = runtime.debounceStrategy ?? watchConfig.debounceStrategy ?? "fixed"
  const coalesceWindowMs = runtime.coalesceWindowMs ?? watchConfig.coalesceWindowMs ?? 300
  const onBatchStart = runtime.onBatchStart
  const onBatchComplete = runtime.onBatchComplete
  const daemon = runtime.daemon ?? false
  const pidFile = runtime.pidFile

  let disposed = false
  let started = false
  let paused = false
  let watcher: ReturnType<typeof import("node:fs").watch> | null = null
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let lastKnownFiles: Set<string> | null = null

  // Pending debounce timers (non-batch mode)
  const pending = new Map<string, ReturnType<typeof setTimeout>>()
  // Batch state
  let batchTimer: ReturnType<typeof setTimeout> | null = null
  const pendingBatch = new Set<string>()

  // Adaptive / coalesce state
  const changeHistory = new Map<string, number[]>()
  const coalesceTimer = new Map<string, ReturnType<typeof setTimeout>>()
  let currentDebounceMs = debounceMs

  // Lifecycle signalling
  let resolveStopped: (() => void) | null = null
  const stoppedPromise = new Promise<void>((resolve) => {
    resolveStopped = resolve
  })

  async function getCurrentFiles(): Promise<Set<string>> {
    const files = await listFiles(true)
    return new Set(files)
  }

  function flushBatch() {
    if (batchTimer) {
      clearTimeout(batchTimer)
      batchTimer = null
    }
    if (pendingBatch.size === 0) return

    const batch = [...pendingBatch]
    pendingBatch.clear()

    const startMs = Date.now()
    onBatchStart?.(batch.length)
    log.info("watch: batch summarizing", { count: batch.length, files: batch })
    metricsCollector?.recordWatchBatch?.(batch.length)

    summarizeMany(batch, true)
      .catch((err) => log.error("watch: batch summarize failed", { error: err }))
      .finally(() => {
        onBatchComplete?.(batch.length, Date.now() - startMs)
      })

    if (once) {
      stop()
      log.info("Watch completed (once mode)")
    }
  }

  /** Calculate adaptive debounce time based on per-file change frequency. */
  function calculateAdaptiveDebounce(rel: string): number {
    const history = changeHistory.get(rel) ?? []
    const now = Date.now()

    // Keep only recent history (last 10 seconds)
    const recent = history.filter((t) => now - t < 10000)
    changeHistory.set(rel, recent)

    if (recent.length === 0) return debounceMs

    let totalInterval = 0
    for (let i = 1; i < recent.length; i++) {
      totalInterval += recent[i] - recent[i - 1]
    }
    const avgInterval = totalInterval / Math.max(1, recent.length - 1)

    // Faster changes = longer debounce to coalesce; slow changes = minimum.
    let adaptiveMs = debounceMs
    if (avgInterval < 200) {
      adaptiveMs = Math.min(maxDebounceMs, debounceMs * 3)
    } else if (avgInterval < 500) {
      adaptiveMs = Math.min(maxDebounceMs, debounceMs * 2)
    } else if (avgInterval > 1000) {
      adaptiveMs = Math.max(minDebounceMs, debounceMs)
    }
    return Math.max(minDebounceMs, Math.min(maxDebounceMs, adaptiveMs))
  }

  /** Coalesce rapid changes to the same file within a time window. */
  function scheduleCoalesce(rel: string) {
    const existing = coalesceTimer.get(rel)
    if (existing) clearTimeout(existing)

    const timeout = setTimeout(() => {
      coalesceTimer.delete(rel)
      if (batchChanges) {
        pendingBatch.add(rel)
        if (!batchTimer) {
          batchTimer = setTimeout(flushBatch, batchTimeoutMs)
        }
      } else {
        const debounceTime = smartDebounce ? calculateAdaptiveDebounce(rel) : currentDebounceMs
        const pendingTimeout = setTimeout(async () => {
          pending.delete(rel)
          if (cache.has(rel)) {
            log.debug("watch: file changed", { rel })
            await summarizeMany([rel], true)
          }
          if (once) {
            stop()
            log.info("Watch completed (once mode)")
          }
        }, debounceTime)
        pending.set(rel, pendingTimeout)
      }
    }, coalesceWindowMs)

    coalesceTimer.set(rel, timeout)
  }

  function scheduleBatch(rel: string) {
    const now = Date.now()
    const history = changeHistory.get(rel) ?? []
    history.push(now)
    changeHistory.set(rel, history)

    if (smartDebounce && debounceStrategy === "adaptive") {
      currentDebounceMs = calculateAdaptiveDebounce(rel)
    }

    switch (debounceStrategy) {
      case "coalesce":
        scheduleCoalesce(rel)
        break
      case "adaptive":
      case "fixed":
      default:
        pendingBatch.add(rel)

        if (batchChanges) {
          if (!batchTimer) {
            batchTimer = setTimeout(flushBatch, batchTimeoutMs)
          }
        } else {
          const existing = pending.get(rel)
          if (existing) clearTimeout(existing)
          const debounceTime = smartDebounce ? currentDebounceMs : debounceMs
          const timeout = setTimeout(async () => {
            pending.delete(rel)
            if (cache.has(rel)) {
              log.debug("watch: file changed", { rel })
              await summarizeMany([rel], true)
            }
            if (once) {
              stop()
              log.info("Watch completed (once mode)")
            }
          }, debounceTime)
          pending.set(rel, timeout)
        }
        break
    }
  }

  async function handleFileChange(rel: string, eventType: string) {
    if (disposed) return
    if (paused) return
    if (pattern && !pattern.test(rel)) return

    const absPath = path.join(root, rel)

    try {
      await fs.stat(absPath)

      if (eventType === "change" || eventType === "rename") {
        scheduleBatch(rel)
      }
    } catch (err: unknown) {
      const errnoErr = err as NodeJS.ErrnoException
      if (errnoErr.code === "ENOENT") {
        if (cache.delete(rel)) {
          log.debug("watch: file deleted", { rel })
          for (const [, importers] of reverseDeps.entries()) {
            if (importers.has(rel)) importers.delete(rel)
          }
        }
      }
    }
  }

  async function startPolling() {
    if (disposed) return
    lastKnownFiles = await getCurrentFiles()

    pollTimer = setInterval(async () => {
      if (disposed) return

      try {
        const currentFiles = await getCurrentFiles()

        for (const rel of currentFiles) {
          if (!lastKnownFiles!.has(rel)) {
            log.debug("watch: new file detected via polling", { rel })
            scheduleBatch(rel)
          }
        }

        for (const rel of lastKnownFiles!) {
          if (!currentFiles.has(rel)) {
            if (cache.delete(rel)) {
              log.debug("watch: deleted file detected via polling", { rel })
              for (const [, importers] of reverseDeps.entries()) {
                if (importers.has(rel)) importers.delete(rel)
              }
            }
          }
        }

        lastKnownFiles = currentFiles
      } catch (err) {
        log.error("watch: polling error", { error: err })
      }
    }, POLL_INTERVAL)
  }

  /** Write the current process PID to pidFile and set up signal handlers for
   *  graceful shutdown. Used by daemon mode so the watcher can be managed as a
   *  background process. */
  function daemonize(pidFile: string | undefined, log: Logger): void {
    if (!pidFile) return
    try {
      fsSync.writeFileSync(pidFile, String(process.pid), "utf8")
      log.info("watch: daemon pid file written", { pidFile, pid: process.pid })
    } catch (err) {
      log.warn("watch: could not write pid file", { pidFile, error: err })
    }

    const cleanup = () => {
      try {
        fsSync.unlinkSync(pidFile)
      } catch {
        // ignore - file may already be gone
      }
    }

    process.once("SIGTERM", () => {
      log.info("watch: received SIGTERM, stopping")
      cleanup()
      process.exit(0)
    })
    process.once("SIGINT", () => {
      log.info("watch: received SIGINT, stopping")
      cleanup()
      process.exit(0)
    })
    process.on("exit", cleanup)
  }

  async function start(): Promise<void> {
    if (disposed || started) return
    started = true

    // Daemon mode: detach into a background child process and write a PID file.
    if (daemon) {
      await daemonize(pidFile, log)
      // After daemonize, the parent process exits; the child continues below.
    }

    const { watch } = await import("node:fs")

    try {
      watcher = watch(root, { recursive: true }, (eventType: string, filename: string | null) => {
        if (!filename) return
        if (eventType === "change" || eventType === "rename") {
          const rel = filename
          if (pattern && !pattern.test(rel)) return
          handleFileChange(rel, eventType).catch((err) => log.error("watch: handler failed", { error: err }))
        }
      })
    } catch (err) {
      // fs.watch(recursive) is unsupported on some platforms (e.g. Linux) —
      // fall back to polling-only rather than crashing.
      log.warn("watch: fs.watch unavailable, falling back to polling only", { error: err })
      watcher = null
    }

    await startPolling()

    log.info("watch: watching", {
      root,
      pattern: pattern?.source,
      once,
      batchChanges,
      debounceMs,
      debounceStrategy,
    })
  }

  function stop() {
    if (disposed) return
    disposed = true
    // Clean up pid file on stop
    if (pidFile) {
      try {
        fsSync.unlinkSync(pidFile)
      } catch {
        // ignore - file may already be gone
      }
    }
    if (batchTimer) clearTimeout(batchTimer)
    if (pollTimer) clearInterval(pollTimer)
    for (const t of pending.values()) clearTimeout(t)
    for (const t of coalesceTimer.values()) clearTimeout(t)
    pending.clear()
    pendingBatch.clear()
    coalesceTimer.clear()
    changeHistory.clear()
    if (watcher) {
      try {
        watcher.close()
      } catch {
        // ignore
      }
      watcher = null
    }
    log.info("watch: stopped")
    if (resolveStopped) {
      resolveStopped()
      resolveStopped = null
    }
  }

  function isRunning(): boolean {
    return started && !disposed
  }

  function whenStopped(): Promise<void> {
    return stoppedPromise
  }

  function pause(): void {
    paused = true
    log.info("watch: paused")
  }

  function resume(): void {
    paused = false
    log.info("watch: resumed")
  }

  function isPaused(): boolean {
    return paused
  }

  return { start, stop, isRunning, isPaused, pause, resume, whenStopped }
}
