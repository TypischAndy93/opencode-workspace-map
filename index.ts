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
import { promises as fs } from "node:fs"
import * as path from "node:path"
import * as os from "node:os"
import { createHash } from "node:crypto"

import { initializeMetrics, shutdownMetrics } from "./src/metrics/index.js"
import { createWorkspaceMapTool } from "./src/tool/index.js"
import { registerWatchCommand } from "./src/cli/index.js"
import { enqueue, setDisposed } from "./src/utils/enqueue.js"
import { hash, locKey, entryPrefix, LEGACY_PREFIX } from "./src/utils/hash.js"
import { flushPendingWrites } from "./src/storage/cache.js"

import { initializePlugin, type PluginContext } from "./src/setup.js"
import { createSummarizationEngine } from "./src/summarization-engine.js"
import { createInjectionEngine } from "./src/injection-engine.js"
import { createSessionManager } from "./src/session-manager.js"
import { createVCSIntegration } from "./src/vcs-integration.js"
import { createHooksManager } from "./src/hooks.js"
import { createWatchManager } from "./src/watch-manager.js"

const VERSION = "0.4.0"

export default Plugin.define({
  id: "workspace-map",
  async setup(ctx: Context): Promise<Cleanup> {
    // Initialize plugin and get context
    const { ctx: pluginCtx, cleanup: baseCleanup } = await initializePlugin(ctx)
    
    // Create engines
    const logFn = (...args: unknown[]) => { if (pluginCtx.opts.debug) console.error("[workspace-map]", ...args) }
    
    // Dirty set for tracking changed files (must be created before engines that reference it)
    const dirty = new Set<string>()
    
    const summarizationEngine = createSummarizationEngine(
      pluginCtx.api,
      pluginCtx.opts,
      pluginCtx.root,
      pluginCtx.locKey,
      pluginCtx.ENTRY_PREFIX,
      pluginCtx.cache,
      pluginCtx.reverseDeps,
      pluginCtx.stats,
      pluginCtx.filterCtx,
      logFn,
      pluginCtx.project
    )

    // Tree cache wrapper for mutation
    const treeCacheWrapper = { current: pluginCtx.treeCache }

    const injectionEngine = createInjectionEngine(
      pluginCtx.api,
      pluginCtx.opts,
      pluginCtx.root,
      pluginCtx.cache,
      pluginCtx.reverseDeps,
      pluginCtx.stats,
      pluginCtx.filterCtx,
      pluginCtx.broadRoot,
      pluginCtx.effectiveMaxFiles,
      pluginCtx.sessionsWithInitialWalk,
      logFn,
      pluginCtx.project,
      pluginCtx.filesCache,
      pluginCtx.vcsCache,
      treeCacheWrapper,
      summarizationEngine.summarizeMany,
      pluginCtx.recentBySession,
      pluginCtx.recentGlobal,
      pluginCtx.injectionState,
      pluginCtx.metricsCollector,
      { current: dirty }
    )

    // Set the PluginContext functions now that engines are created
    pluginCtx.listFiles = injectionEngine.listFiles
    pluginCtx.getChangedFilesCached = injectionEngine.getChangedFilesCached
    pluginCtx.summarizeMany = summarizationEngine.summarizeMany

    const vcsIntegration = createVCSIntegration(
      pluginCtx.api,
      pluginCtx.root,
      pluginCtx.vcsCache,
      logFn
    )

    const hooksManager = createHooksManager()

    // Create flush callback for session manager
    const flushCallback = async (rels: string[]) => {
      pluginCtx.stats.dirtyFlushes++
      for (const r of rels) await summarizationEngine.summarize(r, true)
      pluginCtx.filesCache.at = 0
    }

    const sessionManager = createSessionManager(
      pluginCtx.opts,
      pluginCtx.recentBySession,
      pluginCtx.recentGlobal,
      pluginCtx.injectionState,
      pluginCtx.sessionsWithInitialWalk,
      dirty,
      { current: pluginCtx.flushTimer },
      logFn,
      flushCallback
    )

    // Register tool EARLY (synchronously) so agent sees it immediately
    if (pluginCtx.opts.registerTool) {
      const regMsg = "registering workspace_map tool (early)"
      console.error(regMsg)
      ;(async () => { try { await fs.appendFile(path.join(os.tmpdir(), "wm-setup.log"), regMsg + "\n") } catch {} })()
      await pluginCtx.api.tool.transform((editor: any) => {
        editor.add(createWorkspaceMapTool(pluginCtx))
      })
    }

    // Register watch command
    if (pluginCtx.opts.watchEnabled) {
      registerWatchCommand(
        pluginCtx.api,
        pluginCtx.opts,
        pluginCtx.root,
        pluginCtx.cache,
        pluginCtx.stats,
        pluginCtx.reverseDeps,
        injectionEngine.listFiles,
        summarizationEngine.summarizeMany,
        logFn
      )
    }

    // Setup hooks
    const disposedRef = { current: false }
    hooksManager.setupRefreshOnWriteHook(
      pluginCtx.api,
      pluginCtx.opts,
      pluginCtx.root,
      disposedRef,
      pluginCtx.pendingWrites,
      sessionManager.markDirty,
      logFn
    )

    hooksManager.setupSessionContextHook(
      pluginCtx.api,
      pluginCtx.opts,
      pluginCtx.broadRoot,
      disposedRef,
      injectionEngine.getInjection,
      logFn,
      pluginCtx.metricsCollector
    )

    hooksManager.setupWarmup(
      pluginCtx.api,
      pluginCtx.opts,
      pluginCtx.broadRoot,
      disposedRef,
      injectionEngine.listFiles,
      injectionEngine.getChangedFilesCached,
      summarizationEngine.summarizeMany,
      pluginCtx.cache,
      pluginCtx.stats,
      logFn,
      pluginCtx.metricsCollector
    )

    // Start file watch manager if enabled
    let watchManager: ReturnType<typeof createWatchManager> | null = null
    if (pluginCtx.opts.watchEnabled) {
      watchManager = createWatchManager(
        {
          root: pluginCtx.root,
          cache: pluginCtx.cache,
          reverseDeps: pluginCtx.reverseDeps,
          listFiles: injectionEngine.listFiles,
          summarizeMany: summarizationEngine.summarizeMany,
          log: logFn,
          metricsCollector: pluginCtx.metricsCollector,
        },
        pluginCtx.opts
      )
      await watchManager.start()
    }

    // Start cost logging
    summarizationEngine.startCostLogging()

    if (pluginCtx.opts.debug) console.error(`[workspace-map] ready v${VERSION} at ${pluginCtx.root} (loc=${pluginCtx.locKey}${pluginCtx.broadRoot ? ", broad" : ""})`)

    // Return cleanup function
    return async () => {
      pluginCtx.disposed = true
      setDisposed(true)
      if (pluginCtx.flushTimer) clearTimeout(pluginCtx.flushTimer)
      if (pluginCtx.costLogTimer) clearTimeout(pluginCtx.costLogTimer)
      if (watchManager) watchManager.stop()
      summarizationEngine.stopCostLogging()
      injectionEngine.cleanup()
      await flushPendingWrites(pluginCtx.api, pluginCtx.locKey, pluginCtx.cache, pluginCtx.opts, logFn)
      await shutdownMetrics()
    }
  },
})