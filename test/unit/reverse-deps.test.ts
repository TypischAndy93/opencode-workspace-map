import { describe, it, expect } from "vitest"
import { buildInjectionRev } from "../../src/injection/builder.js"
import {
  type FileEntry,
  type Options,
  type Stats,
} from "../../src/config/index.js"
import { DEFAULT_OPTIONS } from "../../src/config/index.js"

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

function createMockCache(files: Record<string, { imports?: string[]; mtimeMs?: number }>): Map<string, FileEntry> {
  const cache = new Map<string, FileEntry>()
  const now = Date.now()
  for (const [rel, opts] of Object.entries(files)) {
    cache.set(rel, {
      rel,
      size: 100,
      mtimeMs: opts.mtimeMs ?? now,
      summary: `Summary for ${rel}`,
      symbols: [],
      imports: opts.imports ?? [],
      kind: "outline",
      updatedAt: now,
    })
  }
  return cache
}

describe("reverse deps consistency", () => {
  it("adding imports updates reverse map", () => {
    // Simulate the summarization-engine reverse deps update logic
    const reverseDeps = new Map<string, Set<string>>()
    const rel = "src/a.ts"
    const imports = ["./b", "./c"]

    // Clear old reverse deps for rel (as done in summarize)
    for (const [imported, importers] of reverseDeps) {
      if (importers.has(rel)) {
        importers.delete(rel)
        if (importers.size === 0) reverseDeps.delete(imported)
      }
    }
    // Add new reverse deps
    for (const imp of imports) {
      const existing = reverseDeps.get(imp)
      if (existing) existing.add(rel)
      else reverseDeps.set(imp, new Set([rel]))
    }

    expect(reverseDeps.get("./b")).toEqual(new Set(["src/a.ts"]))
    expect(reverseDeps.get("./c")).toEqual(new Set(["src/a.ts"]))
  })

  it("removing a file cleans up its reverse deps", () => {
    const reverseDeps = new Map<string, Set<string>>()
    reverseDeps.set("./b", new Set(["src/a.ts"]))
    reverseDeps.set("./c", new Set(["src/a.ts", "src/d.ts"]))

    const rel = "src/a.ts"
    // cleanupReverseDeps logic
    for (const [imported, importers] of reverseDeps) {
      if (importers.has(rel)) {
        importers.delete(rel)
        if (importers.size === 0) reverseDeps.delete(imported)
      }
    }

    expect(reverseDeps.has("./b")).toBe(false) // was only src/a.ts, now empty
    expect(reverseDeps.get("./c")).toEqual(new Set(["src/d.ts"])) // src/a.ts removed, src/d.ts remains
  })

  it("re-adding imports replaces old reverse deps", () => {
    const reverseDeps = new Map<string, Set<string>>()
    const rel = "src/a.ts"

    // First import set
    let imports = ["./old"]
    for (const [imported, importers] of reverseDeps) {
      if (importers.has(rel)) { importers.delete(rel); if (importers.size === 0) reverseDeps.delete(imported) }
    }
    for (const imp of imports) {
      const existing = reverseDeps.get(imp)
      if (existing) existing.add(rel)
      else reverseDeps.set(imp, new Set([rel]))
    }
    expect(reverseDeps.get("./old")).toEqual(new Set(["src/a.ts"]))

    // Second import set replaces first
    imports = ["./new"]
    for (const [imported, importers] of reverseDeps) {
      if (importers.has(rel)) { importers.delete(rel); if (importers.size === 0) reverseDeps.delete(imported) }
    }
    for (const imp of imports) {
      const existing = reverseDeps.get(imp)
      if (existing) existing.add(rel)
      else reverseDeps.set(imp, new Set([rel]))
    }
    expect(reverseDeps.has("./old")).toBe(false)
    expect(reverseDeps.get("./new")).toEqual(new Set(["src/a.ts"]))
  })

  it("buildInjectionRev is stable for identical inputs", () => {
    const files = ["src/a.ts", "src/b.ts"]
    const cache1 = createMockCache({ "src/a.ts": { imports: ["./b"] }, "src/b.ts": { imports: [] } })
    const cache2 = createMockCache({ "src/a.ts": { imports: ["./b"] }, "src/b.ts": { imports: [] } })

    const rev1 = buildInjectionRev(files, [], cache1)
    const rev2 = buildInjectionRev(files, [], cache2)
    expect(rev1).toBe(rev2)
  })

  it("buildInjectionRev changes when files change", () => {
    const cache = createMockCache({ "src/a.ts": { imports: [] }, "src/b.ts": { imports: [] } })
    const rev1 = buildInjectionRev(["src/a.ts", "src/b.ts"], [], cache)
    const rev2 = buildInjectionRev(["src/a.ts", "src/b.ts", "src/c.ts"], [], cache)
    expect(rev1).not.toBe(rev2)
  })

  it("buildInjectionRev changes when changed files change", () => {
    const cache = createMockCache({ "src/a.ts": { imports: [] }, "src/b.ts": { imports: [] } })
    const rev1 = buildInjectionRev(["src/a.ts", "src/b.ts"], ["src/a.ts"], cache)
    const rev2 = buildInjectionRev(["src/a.ts", "src/b.ts"], ["src/b.ts"], cache)
    expect(rev1).not.toBe(rev2)
  })

  it("buildInjectionRev is stable for identical inputs", () => {
    const files = ["src/a.ts", "src/b.ts"]
    const cache1 = createMockCache({ "src/a.ts": { imports: ["./b"] }, "src/b.ts": { imports: [] } })
    const cache2 = createMockCache({ "src/a.ts": { imports: ["./b"] }, "src/b.ts": { imports: [] } })

    const rev1 = buildInjectionRev(files, [], cache1)
    const rev2 = buildInjectionRev(files, [], cache2)
    expect(rev1).toBe(rev2)
  })
})
