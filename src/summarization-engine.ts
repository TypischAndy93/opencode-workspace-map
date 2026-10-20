import type { Context, Cleanup } from "@opencode/plugin/promise/plugin"
import type { Options, FileEntry, Stats, SymbolInfo, SummarySections, SummarizerKind, ProjectInfo, Logger } from "./config/index.ts"
import { promises as fs } from "node:fs"
import * as path from "node:path"
import { getFallbackChain, DEFAULT_OPTIONS, entryPrefix } from "./config/index.js"
import { extOf, isSecret } from "./utils/file.js"
import { outlineSummarize, modelSummary, lspSummarize } from "./summarizers/index.js"
import { saveEntry, pruneCache, scheduleBatchWrite, flushPendingWrites } from "./storage/cache.js"
import { createSemaphore } from "./utils/semaphore.js"
import { PriorityQueue, SummarizationPriority } from "./utils/priority-queue.js"
import { MetricsCollector, NoOpMetricsCollector } from "./metrics/index.js"
import { isCancelledError, raceCancellation } from "./utils/cancellation.js"

export interface SummarizationEngine {
  summarize(rel: string, force: boolean, signal?: AbortSignal): Promise<void>
  summarizeMany(rels: string[], force: boolean, priority?: SummarizationPriority, signal?: AbortSignal): Promise<void>
  trackCost(kind: SummarizerKind, inputTokens: number, outputTokens: number): void
  startCostLogging(): void
  stopCostLogging(): void
  shutdown(): Promise<void>
}

export function createSummarizationEngine(
  api: Context,
  opts: Options,
  root: string,
  locKey: string,
  ENTRY_PREFIX: string,
  cache: Map<string, FileEntry>,
  reverseDeps: Map<string, Set<string>>,
  stats: Stats,
  filterCtx: ReturnType<typeof import("./fs/filter.js").createFilterContext>,
  log: Logger,
  project: ProjectInfo,
  metricsCollector: MetricsCollector | NoOpMetricsCollector
): SummarizationEngine {
  
  // Cost tracking
  let costLogTimer: ReturnType<typeof setTimeout> | undefined
  
  // LSP Response Caching
  const lspCache = new Map<string, { symbols: Array<{ name: string; kind?: string }>; imports: string[]; sections?: SummarySections; at: number; mtime: number; size: number }>()
  const lspCacheTtlMs = opts.lspCacheTtlMs ?? 300_000 // 5 minutes default
  
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
        log.info("Cost summary", { 
          totalCostUsd: stats.totalCostUsd.toFixed(6),
          totalInputTokens: stats.totalInputTokens,
          totalOutputTokens: stats.totalOutputTokens,
          bySummarizer: {
            outline: stats.costBySummarizer.outline.costUsd.toFixed(6),
            model: stats.costBySummarizer.model.costUsd.toFixed(6),
            lsp: stats.costBySummarizer.lsp.costUsd.toFixed(6),
          }
        })
      }
    }, interval)
  }

  function stopCostLogging(): void {
    if (costLogTimer) clearTimeout(costLogTimer)
  }

  function isSecretFile(rel: string): boolean {
    return isSecret(rel)
  }

  function cleanupReverseDeps(rel: string): void {
    if (!opts.includeReverseDeps) return
    for (const [imported, importers] of reverseDeps) {
      if (importers.has(rel)) {
        importers.delete(rel)
        if (importers.size === 0) reverseDeps.delete(imported)
      }
    }
  }

  async function summarize(rel: string, force: boolean, signal?: AbortSignal): Promise<void> {
    const summarizeStartMs = Date.now()
    const abs = path.join(root, rel)
    let st: Awaited<ReturnType<typeof fs.stat>>
    try {
      st = await fs.stat(abs)
    } catch (err) {
      // File doesn't exist or stat failed - remove from cache
      if (cache.delete(rel)) {
        cleanupReverseDeps(rel)
        try {
          await api.storage.remove(entryPrefix + rel)
        } catch (storageErr) {
          log.error("storage remove failed during cleanup", { rel, error: storageErr })
        }
      }
      log.error("stat failed", { rel, error: err })
      return
    }
    if (!st.isFile()) return

    const prev = cache.get(rel)
    if (!force && prev && prev.mtimeMs === st.mtimeMs && prev.size === st.size) {
      // Cache hit
      metricsCollector.recordCacheHit()
      return
    }

    // Cache miss
    metricsCollector.recordCacheMiss()

    // Per-extension max file size
    const ext = "." + extOf(rel)
    const maxBytes = opts.maxFileBytesByExt?.[ext] ?? opts.maxFileBytes
    if (st.size > maxBytes) {
      cleanupReverseDeps(rel)
      stats.skippedByRule++
      stats.skippedSummaries++
      await scheduleBatchWrite(api, locKey, {
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

    // Check if file is generated
    if (filterCtx.isGenerated(rel)) {
      cleanupReverseDeps(rel)
      stats.skippedSummaries++
      await scheduleBatchWrite(api, locKey, {
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
    } catch (err) {
      log.error("read file failed", { rel, error: err })
      return
    }
    if (content.includes("\u0000")) {
      cleanupReverseDeps(rel)
      stats.skippedSummaries++
      await scheduleBatchWrite(api, locKey, {
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
      // Check for cancellation
      signal?.throwIfAborted?.()
      
      let m: { summary: string; symbols: Array<{ name: string; kind?: string }>; imports: string[]; sections?: SummarySections } | undefined

      if (summarizer === "model") {
        const modelResult = await raceCancellation(
          modelSummary(rel, content, api, opts, log),
          signal ?? noopAbortSignal
        )
        if (modelResult) {
          m = { summary: modelResult.summary, symbols: modelResult.symbols.map(s => ({ name: s })), imports: [] }
          if (modelResult.inputTokens && modelResult.outputTokens) {
            trackCost("model", modelResult.inputTokens, modelResult.outputTokens)
          }
        }
      } else if (summarizer === "lsp") {
        // Check LSP cache first
        const cacheKey = `${rel}:${st.mtimeMs}:${st.size}`
        const cached = lspCache.get(cacheKey)
        if (cached && Date.now() - cached.at < lspCacheTtlMs) {
          // Cache hit - use cached LSP results
          m = {
            summary: "", // Will be generated from symbols/imports
            symbols: cached.symbols,
            imports: cached.imports,
            sections: cached.sections,
          }
          log.debug("lsp cache hit", { rel })
        } else {
          // Cache miss - call LSP
          m = await raceCancellation(
            lspSummarize(rel, content, api, opts, stats, log),
            signal ?? noopAbortSignal
          )
          if (m) {
            // Store in cache
            lspCache.set(cacheKey, {
              symbols: m.symbols,
              imports: m.imports,
              sections: m.sections,
              at: Date.now(),
              mtime: st.mtimeMs,
              size: st.size,
            })
            log.debug("lsp cache miss (stored)", { rel })
          }
        }
      } else if (summarizer === "outline") {
        m = await raceCancellation(
          outlineSummarize(rel, content, opts, stats),
          signal ?? noopAbortSignal
        )
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
        log.warn("lsp fallback", { rel, fallbackTo: nextSummarizer })
      }
    }

    // Ultimate fallback to outline if all else fails
    if (!result) {
      result = await raceCancellation(
        outlineSummarize(rel, content, opts, stats),
        signal ?? noopAbortSignal
      )
      kind = "outline"
    }

    const summarizeDurationMs = Date.now() - summarizeStartMs
    stats.summaries++
    if (kind === "model") stats.modelSummaries++
    else if (kind === "lsp") stats.lspSummaries++
    else stats.outlineSummaries++

    // Record summarize metrics
    metricsCollector.recordSummarize(summarizeDurationMs, kind)

    // Update reverse dependency index
    if (opts.includeReverseDeps && result.imports.length > 0) {
      for (const [imported, importers] of reverseDeps) {
        if (importers.has(rel)) {
          importers.delete(rel)
          if (importers.size === 0) reverseDeps.delete(imported)
        }
      }
      for (const imp of result.imports) {
        const existing = reverseDeps.get(imp)
        if (existing) {
          existing.add(rel)
        } else {
          reverseDeps.set(imp, new Set([rel]))
        }
      }
    }

    await scheduleBatchWrite(api, locKey, {
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
    metricsCollector.setCacheSize(cache.size)
  }

  // Priority queue for summarization jobs
  const priorityQueue = new PriorityQueue(opts.summarizeConcurrency, () => {
    log.info("Summarization queue drained")
  })

  let currentSignal: AbortSignal | undefined

  // Set the execute function for the priority queue
  priorityQueue.setExecuteFn(async (job) => {
    if (currentSignal?.aborted) return
    await summarize(job.rel, job.force, currentSignal)
  })

  async function summarizeMany(rels: string[], force: boolean, priority: SummarizationPriority = "background", signal?: AbortSignal): Promise<void> {
    if (rels.length === 0) return
    
    currentSignal = signal
    
    const jobs = rels.map((rel) => ({
      rel,
      force,
      priority,
      timestamp: Date.now(),
    }))
    
    priorityQueue.enqueueBatch(jobs)
    
    // Wait for all jobs to complete
    await waitForQueueDrain(priorityQueue)
  }

  function waitForQueueDrain(queue: PriorityQueue): Promise<void> {
    return new Promise((resolve, reject) => {
      const checkDrain = () => {
        if (currentSignal?.aborted) {
          reject(new DOMException("Operation cancelled", "AbortError"))
          return
        }
        if (queue.isEmpty()) {
          resolve()
        } else {
          setTimeout(checkDrain, 10)
        }
      }
      checkDrain()
    })
  }

  async function shutdown(): Promise<void> {
    stopCostLogging()
    // Clear the queue
    priorityQueue.clear()
  }

  return {
    summarize,
    summarizeMany,
    trackCost,
    startCostLogging,
    stopCostLogging,
    shutdown,
  }
}