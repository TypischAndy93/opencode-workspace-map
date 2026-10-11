import { metrics, MetricAttributes, Meter } from "@opentelemetry/api"
import { MeterProvider, PeriodicExportingMetricReader, ConsoleMetricExporter } from "@opentelemetry/sdk-metrics"
import { resourceFromAttributes } from "@opentelemetry/resources"
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions"
import type { Options } from "../config/index.ts"

/**
 * OpenTelemetry metrics for workspace-map plugin observability.
 * Provides counters, histograms, and gauges for key operations.
 */
export class MetricsCollector {
  private meter: Meter
  private enabled: boolean
  private meterProvider: MeterProvider | null = null

  // Counters
  private filesWalked: ReturnType<Meter["createCounter"]> | null = null
  private filesSummarized: ReturnType<Meter["createCounter"]> | null = null
  private cacheHits: ReturnType<Meter["createCounter"]> | null = null
  private cacheMisses: ReturnType<Meter["createCounter"]> | null = null
  private injections: ReturnType<Meter["createCounter"]> | null = null
  private errors: ReturnType<Meter["createCounter"]> | null = null

  // Histograms
  private walkDuration: ReturnType<Meter["createHistogram"]> | null = null
  private summarizeDuration: ReturnType<Meter["createHistogram"]> | null = null
  private injectionSize: ReturnType<Meter["createHistogram"]> | null = null

  // Gauges (using UpDownCounter for gauge-like behavior)
  private cacheSize: ReturnType<Meter["createUpDownCounter"]> | null = null
  private activeSummarizations: ReturnType<Meter["createUpDownCounter"]> | null = null

  constructor(opts: Options) {
    this.enabled = opts.metrics?.enabled ?? false
    this.meter = metrics.getMeter("workspace-map", "0.4.0")
  }

  async initialize(): Promise<void> {
    if (!this.enabled) return

    const { MeterProvider, PeriodicExportingMetricReader } = await import("@opentelemetry/sdk-metrics")
    const { ConsoleMetricExporter } = await import("@opentelemetry/sdk-metrics")
    const { OTLPMetricExporter } = await import("@opentelemetry/exporter-metrics-otlp-proto")

    const exporter = this.getExporter()
    const intervalMs = 60000 // default

    const reader = new PeriodicExportingMetricReader({
      exporter,
      exportIntervalMillis: intervalMs,
    })

    const resource = resourceFromAttributes({
        [SemanticResourceAttributes.SERVICE_NAME]: "workspace-map",
        [SemanticResourceAttributes.SERVICE_VERSION]: "0.4.0",
      })

    this.meterProvider = new MeterProvider({
      resource,
      readers: [reader],
    })

    // Set as global meter provider
    metrics.setGlobalMeterProvider(this.meterProvider)

    this.createInstruments()
  }

  private getExporter(): any {
    // Dynamic import to avoid loading if not enabled
    if (this.enabled) {
      // Default to console exporter
      const { ConsoleMetricExporter } = require("@opentelemetry/sdk-metrics")
      return new ConsoleMetricExporter()
    }
    return null
  }

  private createInstruments(): void {
    if (!this.enabled) return

    // Counters
    this.filesWalked = this.meter.createCounter("workspace_map.files_walked", {
      description: "Total number of files discovered during walk",
      unit: "{file}",
    })

    this.filesSummarized = this.meter.createCounter("workspace_map.files_summarized", {
      description: "Total number of files successfully summarized",
      unit: "{file}",
    })

    this.cacheHits = this.meter.createCounter("workspace_map.cache_hits", {
      description: "Number of cache hits",
      unit: "{hit}",
    })

    this.cacheMisses = this.meter.createCounter("workspace_map.cache_misses", {
      description: "Number of cache misses",
      unit: "{miss}",
    })

    this.injections = this.meter.createCounter("workspace_map.injections", {
      description: "Number of context injections performed",
      unit: "{injection}",
    })

    this.errors = this.meter.createCounter("workspace_map.errors", {
      description: "Number of errors encountered",
      unit: "{error}",
    })

    // Histograms
    this.walkDuration = this.meter.createHistogram("workspace_map.walk_duration", {
      description: "Duration of filesystem walk operations",
      unit: "ms",
    })

    this.summarizeDuration = this.meter.createHistogram("workspace_map.summarize_duration", {
      description: "Duration of file summarization operations",
      unit: "ms",
    })

    this.injectionSize = this.meter.createHistogram("workspace_map.injection_size", {
      description: "Size of injected context in characters",
      unit: "By",
    })

    // Gauges (using UpDownCounter)
    this.cacheSize = this.meter.createUpDownCounter("workspace_map.cache_size", {
      description: "Current number of entries in cache",
      unit: "{entry}",
    })

    this.activeSummarizations = this.meter.createUpDownCounter("workspace_map.active_summarizations", {
      description: "Number of currently active summarization operations",
      unit: "{operation}",
    })
  }

  // Public methods for recording metrics

  recordWalk(fileCount: number, durationMs: number): void {
    if (!this.enabled) return
    this.filesWalked?.add(fileCount)
    this.walkDuration?.record(durationMs)
  }

  recordSummarize(durationMs: number, kind: string): void {
    if (!this.enabled) return
    this.filesSummarized?.add(1, { kind })
    this.summarizeDuration?.record(durationMs, { kind })
  }

  recordCacheHit(): void {
    if (!this.enabled) return
    this.cacheHits?.add(1)
  }

  recordCacheMiss(): void {
    if (!this.enabled) return
    this.cacheMisses?.add(1)
  }

  recordInjection(sizeChars: number, type: "full" | "digest"): void {
    if (!this.enabled) return
    this.injections?.add(1, { type })
    this.injectionSize?.record(sizeChars, { type })
  }

  recordError(type: string): void {
    if (!this.enabled) return
    this.errors?.add(1, { type })
  }

  setCacheSize(size: number): void {
    if (!this.enabled) return
    this.cacheSize?.add(size)
  }

  incrementActiveSummarizations(): void {
    if (!this.enabled) return
    this.activeSummarizations?.add(1)
  }

  decrementActiveSummarizations(): void {
    if (!this.enabled) return
    this.activeSummarizations?.add(-1)
  }

  async shutdown(): Promise<void> {
    if (this.meterProvider) {
      await this.meterProvider.shutdown()
      this.meterProvider = null
    }
  }
}

// Singleton instance
let metricsCollector: MetricsCollector | null = null

export function getMetricsCollector(opts?: Options): MetricsCollector | null {
  if (!opts?.metrics?.enabled) return null
  if (!metricsCollector) {
    metricsCollector = new MetricsCollector(opts!)
  }
  return metricsCollector
}

export async function initializeMetrics(opts: Options): Promise<MetricsCollector | null> {
  const collector = getMetricsCollector(opts)
  if (collector) {
    await collector.initialize()
  }
  return collector
}

export function shutdownMetrics(): Promise<void> {
  return metricsCollector?.shutdown() ?? Promise.resolve()
}