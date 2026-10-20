import { describe, it, expect } from "vitest"
import { buildDependencyGraph } from "../../src/tool/index.js"
import type { FileEntry } from "../../src/config/index.js"

function makeEntry(rel: string, imports: string[] = [], size = 100): FileEntry {
  return {
    rel, size, mtimeMs: Date.now(),
    summary: `Summary for ${rel}`,
    symbols: [],
    imports,
    kind: "outline",
    updatedAt: Date.now(),
  }
}

function makeCache(entries: { rel: string; imports?: string[] }[]): Map<string, FileEntry> {
  const cache = new Map<string, FileEntry>()
  for (const e of entries) {
    cache.set(e.rel, makeEntry(e.rel, e.imports ?? []))
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

describe("dependency graph enhancements", () => {
  describe("fan-in / fan-out metrics", () => {
    it("calculates fan-in and fan-out per file", () => {
      const cache = makeCache([
        { rel: "src/a.ts", imports: ["src/b.ts", "src/c.ts"] },
        { rel: "src/b.ts", imports: ["src/c.ts"] },
        { rel: "src/c.ts", imports: [] },
      ])
      // reverseDeps keyed by file path (what buildDependencyGraph looks up)
      const reverseDeps = makeReverseDeps([
        ["src/b.ts", ["src/a.ts"]],
        ["src/c.ts", ["src/a.ts", "src/b.ts"]],
      ])

      const graph = buildDependencyGraph(cache, reverseDeps, ["src/a.ts", "src/b.ts", "src/c.ts"])

      const a = graph.nodes.find((n) => n.id === "src/a.ts")
      const b = graph.nodes.find((n) => n.id === "src/b.ts")
      const c = graph.nodes.find((n) => n.id === "src/c.ts")
      expect(a!.fanOut).toBe(2)
      expect(a!.fanIn).toBe(0)
      expect(b!.fanOut).toBe(1)
      expect(b!.fanIn).toBe(1) // imported by a
      expect(c!.fanOut).toBe(0)
      expect(c!.fanIn).toBe(2) // imported by a and b
    })

    it("fan-out reflects number of imports", () => {
      const cache = makeCache([
        { rel: "src/x.ts", imports: ["src/p.ts", "src/q.ts", "src/r.ts"] },
        { rel: "src/p.ts", imports: [] },
      ])
      const graph = buildDependencyGraph(cache, new Map(), ["src/x.ts", "src/p.ts"])
      const x = graph.nodes.find((n) => n.id === "src/x.ts")
      expect(x!.fanOut).toBe(3)
    })
  })

  describe("architectural layers by directory depth", () => {
    it("assigns layer based on directory depth", () => {
      const cache = makeCache([
        { rel: "index.ts" },
        { rel: "src/main.ts" },
        { rel: "src/utils/helper.ts" },
        { rel: "src/components/ui/button.ts" },
      ])
      const graph = buildDependencyGraph(cache, new Map(), [
        "index.ts", "src/main.ts", "src/utils/helper.ts", "src/components/ui/button.ts",
      ])

      const layers = new Map(graph.nodes.map((n) => [n.id, n.layer]))
      expect(layers.get("index.ts")).toBe(0) // root level
      expect(layers.get("src/main.ts")).toBe(1)
      expect(layers.get("src/utils/helper.ts")).toBe(2)
      expect(layers.get("src/components/ui/button.ts")).toBe(3)
    })
  })

  describe("circular dependency detection", () => {
    it("detects a simple cycle A→B→C→A", () => {
      const cache = makeCache([
        { rel: "src/a.ts", imports: ["src/b.ts"] },
        { rel: "src/b.ts", imports: ["src/c.ts"] },
        { rel: "src/c.ts", imports: ["src/a.ts"] },
      ])
      // reverseDeps keyed by file path
      const reverseDeps = makeReverseDeps([
        ["src/b.ts", ["src/a.ts"]],
        ["src/c.ts", ["src/b.ts"]],
        ["src/a.ts", ["src/c.ts"]],
      ])

      const graph = buildDependencyGraph(cache, reverseDeps, ["src/a.ts", "src/b.ts", "src/c.ts"])

      expect(graph.circularDependencies.length).toBeGreaterThan(0)
      // At least one cycle should involve all three files
      const foundCycle = graph.circularDependencies.some((cyc) =>
        cyc.includes("src/a.ts") && cyc.includes("src/b.ts") && cyc.includes("src/c.ts")
      )
      expect(foundCycle).toBe(true)
    })

    it("detects a two-node cycle A→B→A", () => {
      const cache = makeCache([
        { rel: "src/a.ts", imports: ["src/b.ts"] },
        { rel: "src/b.ts", imports: ["src/a.ts"] },
      ])
      const reverseDeps = makeReverseDeps([
        ["src/b.ts", ["src/a.ts"]],
        ["src/a.ts", ["src/b.ts"]],
      ])

      const graph = buildDependencyGraph(cache, reverseDeps, ["src/a.ts", "src/b.ts"])
      expect(graph.circularDependencies.length).toBeGreaterThan(0)
      const foundCycle = graph.circularDependencies.some((cyc) =>
        cyc.includes("src/a.ts") && cyc.includes("src/b.ts")
      )
      expect(foundCycle).toBe(true)
    })

    it("returns no cycles for a DAG", () => {
      const cache = makeCache([
        { rel: "src/a.ts", imports: ["src/b.ts"] },
        { rel: "src/b.ts", imports: ["src/c.ts"] },
        { rel: "src/c.ts", imports: [] },
      ])
      const reverseDeps = makeReverseDeps([
        ["src/b.ts", ["src/a.ts"]],
        ["src/c.ts", ["src/b.ts"]],
      ])

      const graph = buildDependencyGraph(cache, reverseDeps, ["src/a.ts", "src/b.ts", "src/c.ts"])
      expect(graph.circularDependencies).toEqual([])
    })

    it("returns no cycles for empty graph", () => {
      const graph = buildDependencyGraph(new Map(), new Map(), [])
      expect(graph.circularDependencies).toEqual([])
      expect(graph.nodes).toEqual([])
      expect(graph.edges).toEqual([])
    })

    it("deduplicates cycles that are rotations of each other", () => {
      const cache = makeCache([
        { rel: "src/a.ts", imports: ["src/b.ts"] },
        { rel: "src/b.ts", imports: ["src/c.ts"] },
        { rel: "src/c.ts", imports: ["src/a.ts"] },
      ])
      const reverseDeps = makeReverseDeps([
        ["src/b.ts", ["src/a.ts"]],
        ["src/c.ts", ["src/b.ts"]],
        ["src/a.ts", ["src/c.ts"]],
      ])

      const graph = buildDependencyGraph(cache, reverseDeps, ["src/a.ts", "src/b.ts", "src/c.ts"])
      // All cycles should be deduplicated to one unique cycle (the same triangle)
      const triangleCycles = graph.circularDependencies.filter((cyc) =>
        cyc.length === 4 && // 3 nodes + closing repeat
        cyc.includes("src/a.ts") && cyc.includes("src/b.ts") && cyc.includes("src/c.ts")
      )
      expect(triangleCycles.length).toBeLessThanOrEqual(1)
    })
  })

  describe("graph structure", () => {
    it("builds edges from resolved imports", () => {
      const cache = makeCache([
        { rel: "src/a.ts", imports: ["src/b.ts"] },
        { rel: "src/b.ts", imports: [] },
      ])
      const reverseDeps = makeReverseDeps([
        ["src/b.ts", ["src/a.ts"]],
      ])

      const graph = buildDependencyGraph(cache, reverseDeps, ["src/a.ts", "src/b.ts"])
      expect(graph.edges.length).toBe(1)
      expect(graph.edges[0]).toEqual({ from: "src/a.ts", to: "src/b.ts" })
    })

    it("includes importedBy on each node", () => {
      const cache = makeCache([
        { rel: "src/a.ts", imports: ["src/b.ts"] },
        { rel: "src/b.ts", imports: [] },
      ])
      const reverseDeps = makeReverseDeps([
        ["src/b.ts", ["src/a.ts"]],
      ])

      const graph = buildDependencyGraph(cache, reverseDeps, ["src/a.ts", "src/b.ts"])
      const b = graph.nodes.find((n) => n.id === "src/b.ts")
      expect(b!.importedBy).toEqual(["src/a.ts"])
    })

    it("omits edges to unresolved imports", () => {
      const cache = makeCache([
        { rel: "src/a.ts", imports: ["src/missing.ts", "external-lib"] },
        { rel: "src/b.ts", imports: [] },
      ])
      const graph = buildDependencyGraph(cache, new Map(), ["src/a.ts", "src/b.ts"])
      // src/missing.ts and external-lib don't resolve to any node → no edges
      expect(graph.edges.length).toBe(0)
    })
  })
})
