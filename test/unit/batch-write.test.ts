import { describe, it, expect, vi, afterEach } from "vitest"
import {
  scheduleBatchWrite,
  flushPendingWrites,
  type FileEntry,
  type Options,
} from "../../src/config/index.js"
import { DEFAULT_OPTIONS } from "../../src/config/index.js"

// We need to access the internal batchStates map. Since it's not exported,
// we test through the public API: scheduleBatchWrite + flushPendingWrites.

function makeEntry(rel: string, summary: string): FileEntry {
  return {
    rel,
    size: summary.length,
    mtimeMs: Date.now(),
    summary,
    symbols: [],
    imports: [],
    kind: "outline",
    updatedAt: Date.now(),
  }
}

function makeOpts(overrides: Partial<Options> = {}): Options {
  return { ...DEFAULT_OPTIONS, ...overrides }
}

describe("batch storage writes", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("schedules and flushes pending writes", async () => {
    const storage = new Map<string, unknown>()
    const api = {
      storage: {
        get: vi.fn(async (k: string) => storage.get(k)),
        set: vi.fn(async (k: string, v: unknown) => storage.set(k, v)),
        remove: vi.fn(async (k: string) => storage.delete(k)),
        scan: vi.fn(async () => ({ entries: [], next: undefined })),
      },
    } as any

    const cache = new Map<string, FileEntry>()
    const opts = makeOpts({ cacheFlushIntervalMs: 50 })
    const log = { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() } as any

    scheduleBatchWrite(api, "loc1", makeEntry("src/a.ts", "summary A"), cache, opts, log)
    scheduleBatchWrite(api, "loc1", makeEntry("src/b.ts", "summary B"), cache, opts, log)

    // In-memory cache should be updated immediately
    expect(cache.has("src/a.ts")).toBe(true)
    expect(cache.has("src/b.ts")).toBe(true)

    // Storage should not have them yet (batch not flushed)
    expect(storage.has("loc/loc1/file/src/a.ts")).toBe(false)

    // Flush explicitly
    await flushPendingWrites(api, "loc1", cache, opts, log)

    expect(storage.has("loc/loc1/file/src/a.ts")).toBe(true)
    expect(storage.has("loc/loc1/file/src/b.ts")).toBe(true)
  })

  it("flushes on timer interval", async () => {
    const storage = new Map<string, unknown>()
    const api = {
      storage: {
        get: vi.fn(async (k: string) => storage.get(k)),
        set: vi.fn(async (k: string, v: unknown) => storage.set(k, v)),
        remove: vi.fn(async (k: string) => storage.delete(k)),
        scan: vi.fn(async () => ({ entries: [], next: undefined })),
      },
    } as any

    const cache = new Map<string, FileEntry>()
    const opts = makeOpts({ cacheFlushIntervalMs: 30 })
    const log = { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() } as any

    scheduleBatchWrite(api, "loc1", makeEntry("src/c.ts", "summary C"), cache, opts, log)

    // Wait for timer to fire
    await new Promise((r) => setTimeout(r, 100))

    expect(storage.has("loc/loc1/file/src/c.ts")).toBe(true)
  })

  it("does not write to other location keys", async () => {
    const storage = new Map<string, unknown>()
    const api = {
      storage: {
        get: vi.fn(async (k: string) => storage.get(k)),
        set: vi.fn(async (k: string, v: unknown) => storage.set(k, v)),
        remove: vi.fn(async (k: string) => storage.delete(k)),
        scan: vi.fn(async () => ({ entries: [], next: undefined })),
      },
    } as any

    const cache = new Map<string, FileEntry>()
    const opts = makeOpts()
    const log = { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() } as any

    scheduleBatchWrite(api, "locA", makeEntry("src/a.ts", "summary A"), cache, opts, log)
    await flushPendingWrites(api, "locA", cache, opts, log)

    // Only locA should have the entry
    expect(storage.has("loc/locA/file/src/a.ts")).toBe(true)
    expect(storage.has("loc/locB/file/src/a.ts")).toBe(false)
  })

  it("updates cache entry on re-summarize within batch window", async () => {
    const storage = new Map<string, unknown>()
    const api = {
      storage: {
        get: vi.fn(async (k: string) => storage.get(k)),
        set: vi.fn(async (k: string, v: unknown) => storage.set(k, v)),
        remove: vi.fn(async (k: string) => storage.delete(k)),
        scan: vi.fn(async () => ({ entries: [], next: undefined })),
      },
    } as any

    const cache = new Map<string, FileEntry>()
    const opts = makeOpts({ cacheFlushIntervalMs: 100 })
    const log = { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() } as any

    scheduleBatchWrite(api, "loc1", makeEntry("src/a.ts", "first"), cache, opts, log)
    scheduleBatchWrite(api, "loc1", makeEntry("src/a.ts", "second"), cache, opts, log)

    // Last write wins in cache
    expect(cache.get("src/a.ts")?.summary).toBe("second")

    await flushPendingWrites(api, "loc1", cache, opts, log)
    const stored = storage.get("loc/loc1/file/src/a.ts") as any
    expect(stored.summary).toBe("second")
  })
})
