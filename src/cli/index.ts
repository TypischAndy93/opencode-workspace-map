import type { Options, FileEntry, Stats, WorkspaceMapInput } from "../config/index.ts"
import type { Context } from "@opencode/plugin/promise/plugin"
import { TOOL_NAME } from "../config/index.ts"
import { renderTree } from "../injection/render.ts"
import { createFilterContext, walk } from "../fs/filter.ts"
import { globToRegex } from "../fs/gitignore.ts"
import { buildFullMapping, buildDigest, buildInjectionRev } from "../injection/builder.ts"
import { renderJson } from "../injection/render.ts"
import { locKey } from "../utils/hash.ts"
import { promises as fs } from "node:fs"
import * as path from "node:path"

export interface WatchOptions {
  root: string
  debounceMs: number
  onChange?: (files: string[]) => void
  pattern?: RegExp
}

export interface CLICommandsContext {
  api: Context
  opts: Options
  root: string
  cache: Map<string, FileEntry>
  stats: Stats
  reverseDeps: Map<string, Set<string>>
  listFiles: (force: boolean) => Promise<string[]>
  summarizeMany: (rels: string[], force: boolean) => Promise<void>
  getChangedFilesCached: () => Promise<string[]>
  log: (...args: unknown[]) => void
  project: any
  broadRoot: boolean
  entryPrefix: string
  filesCache: { at: number; files: string[] }
  vcsCache: { at: number; files: string[] }
  filterCtx: ReturnType<typeof createFilterContext>
}

export async function startWatch(
  api: Context,
  opts: Options,
  root: string,
  cache: Map<string, FileEntry>,
  stats: Stats,
  listFiles: (force: boolean) => Promise<string[]>,
  summarizeMany: (rels: string[], force: boolean) => Promise<void>,
  log: (...args: unknown[]) => void,
  watchOptions: { debounceMs?: number; pattern?: string; once?: boolean } = {}
): Promise<{ stop: () => void }> {
  const { watch } = await import("node:fs")
  
  // Get watch config with defaults
  const watchConfig = opts.watch ?? {}
  const debounceMs = watchOptions.debounceMs ?? watchConfig.debounceMs ?? opts.debounceMs ?? 750
  const batchChanges = watchConfig.batchChanges ?? true
  const batchTimeoutMs = watchConfig.batchTimeoutMs ?? 100
  const pattern = watchOptions.pattern ? new RegExp(globToRegex(watchOptions.pattern)) : null
  const once = watchOptions.once ?? false
  
  const pending = new Map<string, NodeJS.Timeout>()
  let batchTimer: NodeJS.Timeout | null = null
  const pendingBatch = new Set<string>()

  function flushBatch() {
    if (batchTimer) {
      clearTimeout(batchTimer)
      batchTimer = null
    }
    if (pendingBatch.size === 0) return
    
    const batch = [...pendingBatch]
    pendingBatch.clear()
    
    log(`batch summarizing ${batch.length} files: ${batch.join(", ")}`)
    
    // Summarize all files in batch
    summarizeMany(batch, true).catch((err) => log("batch summarize failed", err))
    
    if (once) {
      watcher.close()
      log("Watch completed (once mode)")
    }
  }

  function scheduleBatch(rel: string) {
    pendingBatch.add(rel)
    
    if (batchChanges) {
      // Batch mode: collect changes and flush after batchTimeoutMs
      if (!batchTimer) {
        batchTimer = setTimeout(flushBatch, batchTimeoutMs)
      }
    } else {
      // Non-batch mode: debounce individual files
      const existing = pending.get(rel)
      if (existing) clearTimeout(existing)
      const timeout = setTimeout(async () => {
        pending.delete(rel)
        if (cache.has(rel)) {
          log(`file changed: ${rel}`)
          await summarizeMany([rel], true)
        }
        if (once) {
          watcher.close()
          log("Watch completed (once mode)")
        }
      }, debounceMs)
      pending.set(rel, timeout)
    }
  }

  const watcher = watch(root, { recursive: true }, async (eventType: string, filename: string | null) => {
    if (!filename) return
    if (eventType === "change" || eventType === "rename") {
      const rel = filename
      if (pattern && !pattern.test(rel)) return
      scheduleBatch(rel)
    }
  })

  log(`watching ${root} for changes${pattern ? ` (pattern: ${pattern.source})` : ""}${once ? " (once mode)" : ""}${batchChanges ? " (batched)" : ""}`)

  return {
    stop: () => {
      if (batchTimer) clearTimeout(batchTimer)
      for (const timeout of pending.values()) clearTimeout(timeout)
      pending.clear()
      pendingBatch.clear()
      watcher.close()
      log("watch stopped")
    }
  }
}

export function registerWatchCommand(
  api: Context,
  opts: Options,
  root: string,
  cache: Map<string, FileEntry>,
  stats: Stats,
  listFiles: (force: boolean) => Promise<string[]>,
  summarizeMany: (rels: string[], force: boolean) => Promise<void>,
  log: (...args: unknown[]) => void
): void {
  if (!api.command?.transform) {
    log("command domain not available, skipping watch command registration")
    return
  }
  api.command.transform((editor: { add: (cmd: any) => void }) => {
    editor.add({
      name: "workspace-map:watch",
      description: "Watch workspace for file changes and update summaries in real-time",
      input: {
        type: "object",
        properties: {
          debounceMs: { type: "number", description: "Debounce time in milliseconds before re-summarizing (default: plugin debounceMs)" },
          pattern: { type: "string", description: "Glob pattern to filter which files to watch (e.g., 'src/**/*.ts')" },
          once: { type: "boolean", description: "Exit after processing the first change" },
          batchChanges: { type: "boolean", description: "Batch multiple file changes before re-summarizing (default: true)" },
          batchTimeoutMs: { type: "number", description: "Maximum time to wait for batching changes in milliseconds (default: 100ms)" },
        },
        additionalProperties: false,
      },
      execute: async (input: { debounceMs?: number; pattern?: string; once?: boolean; batchChanges?: boolean; batchTimeoutMs?: number } = {}) => {
        const watcher = await startWatch(api, opts, root, cache, stats, listFiles, summarizeMany, log, input)
        if (!input.once) {
          log("Watch started. Press Ctrl+C to stop.")
          
          // Keep running until interrupted
          await new Promise<void>((resolve) => {
            process.on("SIGINT", () => {
              watcher.stop()
              resolve()
            })
          })
        }
      },
    })
  })
}

/**
 * Register all CLI commands for workspace-map
 */
export function registerCLICommands(ctx: CLICommandsContext): void {
  const { 
    api, opts, root, cache, stats, reverseDeps, listFiles, summarizeMany, getChangedFilesCached, log, project, broadRoot,
    entryPrefix, filesCache, vcsCache, filterCtx
  } = ctx
  
  if (!api.command?.transform) {
    log("command domain not available, skipping CLI commands registration")
    return
  }

  api.command.transform((editor: { add: (cmd: any) => void }) => {
    // workspace-map:dump - Output full workspace map to stdout
    editor.add({
      name: "workspace-map:dump",
      description: "Output the full workspace map (tree + summaries) to stdout",
      input: {
        type: "object",
        properties: {
          format: { type: "string", enum: ["tree", "json"], description: "Output format (default: tree)" },
          limit: { type: "number", description: "Maximum number of files to include" },
          query: { type: "string", description: "Filter files by query string" },
        },
        additionalProperties: false,
      },
      execute: async (input: { format?: "tree" | "json"; limit?: number; query?: string } = {}) => {
        try {
          const files = await listFiles(true)
          const changed = await getChangedFilesCached()
          let filteredFiles = files
          
          if (input.query) {
            const q = input.query.toLowerCase()
            filteredFiles = files.filter(f => f.toLowerCase().includes(q))
          }
          if (input.limit) {
            filteredFiles = filteredFiles.slice(0, input.limit)
          }
          
          let text: string
          if (input.format === "json") {
            const rev = buildInjectionRev(filteredFiles, changed, cache)
            text = renderJson(filteredFiles, changed, cache, reverseDeps, opts, broadRoot, { summaries: stats.summaries, walks: stats.walks, files: stats.files }, filterCtx.isGenerated)
          } else {
            text = await buildFullMapping(
              api, opts, stats, cache, reverseDeps, root, broadRoot, 
              undefined, listFiles, getChangedFilesCached, summarizeMany, 
              new Map(), new Map(), project, filterCtx.isGenerated
            )
          }
          
          // Output to stdout (using console.log for the tool result)
          console.log(text)
          return { content: `Workspace map dumped (${filteredFiles.length} files, format: ${input.format ?? "tree"})` }
        } catch (err) {
          log("dump failed", err)
          throw err
        }
      },
    })

    // workspace-map:stats - Show cache/summary statistics
    editor.add({
      name: "workspace-map:stats",
      description: "Show workspace map cache and summary statistics",
      input: {
        type: "object",
        properties: {
          format: { type: "string", enum: ["text", "json"], description: "Output format (default: text)" },
        },
        additionalProperties: false,
      },
      execute: async (input: { format?: "text" | "json" } = {}) => {
        const cacheEntries = cache.size
        const totalFiles = stats.files
        const totalSummaries = stats.summaries
        const outlineSummaries = stats.outlineSummaries
        const modelSummaries = stats.modelSummaries
        const lspSummaries = stats.modelSummaries // tracked together
        const skippedSummaries = stats.skippedSummaries
        const walks = stats.walks
        const fullInjections = stats.fullInjections
        const digestInjections = stats.digestInjections
        const dirtyFlushes = stats.dirtyFlushes
        const warmups = stats.warmups
        const sessions = stats.sessions
        const lastWalkMs = stats.lastWalkMs
        const lastInjectionChars = stats.lastInjectionChars
        const lastInjectionAt = stats.lastInjectionAt
        
        // Calculate cache size
        let cacheSizeBytes = 0
        for (const entry of cache.values()) {
          cacheSizeBytes += entry.summary.length + JSON.stringify(entry.symbols).length + JSON.stringify(entry.imports).length
        }
        
        // Reverse deps stats
        let reverseDepsCount = 0
        for (const importers of reverseDeps.values()) {
          reverseDepsCount += importers.size
        }
        
        if (input.format === "json") {
          const result = {
            version: "0.4.0",
            cache: {
              entries: cacheEntries,
              sizeBytes: cacheSizeBytes,
              sizeMB: Math.round(cacheSizeBytes / 1024 / 1024 * 100) / 100,
            },
            files: {
              total: totalFiles,
              summarized: totalSummaries,
              skipped: skippedSummaries,
            },
            summaries: {
              total: totalSummaries,
              outline: outlineSummaries,
              model: modelSummaries,
              lsp: lspSummaries,
            },
            operations: {
              walks,
              fullInjections,
              digestInjections,
              dirtyFlushes,
              warmups,
              sessions,
            },
            timing: {
              lastWalkMs,
              lastInjectionChars,
              lastInjectionAt: lastInjectionAt ? new Date(lastInjectionAt).toISOString() : null,
            },
            reverseDeps: {
              uniqueImports: reverseDeps.size,
              totalReferences: reverseDepsCount,
            },
          }
          console.log(JSON.stringify(result, null, 2))
          return { content: JSON.stringify(result) }
        } else {
          const text = [
            `Workspace Map Statistics (v0.4.0)`,
            `=================================`,
            ``,
            `Cache:`,
            `  Entries: ${cacheEntries}`,
            `  Size: ${Math.round(cacheSizeBytes / 1024)} KB (${Math.round(cacheSizeBytes / 1024 / 1024 * 100) / 100} MB)`,
            ``,
            `Files:`,
            `  Total discovered: ${totalFiles}`,
            `  Summarized: ${totalSummaries}`,
            `  Skipped: ${skippedSummaries}`,
            ``,
            `Summaries by type:`,
            `  Outline: ${outlineSummaries}`,
            `  Model: ${modelSummaries}`,
            `  LSP: ${lspSummaries}`,
            ``,
            `Operations:`,
            `  Directory walks: ${walks}`,
            `  Full injections: ${fullInjections}`,
            `  Digest injections: ${digestInjections}`,
            `  Dirty flushes: ${dirtyFlushes}`,
            `  Warmups: ${warmups}`,
            `  Sessions: ${sessions}`,
            ``,
            `Timing:`,
            `  Last walk: ${lastWalkMs} ms`,
            `  Last injection: ${lastInjectionChars} chars at ${lastInjectionAt ? new Date(lastInjectionAt).toISOString() : "never"}`,
            ``,
            `Reverse Dependencies:`,
            `  Unique imports tracked: ${reverseDeps.size}`,
            `  Total references: ${reverseDepsCount}`,
          ].join("\n")
          
          console.log(text)
          return { content: text }
        }
      },
    })

    // workspace-map:validate - Validate configuration
    editor.add({
      name: "workspace-map:validate",
      description: "Validate workspace map configuration and environment",
      input: {
        type: "object",
        properties: {
          verbose: { type: "boolean", description: "Show detailed validation info" },
        },
        additionalProperties: false,
      },
      execute: async (input: { verbose?: boolean } = {}) => {
        const issues: string[] = []
        const warnings: string[] = []
        const info: string[] = []
        
        // Check root directory
        try {
          await fs.stat(root)
          info.push(`Root directory exists: ${root}`)
        } catch {
          issues.push(`Root directory not accessible: ${root}`)
        }
        
        // Check gitignore
        const gitignorePath = path.join(root, ".gitignore")
        try {
          await fs.stat(gitignorePath)
          info.push(".gitignore found")
        } catch {
          warnings.push("No .gitignore found - all files will be indexed")
        }
        
        // Check cache
        try {
          const testKey = `${locKey(root)}test`
          await api.storage.set(testKey, { test: true })
          await api.storage.remove(testKey)
          info.push("Storage backend accessible")
        } catch (err) {
          issues.push(`Storage backend error: ${err}`)
        }
        
        // Check options
        if (opts.maxFiles < 100) warnings.push(`maxFiles (${opts.maxFiles}) is very low`)
        if (opts.maxFileBytes < 10000) warnings.push(`maxFileBytes (${opts.maxFileBytes}) is very low`)
        if (opts.summarizeConcurrency > 8) warnings.push(`summarizeConcurrency (${opts.summarizeConcurrency}) is high`)
        
        // Check project detection
        if (project) {
          info.push(`Project type: ${project.isMonorepo ? `Monorepo (${project.monorepoType})` : "Single package"}`)
          info.push(`Primary language: ${project.primaryLanguage ?? "Unknown"}`)
          info.push(`Framework: ${project.framework ?? "None detected"}`)
          info.push(`Package manager: ${project.packageManager ?? "Unknown"}`)
          info.push(`TypeScript: ${project.hasTypeScript ? "Yes" : "No"}`)
          info.push(`Tests: ${project.hasTests ? "Yes" : "No"}`)
        }
        
        // Check cache stats
        if (cache.size === 0 && stats.walks === 0) {
          warnings.push("Cache is empty - no walks performed yet")
        }
        
        const allOk = issues.length === 0
        const text = [
          allOk ? "✅ Configuration valid" : "❌ Configuration issues found",
          "",
          ...info.map(i => `  ℹ ${i}`),
          ...warnings.map(w => `  ⚠ ${w}`),
          ...issues.map(i => `  ✗ ${i}`),
        ].join("\n")
        
        if (input.verbose) {
          console.log(text)
        }
        
        return { 
          content: text,
          valid: allOk,
          issues,
          warnings,
          info
        }
      },
    })

    // workspace-map:clear-cache - Clear the workspace map cache
    editor.add({
      name: "workspace-map:clear-cache",
      description: "Clear the workspace map cache (forces full re-index on next injection)",
      input: {
        type: "object",
        properties: {
          confirm: { type: "boolean", description: "Confirm cache clearing (required)" },
        },
        required: ["confirm"],
        additionalProperties: false,
      },
      execute: async (input: { confirm: boolean }) => {
        if (!input.confirm) {
          throw new Error("Cache clearing requires confirmation. Run with --confirm=true")
        }
        
        let cleared = 0
        for (const [key] of cache) {
          cache.delete(key)
          await api.storage.remove(entryPrefix + key).catch(() => {})
          cleared++
        }
        reverseDeps.clear()
        filesCache.at = 0
        filesCache.files = []
        vcsCache.at = 0
        vcsCache.files = []
        
        log(`Cleared ${cleared} cache entries`)
        
        const text = `✅ Cache cleared (${cleared} entries removed). Next injection will trigger full re-index.`
        console.log(text)
        return { content: text, cleared }
      },
    })
  })
}