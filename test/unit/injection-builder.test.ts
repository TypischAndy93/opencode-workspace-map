import { describe, it, expect, vi } from "vitest"
import { buildInjectionRev, buildDigest, buildFullMapping } from "../../src/injection/builder.js"
import { buildTree, createMutableNode, addPathToMutableNode, removePathFromMutableNode, updateGeneratedStatusInMutableNode, convertToImmutable } from "../../src/injection/render.js"
import { DEFAULT_OPTIONS, type Options, type Stats, type FileEntry, type ProjectInfo } from "../../src/config/index.js"

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

function createMockCache(files: string[]): Map<string, FileEntry> {
  const cache = new Map<string, FileEntry>()
  for (const rel of files) {
    cache.set(rel, {
      rel,
      size: 100,
      mtimeMs: Date.now(),
      summary: `Summary for ${rel}`,
      symbols: [{ name: "test" }],
      imports: [],
      kind: "outline",
      updatedAt: Date.now(),
    })
  }
  return cache
}

function createMockReverseDeps(files: string[]): Map<string, Set<string>> {
  const revDeps = new Map<string, Set<string>>()
  for (let i = 0; i < files.length - 1; i++) {
    revDeps.set(files[i], new Set([files[i + 1]]))
  }
  return revDeps
}

describe("Injection Builder", () => {
  describe("buildInjectionRev", () => {
    it("generates consistent revision for same inputs", () => {
      const files = ["src/a.ts", "src/b.ts", "src/c.ts"]
      const cache = createMockCache(files)
      const rev1 = buildInjectionRev(files, ["src/a.ts"], cache)
      const rev2 = buildInjectionRev(files, ["src/a.ts"], cache)
      expect(rev1).toBe(rev2)
    })

    it("changes when files change", () => {
      const files1 = ["src/a.ts", "src/b.ts"]
      const files2 = ["src/a.ts", "src/b.ts", "src/c.ts"]
      const cache = createMockCache(files2)
      const rev1 = buildInjectionRev(files1, [], cache)
      const rev2 = buildInjectionRev(files2, [], cache)
      expect(rev1).not.toBe(rev2)
    })

    it("changes when changed files change", () => {
      const files = ["src/a.ts", "src/b.ts"]
      const cache = createMockCache(files)
      const rev1 = buildInjectionRev(files, ["src/a.ts"], cache)
      const rev2 = buildInjectionRev(files, ["src/b.ts"], cache)
      expect(rev1).not.toBe(rev2)
    })

    it("changes when cache timestamps change", () => {
      const files = ["src/a.ts"]
      const cache1 = createMockCache(files)
      const cache2 = new Map(cache1)
      cache2.set("src/a.ts", { ...cache1.get("src/a.ts")!, updatedAt: Date.now() + 1000 })
      
      const rev1 = buildInjectionRev(files, [], cache1)
      const rev2 = buildInjectionRev(files, [], cache2)
      expect(rev1).not.toBe(rev2)
    })

    it("handles empty files array", () => {
      const rev = buildInjectionRev([], [], new Map())
      expect(typeof rev).toBe("string")
      expect(rev.length).toBe(12) // SHA1 truncated to 12 chars
    })
  })

  describe("buildDigest", () => {
    it("returns basic info when no changes", () => {
      const files = ["src/a.ts", "src/b.ts"]
      const cache = createMockCache(files)
      const digest = buildDigest(files, [], cache, false)
      expect(digest).toContain("Workspace map available: 2 files")
      expect(digest).not.toContain("changed")
    })

    it("lists changed files when changes exist", () => {
      const files = ["src/a.ts", "src/b.ts", "src/c.ts"]
      const cache = createMockCache(files)
      const digest = buildDigest(files, ["src/a.ts", "src/b.ts"], cache, false)
      expect(digest).toContain("2 changed")
      expect(digest).toContain("src/a.ts")
      expect(digest).toContain("src/b.ts")
    })

    it("truncates many changed files", () => {
      const files = Array.from({ length: 10 }, (_, i) => `src/file${i}.ts`)
      const cache = createMockCache(files)
      const digest = buildDigest(files, files, cache, false)
      expect(digest).toContain("10 changed")
      // Uses U+2026 (horizontal ellipsis) not three dots
      expect(digest).toContain("…")
    })

    it("includes broad root indicator", () => {
      const files = ["src/a.ts"]
      const cache = createMockCache(files)
      const digest = buildDigest(files, [], cache, true)
      expect(digest).toContain("(large root; using on-demand lookup)")
    })

    it("includes tool hint", () => {
      const files = ["src/a.ts"]
      const cache = createMockCache(files)
      const digest = buildDigest(files, [], cache, false)
      expect(digest).toContain("workspace_map")
    })
  })
})

describe("Injection Render - Tree Building", () => {
  describe("buildTree", () => {
    it("builds flat tree from single files", () => {
      const files = ["a.ts", "b.ts", "c.ts"]
      const tree = buildTree(files)
      expect(tree.name).toBe("")
      expect(tree.children.length).toBe(3)
      expect(tree.children.map(c => c.name)).toEqual(["a.ts", "b.ts", "c.ts"])
    })

    it("builds nested tree from paths", () => {
      const files = ["src/index.ts", "src/utils/helper.ts", "tests/test.ts"]
      const tree = buildTree(files)
      const src = tree.children.find(c => c.name === "src")
      expect(src).toBeDefined()
      expect(src!.children.length).toBe(2)
      // Directories first, then files, alphabetically
      expect(src!.children.map(c => c.name)).toEqual(["utils", "index.ts"])
      const utils = src!.children.find(c => c.name === "utils")
      expect(utils).toBeDefined()
      expect(utils!.children.length).toBe(1)
      expect(utils!.children[0].name).toBe("helper.ts")
    })

    it("marks generated files correctly", () => {
      const files = ["src/generated.ts", "src/manual.ts"]
      const isGenerated = (rel: string) => rel.includes("generated")
      const tree = buildTree(files, isGenerated)
      const gen = tree.children.find(c => c.name === "src")!.children.find(c => c.name === "generated.ts")
      expect(gen!.generated).toBe(true)
      const manual = tree.children.find(c => c.name === "src")!.children.find(c => c.name === "manual.ts")
      expect(manual!.generated).toBe(false)
    })

    it("sorts children: directories first, then files, alphabetical", () => {
      const files = ["b.ts", "a.ts", "src/z.ts", "src/a.ts"]
      const tree = buildTree(files)
      expect(tree.children.map(c => c.name)).toEqual(["src", "a.ts", "b.ts"])
      const src = tree.children.find(c => c.name === "src")
      expect(src!.children.map(c => c.name)).toEqual(["a.ts", "z.ts"])
    })
  })

  describe("Mutable Node Operations", () => {
    describe("createMutableNode", () => {
      it("creates node with correct properties", () => {
        const node = createMutableNode("test", "test", true, true)
        expect(node.name).toBe("test")
        expect(node.rel).toBe("test")
        expect(node.file).toBe(true)
        expect(node.generated).toBe(true)
        expect(node.children instanceof Map).toBe(true)
      })
    })

    describe("addPathToMutableNode", () => {
      it("adds single file to root", () => {
        const root = createMutableNode("", "", false)
        addPathToMutableNode(root, "file.ts")
        expect(root.children.size).toBe(1)
        const child = root.children.get("file.ts")
        expect(child).toBeDefined()
        expect(child!.file).toBe(true)
        expect(child!.rel).toBe("file.ts")
      })

      it("adds nested path", () => {
        const root = createMutableNode("", "", false)
        addPathToMutableNode(root, "src/utils/helper.ts")
        const src = root.children.get("src")
        expect(src).toBeDefined()
        const utils = src!.children.get("utils")
        expect(utils).toBeDefined()
        const helper = utils!.children.get("helper.ts")
        expect(helper).toBeDefined()
        expect(helper!.file).toBe(true)
        expect(helper!.rel).toBe("src/utils/helper.ts")
      })

      it("does not duplicate existing paths", () => {
        const root = createMutableNode("", "", false)
        addPathToMutableNode(root, "src/a.ts")
        addPathToMutableNode(root, "src/a.ts")
        expect(root.children.get("src")!.children.size).toBe(1)
      })

      it("handles generated flag", () => {
        const root = createMutableNode("", "", false)
        const isGenerated = (rel: string) => rel.includes("gen")
        addPathToMutableNode(root, "src/gen.ts", isGenerated)
        const file = root.children.get("src")!.children.get("gen.ts")
        expect(file!.generated).toBe(true)
      })
    })

    describe("removePathFromMutableNode", () => {
      it("removes file from tree", () => {
        const root = createMutableNode("", "", false)
        addPathToMutableNode(root, "src/a.ts")
        addPathToMutableNode(root, "src/b.ts")
        const removed = removePathFromMutableNode(root, "src/a.ts")
        expect(removed).toBe(true)
        expect(root.children.get("src")!.children.size).toBe(1)
        expect(root.children.get("src")!.children.has("b.ts")).toBe(true)
      })

      it("cleans up empty directories", () => {
        const root = createMutableNode("", "", false)
        addPathToMutableNode(root, "src/nested/deep.ts")
        removePathFromMutableNode(root, "src/nested/deep.ts")
        // src/nested should be cleaned up
        expect(root.children.has("src")).toBe(false)
      })

      it("returns false for non-existent path", () => {
        const root = createMutableNode("", "", false)
        const removed = removePathFromMutableNode(root, "nonexistent.ts")
        expect(removed).toBe(false)
      })

      it("does not remove root", () => {
        const root = createMutableNode("", "", false)
        removePathFromMutableNode(root, "")
        expect(root).toBeDefined()
      })
    })

    describe("updateGeneratedStatusInMutableNode", () => {
      it("updates generated status for existing file", () => {
        const root = createMutableNode("", "", false)
        addPathToMutableNode(root, "src/a.ts")
        const updated = updateGeneratedStatusInMutableNode(root, "src/a.ts", true)
        expect(updated).toBe(true)
        const file = root.children.get("src")!.children.get("a.ts")
        expect(file!.generated).toBe(true)
      })

      it("returns false for non-existent path", () => {
        const root = createMutableNode("", "", false)
        const updated = updateGeneratedStatusInMutableNode(root, "nonexistent.ts", true)
        expect(updated).toBe(false)
      })

      it("does not update directories", () => {
        const root = createMutableNode("", "", false)
        addPathToMutableNode(root, "src/a.ts")
        const updated = updateGeneratedStatusInMutableNode(root, "src", true)
        expect(updated).toBe(false)
      })
    })

    describe("convertToImmutable", () => {
      it("converts mutable tree to immutable", () => {
        const root = createMutableNode("", "", false)
        addPathToMutableNode(root, "src/a.ts")
        addPathToMutableNode(root, "src/b.ts")
        const tree = convertToImmutable(root)
        expect(tree.name).toBe("")
        expect(tree.children.length).toBe(1)
        const src = tree.children[0]
        expect(src.name).toBe("src")
        expect(src.children.length).toBe(2)
        expect(src.children.map(c => c.name)).toEqual(["a.ts", "b.ts"])
      })

      it("preserves generated status", () => {
        const root = createMutableNode("", "", false)
        addPathToMutableNode(root, "gen.ts", (rel) => rel.includes("gen"))
        const tree = convertToImmutable(root)
        const file = tree.children[0]
        expect(file.generated).toBe(true)
      })

      it("sorts children: directories first, then files, alphabetical", () => {
        const root = createMutableNode("", "", false)
        addPathToMutableNode(root, "b.ts")
        addPathToMutableNode(root, "src/a.ts")
        addPathToMutableNode(root, "a.ts")
        const tree = convertToImmutable(root)
        expect(tree.children.map(c => c.name)).toEqual(["src", "a.ts", "b.ts"])
      })
    })
  })
})