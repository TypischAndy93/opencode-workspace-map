import { describe, it, expect } from "vitest"
import { createWorkspaceMapTool } from "../../src/tool/index.js"
import type { PluginContext, FileEntry, Stats, Options, ProjectInfo } from "../../src/config/index.js"
import { DEFAULT_OPTIONS } from "../../src/config/index.js"

function makeCache(entries: { rel: string; summary: string; symbols: Array<{ name: string; kind?: string; line?: number; character?: number }>; imports: string[] }[]): Map<string, FileEntry> {
  const cache = new Map<string, FileEntry>()
  const now = Date.now()
  for (const e of entries) {
    cache.set(e.rel, {
      rel: e.rel,
      size: e.summary.length,
      mtimeMs: now,
      summary: e.summary,
      symbols: e.symbols,
      imports: e.imports,
      kind: "outline",
      updatedAt: now,
    })
  }
  return cache
}

function makeReverseDeps(pairs: [string, string[]][]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>()
  for (const [imported, importers] of pairs) {
    map.set(imported, new Set(importers))
  }
  return map
}

function makeToolCtx(cache: Map<string, FileEntry>, reverseDeps: Map<string, Set<string>>): PluginContext {
  return {
    api: {} as any,
    opts: { ...DEFAULT_OPTIONS },
    root: "/test-root",
    locKey: "testkey",
    ENTRY_PREFIX: "loc/testkey/file/",
    cache,
    reverseDeps,
    recentBySession: new Map(),
    recentGlobal: new Map(),
    injectionState: new Map(),
    stats: {
      summaries: 0, skippedByRule: 0, walks: 0, fullInjections: 0, digestInjections: 0,
      dirtyFlushes: 0, warmups: 0, sessions: 0, files: 0, outlineSummaries: 0,
      modelSummaries: 0, lspSummaries: 0, skippedSummaries: 0, lastWalkMs: 0,
      lastInjectionChars: 0, lastInjectionAt: 0, totalInputTokens: 0, totalOutputTokens: 0, totalCostUsd: 0,
      costBySummarizer: { outline: { inputTokens: 0, outputTokens: 0, costUsd: 0 }, model: { inputTokens: 0, outputTokens: 0, costUsd: 0 }, lsp: { inputTokens: 0, outputTokens: 0, costUsd: 0 } },
    },
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

describe("symbol navigation", () => {
  const cache = makeCache([
    {
      rel: "src/user.ts",
      summary: "User service",
      symbols: [
        { name: "UserService", kind: "class", line: 10, character: 4 },
        { name: "register", kind: "method", line: 15, character: 6 },
        { name: "authenticate", kind: "method", line: 25, character: 6 },
      ],
      imports: ["./db"],
    },
    {
      rel: "src/db.ts",
      summary: "Database module",
      symbols: [
        { name: "connect", kind: "function", line: 5, character: 4 },
      ],
      imports: [],
    },
    {
      rel: "src/index.ts",
      summary: "Entry point",
      symbols: [{ name: "main", kind: "function", line: 1, character: 4 }],
      imports: ["./user"],
    },
  ])

  const reverseDeps = makeReverseDeps([
    ["src/user.ts", ["src/index.ts"]],
    ["src/db.ts", ["src/user.ts"]],
  ])

  const tool = createWorkspaceMapTool(makeToolCtx(cache, reverseDeps))

  describe("action: symbols", () => {
    it("returns all symbols matching query", async () => {
      const res = await tool.execute({ action: "symbols", query: "User" }, {})
      const data = JSON.parse(res.content)
      expect(data.action).toBe("symbols")
      expect(data.query).toBe("user")
      const names = data.symbols.map((s: any) => s.name)
      expect(names).toContain("UserService")
      expect(names).not.toContain("connect")
    })

    it("returns all symbols when no query", async () => {
      const res = await tool.execute({ action: "symbols" }, {})
      const data = JSON.parse(res.content)
      const names = data.symbols.map((s: any) => s.name)
      expect(names).toContain("UserService")
      expect(names).toContain("register")
      expect(names).toContain("connect")
      expect(names).toContain("main")
    })

    it("includes file and kind for each symbol", async () => {
      const res = await tool.execute({ action: "symbols" }, {})
      const data = JSON.parse(res.content)
      const userSvc = data.symbols.find((s: any) => s.name === "UserService")
      expect(userSvc.file).toBe("src/user.ts")
      expect(userSvc.kind).toBe("class")
    })

    it("caps results by limit", async () => {
      const res = await tool.execute({ action: "symbols", limit: 2 }, {})
      const data = JSON.parse(res.content)
      expect(data.symbols.length).toBe(2)
    })
  })

  describe("action: definition", () => {
    it("returns file location for known symbol", async () => {
      const res = await tool.execute({ action: "definition", symbol: "UserService" }, {})
      const data = JSON.parse(res.content)
      expect(data.found).toBe(true)
      expect(data.symbol).toBe("UserService")
      expect(data.file).toBe("src/user.ts")
      // line/character require LSP summarizer; outline mode provides file only
      expect(data.line).toBeDefined() // outline mode may not have line
    })

    it("returns not found for unknown symbol", async () => {
      const res = await tool.execute({ action: "definition", symbol: "NonExistent" }, {})
      const data = JSON.parse(res.content)
      expect(data.found).toBe(false)
      expect(data.message).toContain("not found")
    })

    it("requires symbol parameter", async () => {
      const res = await tool.execute({ action: "definition" }, {})
      expect(res.isError).toBe(true)
      expect(res.content).toContain("requires a 'symbol'")
    })
  })

  describe("action: references", () => {
    it("returns referencing files for known symbol", async () => {
      const res = await tool.execute({ action: "references", symbol: "UserService" }, {})
      const data = JSON.parse(res.content)
      expect(data.symbol).toBe("UserService")
      const files = data.references.map((r: any) => r.file)
      // src/user.ts defines it, src/index.ts imports ./user
      expect(files).toContain("src/user.ts")
      expect(files).toContain("src/index.ts")
    })

    it("returns empty for unknown symbol", async () => {
      const res = await tool.execute({ action: "references", symbol: "NonExistent" }, {})
      const data = JSON.parse(res.content)
      expect(data.found).toBe(false)
    })

    it("requires symbol parameter", async () => {
      const res = await tool.execute({ action: "references" }, {})
      expect(res.isError).toBe(true)
      expect(res.content).toContain("requires a 'symbol'")
    })
  })
})
