import type { FileEntry, Options, Stats } from "../config/index.ts"
import { computeCacheVersion } from "../config/index.ts"
import type { Context } from "@opencode/plugin/promise/plugin"
import { entryPrefix as ENTRY_PREFIX, LEGACY_PREFIX, REFRESH_CAP, TOOL_NAME } from "../config/index.ts"
import { run as zstdRun } from "zstd-codec/lib/zstd-codec.js"

const COMPRESSION_THRESHOLD = 1024 // 1KB

async function compressData(data: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    zstdRun((zstd) => {
      try {
        const simple = new zstd.Simple()
        const compressed = simple.compress(data, 3)
        resolve(compressed)
      } catch (err) {
        reject(err)
      }
    })
  })
}

async function decompressData(data: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    zstdRun((zstd) => {
      try {
        const simple = new zstd.Simple()
        const decompressed = simple.decompress(data)
        resolve(decompressed)
      } catch (err) {
        reject(err)
      }
    })
  })
}

export async function loadCache(
  api: Context,
  locKey: string,
  cache: Map<string, FileEntry>,
  log: (...args: unknown[]) => void
): Promise<void> {
  const prefix = `loc/${locKey}/file/`
  let after: string | undefined
  let loaded = 0
  let skipped = 0
  for (;;) {
    let page: any
    try {
      page = await api.storage.scan({ prefix, limit: 200, ...(after ? { after } : {}) })
    } catch (err) {
      log("storage scan failed", err)
      return
    }
    for (const entry of page?.entries ?? []) {
      const rel = String(entry.key).slice(prefix.length)
      const v = entry.value
      // Drop malformed/corrupt entries instead of serving them.
      if (v && typeof v === "object" && typeof (v as Record<string, unknown>).summary === "string" && typeof (v as Record<string, unknown>).rel === "string") {
        let fileEntry = v as FileEntry
        
        // Decompress if compressed
        if (fileEntry.compressed) {
          try {
            const decompressed = await decompressData(new Uint8Array(fileEntry.summary as any))
            fileEntry = { ...fileEntry, summary: Buffer.from(decompressed).toString("utf8"), compressed: false }
          } catch (err) {
            log("decompression failed", rel, err)
            continue
          }
        }
        
        // Validate cache version - if missing or mismatched, skip (will be regenerated)
        if (fileEntry.cacheVersion !== undefined && fileEntry.cacheVersion === computeCacheVersion(fileEntry)) {
          cache.set(rel, fileEntry)
          loaded++
        } else {
          skipped++
          // Remove stale entry
          try {
            await api.storage.remove(`loc/${locKey}/file/` + rel)
          } catch {
            /* ignore */
          }
        }
      }
    }
    if (!page?.next) break
    after = page.next
  }
  if (skipped > 0) {
    log(`cache: loaded ${loaded} entries, skipped ${skipped} stale entries`)
  }
}

export async function migrateLegacy(
  api: Context,
  log: (...args: unknown[]) => void
): Promise<void> {
  let after: string | undefined
  let removed = 0
  for (;;) {
    let page: any
    try {
      page = await api.storage.scan({ prefix: "file/", limit: 200, ...(after ? { after } : {}) })
    } catch {
      return
    }
    const entries = page?.entries ?? []
    for (const entry of entries) {
      try {
        await api.storage.remove(entry.key)
        removed++
      } catch {
        /* ignore */
      }
    }
    if (!page?.next) break
    after = page.next
  }
  if (removed) log(`migrated ${removed} legacy cache entries`)
}

export async function saveEntry(
  api: Context,
  locKey: string,
  entry: FileEntry,
  cache: Map<string, FileEntry>,
  opts: Options,
  log: (...args: unknown[]) => void
): Promise<void> {
  // Add cache version for validation
  let entryWithVersion: FileEntry = {
    ...entry,
    cacheVersion: computeCacheVersion(entry),
  }
  
  // Compress if summary is larger than threshold
  if (entryWithVersion.summary.length > COMPRESSION_THRESHOLD) {
    try {
      const compressed = await compressData(new TextEncoder().encode(entryWithVersion.summary))
      entryWithVersion = {
        ...entryWithVersion,
        summary: Array.from(compressed) as any, // Store as array for JSON serialization
        compressed: true,
      }
    } catch (err) {
      log("compression failed", entry.rel, err)
    }
  }
  
  cache.set(entry.rel, entryWithVersion)
  // LRU eviction: keep cache bounded to ~2x maxSummaries
  const maxCacheSize = opts.maxSummaries * 2
  if (cache.size > maxCacheSize) {
    const oldestKey = cache.keys().next().value
    if (oldestKey) {
      cache.delete(oldestKey)
      try {
        await api.storage.remove(`loc/${locKey}/file/` + oldestKey)
      } catch {
        /* ignore */
      }
    }
  }
  try {
    await api.storage.set(`loc/${locKey}/file/` + entry.rel, entryWithVersion as any)
  } catch (err) {
    log("storage set failed", entry.rel, err)
  }
}

// Batch storage writes for better performance.
// State is kept per location key so multiple plugin instances in one process
// (e.g. different workspace roots) never flush into each other's cache/storage.
interface PendingWrite {
  entry: FileEntry
}

interface BatchState {
  pending: PendingWrite[]
  timer: ReturnType<typeof setTimeout> | null
}

const batchStates = new Map<string, BatchState>()

export function scheduleBatchWrite(
  api: Context,
  locKey: string,
  entry: FileEntry,
  cache: Map<string, FileEntry>,
  opts: Options,
  log: (...args: unknown[]) => void
): void {
  // Update the in-memory cache immediately so readers (injection revision,
  // tool queries) observe fresh summaries without blocking on the batch flush.
  // Only the storage persistence below is deferred.
  cache.set(entry.rel, { ...entry, cacheVersion: computeCacheVersion(entry) })

  let state = batchStates.get(locKey)
  if (!state) {
    state = { pending: [], timer: null }
    batchStates.set(locKey, state)
  }
  state.pending.push({ entry })

  if (!state.timer) {
    const flushInterval = opts.cacheFlushIntervalMs ?? 5000
    state.timer = setTimeout(() => { void flushBatchWrites(api, locKey, cache, opts, log) }, flushInterval)
  }
}

async function flushBatchWrites(
  api: Context,
  locKey: string,
  cache: Map<string, FileEntry>,
  opts: Options,
  log: (...args: unknown[]) => void
): Promise<void> {
  const state = batchStates.get(locKey)
  if (!state) return
  if (state.timer) {
    clearTimeout(state.timer)
    state.timer = null
  }
  if (state.pending.length === 0) return
  
  const batch = [...state.pending]
  state.pending = []
  
  // Process batch - add cache versions and compress
  const entriesToWrite = await Promise.all(batch.map(async ({ entry }) => {
    let entryWithVersion: FileEntry = {
      ...entry,
      cacheVersion: computeCacheVersion(entry),
    }
    
    if (entryWithVersion.summary.length > COMPRESSION_THRESHOLD) {
      try {
        const compressed = await compressData(new TextEncoder().encode(entryWithVersion.summary))
        entryWithVersion = {
          ...entryWithVersion,
          summary: Array.from(compressed) as any,
          compressed: true,
        }
      } catch (err) {
        log("compression failed", entry.rel, err)
      }
    }
    
    return { rel: entry.rel, entry: entryWithVersion }
  }))
  
  // Update cache (entries appear in scheduling order, so an entry
  // re-summarized within the window overwrites with the newest version).
  for (const { rel, entry } of entriesToWrite) {
    cache.set(rel, entry)
  }
  
  // LRU eviction
  const maxCacheSize = opts.maxSummaries * 2
  if (cache.size > maxCacheSize) {
    const oldestKey = cache.keys().next().value
    if (oldestKey) {
      cache.delete(oldestKey)
      try {
        await api.storage.remove(`loc/${locKey}/file/` + oldestKey)
      } catch { /* ignore */ }
    }
  }
  
  // Batch write to storage
  try {
    // Use Promise.all for concurrent writes
    await Promise.all(
      entriesToWrite.map(({ rel, entry }) => 
        api.storage.set(`loc/${locKey}/file/` + rel, entry as any).catch(err => log("storage set failed", rel, err))
      )
    )
  } catch (err) {
    log("batch storage write failed", err)
  }
}

// Flush any pending writes on shutdown
export async function flushPendingWrites(
  api: Context,
  locKey: string,
  cache: Map<string, FileEntry>,
  opts: Options,
  log: (...args: unknown[]) => void
): Promise<void> {
  const state = batchStates.get(locKey)
  if (state?.timer) {
    clearTimeout(state.timer)
    state.timer = null
  }
  if (state && state.pending.length > 0) {
    await flushBatchWrites(api, locKey, cache, opts, log)
  }
}

export async function pruneCache(
  api: Context,
  locKey: string,
  files: string[],
  cache: Map<string, FileEntry>
): Promise<void> {
  const present = new Set(files)
  for (const rel of [...cache.keys()]) {
    if (!present.has(rel)) {
      cache.delete(rel)
      try {
        await api.storage.remove(`loc/${locKey}/file/` + rel)
      } catch {
        /* ignore */
      }
    }
  }
}