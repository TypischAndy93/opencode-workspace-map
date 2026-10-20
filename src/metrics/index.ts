import { metrics, MetricAttributes, Meter } from "@opentelemetry/api"
import { MeterProvider, PeriodicExportingMetricReader, ConsoleMetricExporter } from "@opentelemetry/sdk-metrics"
import type { PushMetricExporter } from "@opentelemetry/sdk-metrics"
import { resourceFromAttributes } from "@opentelemetry/resources"
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions"
import type { Options } from "../config/index.ts"
import { VERSION } from "../version.ts"

/**
 * No-op metrics collector for testing or when metrics are disabled.
 */
export class NoOpMetricsCollector {
  readonly enabled = false
  
  recordWalk(_fileCount: number, _durationMs: number): void {}
  recordSummarize(_durationMs: number, _kind: string): void {}
  recordCacheHit(): void {}
  recordCacheMiss(): void {}
  recordInjection(_sizeChars: number, _type: "full" | "digest"): void {}
  recordError(_type: string): void {}
  recordWatchBatch(_fileCount: number): void {}
  setCacheSize(_size: number): void {}
  incrementActiveSummarizations(): void {}
  decrementActiveSummarizations(): void {}
  async shutdown(): Promise<void> {}
}

/**
 * OpenTelemetry metrics for workspace-map plugin observability.
 * Provides counters, histograms, and gauges for key operations.
 */
export class MetricsCollector {
  private meter: Meter
  private enabled: boolean
  private readonly exportIntervalMs: number
  private meterProvider: MeterProvider | null = null
  private opts: Options

  // Counters
  private filesWalked: ReturnType<Meter["createCounter"]> | null = null
  private filesSummarized: ReturnType<Meter["createCounter"]> | null = null
  private cacheHits: ReturnType<Meter["createCounter"]> | null = null
  private cacheMisses: ReturnType<Meter["createCounter"]> | null = null
  private injections: ReturnType<Meter["createCounter"]> | null = null
  private errors: ReturnType<Meter["createCounter"]> | null = null
  private watchBatches: ReturnType<Meter["createCounter"]> | null = null

  // Histograms
  private walkDuration: ReturnType<Meter["createHistogram"]> | null = null
  private summarizeDuration: ReturnType<Meter["createHistogram"]> | null = null
  private injectionSize: ReturnType<Meter["createHistogram"]> | null = null

  // Gauges (using UpDownCounter for gauge-like behavior)
  private cacheSize: ReturnType<Meter["createUpDownCounter"]> | null = null
  private activeSummarizations: ReturnType<Meter["createUpDownCounter"]> | null = null

  constructor(opts: Options) {
    this.enabled = opts.metrics?.enabled ?? false
    this.exportIntervalMs = opts.metrics?.intervalMs ?? 60000
    this.meter = metrics.getMeter("workspace-map", VERSION)
    this.opts = opts
  }

  async initialize(): Promise<void> {
    if (!this.enabled) return

    const { MeterProvider, PeriodicExportingMetricReader } = await import("@opentelemetry/sdk-metrics")
    const { ConsoleMetricExporter } = await import("@opentelemetry/sdk-metrics")
    const { OTLPMetricExporter } = await import("@opentelemetry/exporter-metrics-otlp-proto")

    const exporterType = this.opts?.metrics?.exporter ?? "console"
    let exporter: PushMetricExporter | null = null

    if (exporterType === "otlp") {
      exporter = new OTLPMetricExporter()
    } else {
      exporter = new ConsoleMetricExporter()
    }

    const intervalMs = this.exportIntervalMs

    const reader = new PeriodicExportingMetricReader({
      exporter: exporter as PushMetricExporter,
      exportIntervalMillis: intervalMs,
    })

    const resource = resourceFromAttributes({
        [SemanticResourceAttributes.SERVICE_NAME]: "workspace-map",
        [SemanticResourceAttributes.SERVICE_VERSION]: VERSION,
      })

    this.meterProvider = new MeterProvider({
      resource,
      readers: [reader],
    })

    // Set as global meter provider
    metrics.setGlobalMeterProvider(this.meterProvider)

    this.createInstruments()
  }

  private getExporter(): PushMetricExporter | null {
    // Deprecated: exporter selection now happens in initialize() where async imports are available.
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

    this.watchBatches = this.meter.createCounter("workspace_map.watch_batches", {
      description: "Number of watch change batches processed",
      unit: "{batch}",
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

  recordWatchBatch(fileCount: number): void {
    if (!this.enabled) return
    this.watchBatches?.add(fileCount)
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

// Factory function - no singleton
export function createMetricsCollector(opts: Options): MetricsCollector | NoOpMetricsCollector {
  if (!opts.metrics?.enabled) {
    return new NoOpMetricsCollector()
  }
  return new MetricsCollector(opts)
}

export async function initializeMetrics(collector: MetricsCollector | NoOpMetricsCollector): Promise<void> {
  if (collector instanceof MetricsCollector) {
    await collector.initialize()
  }
}

export async function shutdownMetrics(collector: MetricsCollector | NoOpMetricsCollector): Promise<void> {
  await collector.shutdown()
}

// Type guard
export function isMetricsEnabled(collector: MetricsCollector | NoOpMetricsCollector): collector is MetricsCollector {
  return collector instanceof MetricsCollector
}