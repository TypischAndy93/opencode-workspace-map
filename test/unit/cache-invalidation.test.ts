import { describe, it, expect, vi, afterEach } from "vitest"
import {
  scheduleBatchWrite,
  flushPendingWrites,
  loadCache,
  computeCacheVersion,
  type FileEntry,
  type Options,
} from "../../src/config/index.js"
import { DEFAULT_OPTIONS } from "../../src/config/index.js"

function makeEntry(rel: string, summary: string, mtimeMs: number = Date.now()): FileEntry {
  return {
    rel, size: summary.length, mtimeMs,
    summary, symbols: [], imports: [],
    kind: "outline", updatedAt: Date.now(),
  }
}

function makeOpts(overrides: Partial<Options> = {}): Options {
  return { ...DEFAULT_OPTIONS, ...overrides }
}

function makeApi(storage: Map<string, unknown>, log: any) {
  return {
    storage: {
      get: vi.fn(async (k: string) => storage.get(k)),
      set: vi.fn(async (k: string, v: unknown) => storage.set(k, v)),
      remove: vi.fn(async (k: string) => storage.delete(k)),
      scan: vi.fn(async ({ prefix }: { prefix?: string }) => {
        const prefixStr = prefix ?? ""
        const keys = [...storage.keys()].filter((k) => k.startsWith(prefixStr)).sort()
        return {
          entries: keys.map((k) => ({ key: k, value: storage.get(k) })),
          next: undefined,
        }
      }),
    },
  } as any
}

describe("cache invalidation", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("unchanged file is a cache hit (mtime and size match)", () => {
    const storage = new Map<string, unknown>()
    const api = makeApi(storage, { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() })
    const cache = new Map<string, FileEntry>()
    const opts = makeOpts({ cacheFlushIntervalMs: 5000 })
    const log = { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() }

    const mtime = Date.now()
    scheduleBatchWrite(api, "loc1", makeEntry("src/a.ts", "summary", mtime), cache, opts, log)
    expect(cache.get("src/a.ts")?.summary).toBe("summary")

    // Re-schedule with same mtime/size - cache should reflect latest
    scheduleBatchWrite(api, "loc1", makeEntry("src/a.ts", "summary v2", mtime), cache, opts, log)
    expect(cache.get("src/a.ts")?.summary).toBe("summary v2")
  })

  it("changed mtime triggers cache update", () => {
    const storage = new Map<string, unknown>()
    const api = makeApi(storage, { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() })
    const cache = new Map<string, FileEntry>()
    const opts = makeOpts({ cacheFlushIntervalMs: 5000 })
    const log = { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() }

    scheduleBatchWrite(api, "loc1", makeEntry("src/a.ts", "v1", 1000), cache, opts, log)
    expect(cache.get("src/a.ts")?.mtimeMs).toBe(1000)

    scheduleBatchWrite(api, "loc1", makeEntry("src/a.ts", "v2", 2000), cache, opts, log)
    expect(cache.get("src/a.ts")?.mtimeMs).toBe(2000)
    expect(cache.get("src/a.ts")?.summary).toBe("v2")
  })

  it("changed size triggers cache update", () => {
    const storage = new Map<string, unknown>()
    const api = makeApi(storage, { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() })
    const cache = new Map<string, FileEntry>()
    const opts = makeOpts({ cacheFlushIntervalMs: 5000 })
    const log = { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() }

    scheduleBatchWrite(api, "loc1", makeEntry("src/a.ts", "short", 1000), cache, opts, log)
    expect(cache.get("src/a.ts")?.size).toBe(5)

    scheduleBatchWrite(api, "loc1", makeEntry("src/a.ts", "a much longer summary here", 1000), cache, opts, log)
    expect(cache.get("src/a.ts")?.size).toBeGreaterThan(5)
    expect(cache.get("src/a.ts")?.summary).toBe("a much longer summary here")
  })

  it("loadCache skips entries with mismatched cacheVersion", async () => {
    const storage = new Map<string, unknown>()
    const api = makeApi(storage, { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() })
    const cache = new Map<string, FileEntry>()
    const log = { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() }

    // Insert a valid entry directly into storage
    const validEntry: FileEntry = {
      rel: "src/valid.ts", size: 10, mtimeMs: 1000, summary: "valid",
      symbols: [], imports: [], kind: "outline", updatedAt: 1000,
    }
    validEntry.cacheVersion = computeCacheVersion(validEntry)
    storage.set("loc/loc1/file/src/valid.ts", validEntry)

    // Insert a stale entry (no cacheVersion)
    const staleEntry: FileEntry = {
      rel: "src/stale.ts", size: 10, mtimeMs: 1000, summary: "stale",
      symbols: [], imports: [], kind: "outline", updatedAt: 1000,
    }
    storage.set("loc/loc1/file/src/stale.ts", staleEntry)

    await loadCache(api, "loc1", cache, log)

    expect(cache.has("src/valid.ts")).toBe(true)
    expect(cache.has("src/stale.ts")).toBe(false)
  })
})
