import { describe, it, expect } from "vitest"
import { createWorkspaceMapTool } from "../../src/tool/index.js"
import type { PluginContext, FileEntry, Stats, Options, ProjectInfo } from "../../src/config/index.js"
import { DEFAULT_OPTIONS } from "../../src/config/index.js"

function makeCache(): Map<string, FileEntry> {
  const cache = new Map<string, FileEntry>()
  const now = Date.now()
  cache.set("src/a.ts", {
    rel: "src/a.ts", size: 100, mtimeMs: now,
    summary: "Summary for a",
    symbols: [{ name: "foo", kind: "function" }],
    imports: ["./b"],
    kind: "outline",
    updatedAt: now,
  })
  return cache
}

function makeStats(overrides: Partial<Stats> = {}): Stats {
  return {
    summaries: 10, skippedByRule: 2, walks: 5, fullInjections: 3, digestInjections: 7,
    dirtyFlushes: 1, warmups: 2, sessions: 4, files: 10, outlineSummaries: 8,
    modelSummaries: 1, lspSummaries: 1, skippedSummaries: 0, lastWalkMs: 100,
    lastInjectionChars: 500, lastInjectionAt: Date.now(),
    totalInputTokens: 1000, totalOutputTokens: 500, totalCostUsd: 0.001,
    costBySummarizer: {
      outline: { inputTokens: 800, outputTokens: 400, costUsd: 0.0008 },
      model: { inputTokens: 100, outputTokens: 50, costUsd: 0.0001 },
      lsp: { inputTokens: 100, outputTokens: 50, costUsd: 0.0001 },
    },
    ...overrides,
  }
}

function makeToolCtx(cache: Map<string, FileEntry>, stats: Stats): PluginContext {
  return {
    api: {} as any,
    opts: { ...DEFAULT_OPTIONS },
    root: "/test-root",
    locKey: "testkey",
    ENTRY_PREFIX: "loc/testkey/file/",
    cache,
    reverseDeps: new Map(),
    recentBySession: new Map(),
    recentGlobal: new Map(),
    injectionState: new Map(),
    stats,
    filesCache: { at: 0, files: [] },
    vcsCache: { at: 0, files: [] },
    modelRefCache: undefined,
    flushTimer: undefined,
    costLogTimer: undefined,
    disposed: false,
    gitignore: undefined,
    pendingWrites: [],
    treeCache: null,
    sessionsWithInitialWalk: new Set(),
    ignoreSet: new Set(),
    ignoreGlobs: [],
    includeGlobs: [],
    broadRoot: false,
    effectiveMaxFiles: 3000,
    project: { isMonorepo: false, monorepoType: null, packages: [], primaryLanguage: null, framework: null, packageManager: null, hasTypeScript: false, hasTests: false },
    metricsCollector: { recordCacheHit: () => {}, recordCacheMiss: () => {}, recordSummarize: () => {}, setCacheSize: () => {}, recordWalk: () => {}, recordInjection: () => {}, recordError: () => {}, recordWatchBatch: () => {} } as any,
    filterCtx: {} as any,
    listFiles: async () => [],
    getChangedFilesCached: async () => [],
    summarizeMany: async () => {},
    logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, child: () => ({} as any), setLevel: () => {}, getLevel: () => "info" },
    correlationId: "test-cid",
  } as any
}

async function execHealth(tool: any, stats: Stats) {
  return JSON.parse((await tool.execute({ action: "health" }, {})).content)
}

describe("health action", () => {
  const cache = makeCache()

  it("returns ok status for healthy plugin", async () => {
    const stats = makeStats({ lastWalkMs: 100, summaries: 10, skippedSummaries: 0 })
    const tool = createWorkspaceMapTool(makeToolCtx(cache, stats))
    const res = await execHealth(tool, stats)
    expect(res.action).toBe("health")
    expect(res.status).toBe("ok")
    expect(res.issues).toEqual([])
    expect(res.cache.entries).toBe(1)
    expect(res.cache.summaries).toBe(10)
    expect(res.walk.lastWalkMs).toBe(100)
    expect(res.memory.rssMb).toBeGreaterThan(0)
    expect(res.summaries.total).toBe(10)
  })

  it("returns warning status for slow walk", async () => {
    const stats = makeStats({ lastWalkMs: 8000 }) // above warning 5000ms, below critical 15000ms
    const tool = createWorkspaceMapTool(makeToolCtx(cache, stats))
    const res = await execHealth(tool, stats)
    expect(res.status).toBe("warning")
    expect(res.issues.length).toBeGreaterThan(0)
    expect(res.issues[0]).toContain("walk duration")
  })

  it("returns critical status for very slow walk", async () => {
    const stats = makeStats({ lastWalkMs: 20000 }) // above critical 15000ms
    const tool = createWorkspaceMapTool(makeToolCtx(cache, stats))
    const res = await execHealth(tool, stats)
    expect(res.status).toBe("critical")
    expect(res.issues.length).toBeGreaterThan(0)
  })

  it("returns critical status for low cache hit rate", async () => {
    // 1 summary + 9 skipped = 10% hit rate, below critical 40%
    const stats = makeStats({ summaries: 1, skippedSummaries: 9, lastWalkMs: 100 })
    const tool = createWorkspaceMapTool(makeToolCtx(cache, stats))
    const res = await execHealth(tool, stats)
    expect(res.status).toBe("critical")
    expect(res.issues.some((i: string) => i.includes("cache hit rate"))).toBe(true)
  })

  it("includes memory usage info", async () => {
    const stats = makeStats()
    const tool = createWorkspaceMapTool(makeToolCtx(cache, stats))
    const res = await execHealth(tool, stats)
    expect(res.memory.rssMb).toBeGreaterThan(0)
    expect(res.memory.heapUsedMb).toBeGreaterThan(0)
    expect(res.memory.heapTotalMb).toBeGreaterThan(0)
  })

  it("includes cost tracking info", async () => {
    const stats = makeStats({ totalCostUsd: 0.001234567 })
    const tool = createWorkspaceMapTool(makeToolCtx(cache, stats))
    const res = await execHealth(tool, stats)
    expect(res.cost.totalCostUsd).toBeCloseTo(0.001235, 5)
    expect(res.cost.totalInputTokens).toBe(1000)
    expect(res.cost.totalOutputTokens).toBe(500)
  })

  it("includes per-summarizer counts", async () => {
    const stats = makeStats({ outlineSummaries: 5, modelSummaries: 3, lspSummaries: 2 })
    const tool = createWorkspaceMapTool(makeToolCtx(cache, stats))
    const res = await execHealth(tool, stats)
    expect(res.summaries.outline).toBe(5)
    expect(res.summaries.model).toBe(3)
    expect(res.summaries.lsp).toBe(2)
    expect(res.summaries.total).toBe(10)
  })

  it("includes session and warmup counts", async () => {
    const stats = makeStats({ sessions: 4, warmups: 2 })
    const tool = createWorkspaceMapTool(makeToolCtx(cache, stats))
    const res = await execHealth(tool, stats)
    expect(res.sessions).toBe(4)
    expect(res.warmup).toBe(2)
  })

  it("includes timestamp and version", async () => {
    const stats = makeStats()
    const tool = createWorkspaceMapTool(makeToolCtx(cache, stats))
    const res = await execHealth(tool, stats)
    expect(res.version).toBeDefined()
    expect(typeof res.timestamp).toBe("number")
  })
})
