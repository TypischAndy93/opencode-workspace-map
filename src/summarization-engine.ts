import type { Context, Cleanup } from "@opencode/plugin/promise/plugin"
import type { Options, FileEntry, Stats, SymbolInfo, SummarySections, SummarizerKind, ProjectInfo } from "./config/index.ts"
import { promises as fs } from "node:fs"
import * as path from "node:path"
import { extOf, getFallbackChain, DEFAULT_OPTIONS, SECRET_EXT, SECRET_STEM, SECRET_STEM_EXT, BINARY_EXT, CODE_EXT, DATA_EXT, entryPrefix } from "./config/index.js"
import { outlineSummarize, modelSummary, lspSummarize } from "./summarizers/index.js"
import { saveEntry, pruneCache } from "./storage/cache.js"
import { createSemaphore } from "./utils/semaphore.js"
import { PriorityQueue, SummarizationPriority } from "./utils/priority-queue.js"

export interface SummarizationEngine {
  summarize(rel: string, force: boolean): Promise<void>
  summarizeMany(rels: string[], force: boolean, priority?: SummarizationPriority): Promise<void>
  trackCost(kind: SummarizerKind, inputTokens: number, outputTokens: number): void
  startCostLogging(): void
  stopCostLogging(): void
}

export type LogFn = (...args: unknown[]) => void

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
  log: LogFn,
  project: ProjectInfo
): SummarizationEngine {
  
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

  function isSecret(rel: string): boolean {
    const base = (rel.split("/").pop() ?? rel).toLowerCase()
    if (base === ".env" || base.startsWith(".env.") || base.startsWith(".env-")) return true
    const ext = "." + extOf(base)
    if (SECRET_EXT.has(ext)) return true
    const stem = base.includes(".") ? base.slice(0, base.lastIndexOf(".")) : base
    if (SECRET_STEM.test(stem)) return ext === "." || SECRET_STEM_EXT.has(ext)
    return false
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

  async function summarize(rel: string, force: boolean): Promise<void> {
    const summarizeStartMs = Date.now()
    const abs = path.join(root, rel)
    let st: Awaited<ReturnType<typeof fs.stat>>
    try {
      st = await fs.stat(abs)
    } catch {
      if (cache.delete(rel)) {
        cleanupReverseDeps(rel)
        try { await api.storage.remove(entryPrefix + rel) } catch {}
      }
      return
    }
    if (!st.isFile()) return

    const prev = cache.get(rel)
    if (!force && prev && prev.mtimeMs === st.mtimeMs && prev.size === st.size) {
      // Cache hit
      const metricsCollector = (globalThis as any).__workspaceMapMetricsCollector
      if (metricsCollector) {
        metricsCollector.recordCacheHit()
      }
      return
    }

    // Cache miss
    const metricsCollector = (globalThis as any).__workspaceMapMetricsCollector
    if (metricsCollector) {
      metricsCollector.recordCacheMiss()
    }

    // Per-extension max file size
    const ext = "." + extOf(rel)
    const maxBytes = opts.maxFileBytesByExt?.[ext] ?? opts.maxFileBytes
    if (st.size > maxBytes) {
      cleanupReverseDeps(rel)
      stats.skippedByRule++
      stats.skippedSummaries++
      await saveEntry(api, locKey, {
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
      await saveEntry(api, locKey, {
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
      await saveEntry(api, locKey, {
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
    else if (kind === "lsp") stats.lspSummaries++
    else stats.outlineSummaries++

    // Record summarize metrics
    if (metricsCollector) {
      metricsCollector.recordSummarize(summarizeDurationMs, kind)
    }

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

    await saveEntry(api, locKey, {
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

  // Priority queue for summarization jobs
  const priorityQueue = new PriorityQueue(opts.summarizeConcurrency, () => {
    log("Summarization queue drained")
  })

  // Set the execute function for the priority queue
  priorityQueue.setExecuteFn(async (job) => {
    await summarize(job.rel, job.force)
  })

  async function summarizeMany(rels: string[], force: boolean, priority: SummarizationPriority = "background"): Promise<void> {
    if (rels.length === 0) return
    
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
    return new Promise((resolve) => {
      const checkDrain = () => {
        if (queue.isEmpty()) {
          resolve()
        } else {
          setTimeout(checkDrain, 10)
        }
      }
      checkDrain()
    })
  }

  return {
    summarize,
    summarizeMany,
    trackCost,
    startCostLogging,
    stopCostLogging,
  }
}