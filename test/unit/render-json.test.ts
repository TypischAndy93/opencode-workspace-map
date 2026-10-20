import { describe, it, expect } from "vitest"
import { renderJson } from "../../src/injection/render.js"
import { DEFAULT_OPTIONS, type Options, type FileEntry, type Stats } from "../../src/config/index.js"

function createTestOpts(overrides: Partial<Options> = {}): Options {
  return { ...DEFAULT_OPTIONS, ...overrides }
}

function createTestStats(): Stats {
  return {
    summaries: 0, skippedByRule: 0, walks: 0, fullInjections: 0, digestInjections: 0,
    dirtyFlushes: 0, warmups: 0, sessions: 0, files: 0, outlineSummaries: 0,
    modelSummaries: 0, skippedSummaries: 0, lastWalkMs: 0, lastInjectionChars: 0, lastInjectionAt: 0
  }
}

function createMockCache(): Map<string, FileEntry> {
  const cache = new Map<string, FileEntry>()
  const now = Date.now()
  cache.set("src/a.ts", {
    rel: "src/a.ts", size: 100, mtimeMs: now, summary: "Summary for a",
    symbols: [{ name: "foo", kind: "function" }], imports: ["./b"],
    kind: "outline", updatedAt: now,
  })
  cache.set("src/b.ts", {
    rel: "src/b.ts", size: 200, mtimeMs: now, summary: "Summary for b",
    symbols: [{ name: "bar", kind: "const" }], imports: [],
    kind: "outline", updatedAt: now,
  })
  return cache
}

function createMockReverseDeps(): Map<string, Set<string>> {
  const revDeps = new Map<string, Set<string>>()
  revDeps.set("./b", new Set(["src/a.ts"]))
  return revDeps
}

describe("renderJson", () => {
  it("produces valid JSON structure", () => {
    const files = ["src/a.ts", "src/b.ts"]
    const cache = createMockCache()
    const reverseDeps = createMockReverseDeps()
    const opts = createTestOpts()
    const stats = createTestStats()

    const output = renderJson(files, [], cache, reverseDeps, opts, false, stats)
    const parsed = JSON.parse(output)

    expect(parsed.version).toBeDefined()
    expect(parsed.totalFiles).toBe(2)
    expect(parsed.changedFiles).toBe(0)
    expect(parsed.changed).toEqual([])
    // tree is a TreeNode object (not an array)
    expect(parsed.tree).toBeDefined()
    expect(parsed.notes["src/a.ts"]).toBeDefined()
    expect(parsed.notes["src/a.ts"].summary).toBe("Summary for a")
    expect(parsed.notes["src/a.ts"].symbols).toEqual([{ name: "foo", kind: "function" }])
    expect(parsed.notes["src/a.ts"].imports).toEqual(["./b"])
    expect(parsed.notes["src/a.ts"].size).toBe(100)
    expect(typeof parsed.notes["src/a.ts"].updatedAt).toBe("number")
    // reverseDeps key is "./b" → ["src/a.ts"], so src/a.ts is not a key → importedBy is []
    expect(parsed.notes["src/a.ts"].importedBy).toEqual([])
    expect(parsed.stats.summaries).toBe(0)
    expect(parsed.stats.walks).toBe(0)
    expect(parsed.stats.files).toBe(0)
  })

  it("includes changed files list", () => {
    const files = ["src/a.ts", "src/b.ts"]
    const cache = createMockCache()
    const reverseDeps = new Map<string, Set<string>>()
    const opts = createTestOpts()

    const output = renderJson(files, ["src/a.ts"], cache, reverseDeps, opts, false)
    const parsed = JSON.parse(output)

    expect(parsed.changedFiles).toBe(1)
    expect(parsed.changed).toEqual(["src/a.ts"])
  })

  it("includes reverseDeps when includeReverseDeps is true", () => {
    const files = ["src/a.ts"]
    const cache = createMockCache()
    const reverseDeps = createMockReverseDeps()
    const opts = createTestOpts({ includeReverseDeps: true })

    const output = renderJson(files, [], cache, reverseDeps, opts, false)
    const parsed = JSON.parse(output)

    expect(parsed.reverseDeps).toBeDefined()
    expect(parsed.reverseDeps["./b"]).toEqual(["src/a.ts"])
  })

  it("omits reverseDeps when includeReverseDeps is false", () => {
    const files = ["src/a.ts"]
    const cache = createMockCache()
    const reverseDeps = createMockReverseDeps()
    const opts = createTestOpts({ includeReverseDeps: false })

    const output = renderJson(files, [], cache, reverseDeps, opts, false)
    const parsed = JSON.parse(output)

    expect(parsed.reverseDeps).toBeUndefined()
  })

  it("handles files not in cache", () => {
    const files = ["src/a.ts", "src/missing.ts"]
    const cache = createMockCache()
    const reverseDeps = new Map<string, Set<string>>()
    const opts = createTestOpts()

    const output = renderJson(files, [], cache, reverseDeps, opts, false)
    const parsed = JSON.parse(output)

    expect(parsed.notes["src/a.ts"]).toBeDefined()
    expect(parsed.notes["src/missing.ts"]).toBeUndefined()
  })

  it("includes broadRoot indicator", () => {
    const files = ["src/a.ts"]
    const cache = createMockCache()
    const reverseDeps = new Map<string, Set<string>>()
    const opts = createTestOpts()

    const output = renderJson(files, [], cache, reverseDeps, opts, true)
    const parsed = JSON.parse(output)

    expect(parsed.broadRoot).toBe(true)
  })

  it("omits stats when not provided", () => {
    const files = ["src/a.ts"]
    const cache = createMockCache()
    const reverseDeps = new Map<string, Set<string>>()
    const opts = createTestOpts()

    const output = renderJson(files, [], cache, reverseDeps, opts, false)
    const parsed = JSON.parse(output)

    expect(parsed.stats).toBeUndefined()
  })
})
