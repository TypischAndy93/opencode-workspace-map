import type { Options, FileEntry, Stats, WorkspaceMapInput } from "../config/index.ts"
import type { Context } from "@opencode/plugin/promise/plugin"
import { TOOL_NAME } from "../config/index.ts"
import { renderTree, renderJson, buildTree, convertToImmutable, createMutableNode, addPathToMutableNode } from "../injection/render.ts"
import { createFilterContext, walk } from "../fs/filter.ts"
import { buildFullMapping, buildDigest, buildInjectionRev } from "../injection/builder.ts"
import { locKey } from "../utils/hash.ts"
import { createWatchManager } from "../watch-manager.ts"
import { promises as fs } from "node:fs"
import * as path from "node:path"
import { VERSION } from "../version.ts"

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
  treeCache: ReturnType<typeof createMutableNode> | null
}

export function registerWatchCommand(
  api: Context,
  opts: Options,
  root: string,
  cache: Map<string, FileEntry>,
  stats: Stats,
  reverseDeps: Map<string, Set<string>>,
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
          smartDebounce: { type: "boolean", description: "Enable adaptive debouncing based on change frequency (default: false)" },
          minDebounceMs: { type: "number", description: "Minimum debounce time when using smart debounce (default: 50ms)" },
          maxDebounceMs: { type: "number", description: "Maximum debounce time when using smart debounce (default: 2000ms)" },
          debounceStrategy: { type: "string", enum: ["fixed", "adaptive", "coalesce"], description: "Debounce strategy: fixed (default), adaptive (adapts to change frequency), or coalesce (groups rapid changes)" },
          coalesceWindowMs: { type: "number", description: "Time window for coalescing rapid changes in milliseconds (default: 300ms)" },
        },
        additionalProperties: false,
      },
      execute: async function(input: {
        debounceMs?: number;
        pattern?: string;
        once?: boolean;
        batchChanges?: boolean;
        batchTimeoutMs?: number;
        smartDebounce?: boolean;
        minDebounceMs?: number;
        maxDebounceMs?: number;
        debounceStrategy?: "fixed" | "adaptive" | "coalesce";
        coalesceWindowMs?: number;
      } = {}) {
        const manager = createWatchManager(
          { root, cache, reverseDeps, listFiles, summarizeMany, log },
          opts,
          input
        )
        await manager.start()

        if (input.once) {
          // Wait until the first change flushes, which stops the manager.
          await manager.whenStopped()
          return
        }

        log("Watch started. Press Ctrl+C to stop.")
        await new Promise<void>((resolve) => {
          process.on("SIGINT", () => {
            manager.stop()
            resolve()
          })
        })
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
    entryPrefix, filesCache, vcsCache, filterCtx, treeCache
  } = ctx
  
  // Ensure reverseDeps is captured for async closures
  const reverseDepsRef = reverseDeps
  
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
        const lspSummaries = stats.lspSummaries
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
        
        // Cost tracking
        const totalInputTokens = stats.totalInputTokens
        const totalOutputTokens = stats.totalOutputTokens
        const totalCostUsd = stats.totalCostUsd
        const costBySummarizer = stats.costBySummarizer
        
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
            version: VERSION,
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
            cost: {
              totalInputTokens,
              totalOutputTokens,
              totalCostUsd: Math.round(totalCostUsd * 1_000_000) / 1_000_000,
              bySummarizer: {
                outline: {
                  inputTokens: costBySummarizer.outline.inputTokens,
                  outputTokens: costBySummarizer.outline.outputTokens,
                  costUsd: Math.round(costBySummarizer.outline.costUsd * 1_000_000) / 1_000_000,
                },
                model: {
                  inputTokens: costBySummarizer.model.inputTokens,
                  outputTokens: costBySummarizer.model.outputTokens,
                  costUsd: Math.round(costBySummarizer.model.costUsd * 1_000_000) / 1_000_000,
                },
                lsp: {
                  inputTokens: costBySummarizer.lsp.inputTokens,
                  outputTokens: costBySummarizer.lsp.outputTokens,
                  costUsd: Math.round(costBySummarizer.lsp.costUsd * 1_000_000) / 1_000_000,
                },
              },
            },
          }
          console.log(JSON.stringify(result, null, 2))
          return { content: JSON.stringify(result) }
        } else {
          const text = [
            `Workspace Map Statistics (v${VERSION})`,
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
            `Cost Tracking:`,
            `  Total: $${totalCostUsd.toFixed(6)} (${totalInputTokens} in / ${totalOutputTokens} out tokens)`,
            `  By summarizer: outline=$${costBySummarizer.outline.costUsd.toFixed(6)}, model=$${costBySummarizer.model.costUsd.toFixed(6)}, lsp=$${costBySummarizer.lsp.costUsd.toFixed(6)}`,
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

    // workspace-map:export - Export workspace map to file
    editor.add({
      name: "workspace-map:export",
      description: "Export the workspace map to a JSON file",
      input: {
        type: "object",
        properties: {
          output: { type: "string", description: "Output file path (default: .opencode/workspace-map.json)" },
          format: { type: "string", enum: ["json"], description: "Export format (default: json)" },
          overwrite: { type: "boolean", description: "Overwrite existing file without prompt (default: false)" },
        },
        additionalProperties: false,
      },
      execute: async (input: { output?: string; format?: "json"; overwrite?: boolean } = {}) => {
        try {
          const files = await listFiles(true)
          const changed = await getChangedFilesCached()
          const outputPath = input.output ?? path.join(root, ".opencode", "workspace-map.json")
          
          // Check if file exists and overwrite is not set
          if (!input.overwrite) {
            try {
              await fs.stat(outputPath)
              throw new Error(`File already exists: ${outputPath}. Use --overwrite=true to overwrite.`)
            } catch (err: any) {
              if (err.code !== "ENOENT") throw err
            }
          }
          
          // Ensure output directory exists
          await fs.mkdir(path.dirname(outputPath), { recursive: true })
          
          // Use cached tree if available
          const tree = treeCache ? convertToImmutable(treeCache) : undefined
          
          const jsonOutput = renderJson(files, changed, cache, reverseDeps, opts, broadRoot, { summaries: stats.summaries, walks: stats.walks, files: stats.files }, filterCtx.isGenerated, tree)
          
          await fs.writeFile(outputPath, jsonOutput)
          
          const text = `✅ Workspace map exported to ${outputPath} (${files.length} files)`
          console.log(text)
          return { content: text, path: outputPath, fileCount: files.length }
        } catch (err) {
          log("export failed", err)
          throw err
        }
      },
    })

    // workspace-map:import - Import workspace map from file
    editor.add({
      name: "workspace-map:import",
      description: "Import a workspace map from a JSON file (populates cache, does not re-summarize)",
      input: {
        type: "object",
        properties: {
          input: { type: "string", description: "Input file path (default: .opencode/workspace-map.json)" },
          merge: { type: "boolean", description: "Merge with existing cache instead of replacing (default: false)" },
        },
        additionalProperties: false,
      },
      execute: async (input: { input?: string; merge?: boolean } = {}) => {
        try {
          const inputPath = input.input ?? path.join(root, ".opencode", "workspace-map.json")
          
          const fileContent = await fs.readFile(inputPath, "utf8")
          const data = JSON.parse(fileContent)
          
          if (!data.tree || !data.notes) {
            throw new Error("Invalid workspace map file: missing tree or notes")
          }
          
          let importedFiles = 0
          let importedSummaries = 0
          
          if (!input.merge) {
            cache.clear()
            reverseDeps.clear()
          }
          
          // Restore file entries from notes
          for (const [rel, note] of Object.entries(data.notes as Record<string, any>)) {
            const entry: FileEntry = {
              rel,
              size: note.size ?? 0,
              mtimeMs: note.mtimeMs ?? 0,
              summary: note.summary ?? "",
              symbols: note.symbols ?? [],
              imports: note.imports ?? [],
              kind: note.kind ?? "outline",
              updatedAt: note.updatedAt ?? Date.now(),
              sections: note.sections,
              cacheVersion: note.cacheVersion,
              compressed: note.compressed,
            }
            cache.set(rel, entry)
            importedFiles++
            if (entry.kind !== "skipped" && entry.kind !== "generated") {
              importedSummaries++
            }
            
            // Restore reverse deps
            if (note.importedBy && Array.isArray(note.importedBy)) {
              reverseDeps.set(rel, new Set(note.importedBy))
            }
          }
          
          // Note: treeCache will be rebuilt on next listFiles() call
          
          // Update caches
          filesCache.at = 0
          filesCache.files = []
          
          const text = `✅ Workspace map imported from ${inputPath} (${importedFiles} files, ${importedSummaries} summaries)`
          console.log(text)
          return { content: text, importedFiles, importedSummaries }
        } catch (err) {
          log("import failed", err)
          throw err
        }
      },
    })

    // workspace-map:init - Interactive configuration wizard
    editor.add({
      name: "workspace-map:init",
      description: "Interactive configuration wizard for workspace-map",
      input: {
        type: "object",
        properties: {
          output: { type: "string", description: "Output config file path (default: .opencode/workspace-map.json)" },
          overwrite: { type: "boolean", description: "Overwrite existing config without prompt (default: false)" },
        },
        additionalProperties: false,
      },
      execute: async (input: { output?: string; overwrite?: boolean } = {}) => {
        const { stdin, stdout } = process
        const readline = await import("node:readline/promises")
        
        const rl = readline.createInterface({ input: stdin, output: stdout })
        
        const ask = async (question: string, defaultValue?: string): Promise<string> => {
          const prompt = defaultValue ? `${question} [${defaultValue}]: ` : `${question}: `
          const answer = await rl.question(prompt)
          return answer.trim() || defaultValue || ""
        }
        
        const askBool = async (question: string, defaultValue: boolean = false): Promise<boolean> => {
          const defaultStr = defaultValue ? "Y/n" : "y/N"
          const answer = await rl.question(`${question} [${defaultStr}]: `)
          const normalized = answer.trim().toLowerCase()
          if (!normalized) return defaultValue
          return normalized === "y" || normalized === "yes"
        }
        
        const askChoice = async (question: string, choices: string[], defaultValue?: string): Promise<string> => {
          const choicesStr = choices.join("/")
          const prompt = defaultValue ? `${question} (${choicesStr}) [${defaultValue}]: ` : `${question} (${choicesStr}): `
          let answer: string
          do {
            answer = (await rl.question(prompt)).trim().toLowerCase()
            if (!answer && defaultValue) return defaultValue
          } while (!choices.includes(answer))
          return answer
        }

        console.log("\n🔧 Workspace Map Configuration Wizard")
        console.log("=====================================\n")

        // Inject mode
        const inject = await askChoice(
          "Injection mode",
          ["off", "tree", "changed", "full"],
          "changed"
        )

        // Summarizer
        const summarizer = await askChoice(
          "Default summarizer",
          ["outline", "model", "lsp"],
          "outline"
        )

        // Max files
        const maxFilesInput = await ask("Max files to index", "3000")
        const maxFiles = parseInt(maxFilesInput, 10) || 3000

        // Max file bytes
        const maxFileBytesInput = await ask("Max file size to summarize (bytes)", "500000")
        const maxFileBytes = parseInt(maxFileBytesInput, 10) || 500000

        // Summarize concurrency
        const summarizeConcurrencyInput = await ask("Concurrent summarizations", "4")
        const summarizeConcurrency = parseInt(summarizeConcurrencyInput, 10) || 4

        // Ignore patterns
        const ignoreExtraInput = await ask(
          "Extra ignore patterns (comma-separated, e.g. 'dist,build,*.generated.ts')",
          ""
        )
        const ignoreExtra = ignoreExtraInput
          ? ignoreExtraInput.split(",").map(s => s.trim()).filter(Boolean)
          : []

        // Include patterns
        const includeInput = await ask(
          "Include patterns (comma-separated, e.g. 'src/**,tests/**)",
          ""
        )
        const include = includeInput
          ? includeInput.split(",").map(s => s.trim()).filter(Boolean)
          : []

        // Debug mode
        const debug = await askBool("Enable debug logging", false)

        // Log format
        const logFormat = await askChoice(
          "Log format",
          ["text", "json"],
          "text"
        )

        // Cost tracking
        const costTrackingEnabled = await askBool("Enable cost tracking", false)
        let costTracking: Options["costTracking"] = { enabled: false }
        if (costTrackingEnabled) {
          const inputPrice = await ask("Input token price per 1M tokens (USD)", "0.0000015")
          const outputPrice = await ask("Output token price per 1M tokens (USD)", "0.000006")
          costTracking = {
            enabled: true,
            inputTokenPriceUsd: parseFloat(inputPrice) || 0.0000015,
            outputTokenPriceUsd: parseFloat(outputPrice) || 0.000006,
            logIntervalMs: 60000,
          }
        }

        // Metrics
        const metricsEnabled = await askBool("Enable OpenTelemetry metrics", false)
        let metrics: Options["metrics"] = { enabled: false }
        if (metricsEnabled) {
          const exporter = await askChoice("Metrics exporter", ["console", "otlp"], "console")
          metrics = { enabled: true, exporter: exporter as "console" | "otlp", intervalMs: 30000 }
        }

        // Auto-tune
        const autoTune = await askBool("Enable auto-tuning based on project type", true)

        // Watch mode
        const watchEnabled = await askBool("Enable file watch mode", true)

        // Build config object
        const config = {
          inject,
          summarizer,
          maxFiles,
          maxFileBytes,
          summarizeConcurrency,
          ignoreExtra,
          include,
          debug,
          logFormat,
          costTracking,
          metrics,
          autoTune,
          watchEnabled,
        }

        // Determine output path
        const outputPath = input.output || path.join(root, ".opencode", "workspace-map.json")

        // Check if file exists
        if (!input.overwrite) {
          try {
            await fs.stat(outputPath)
            const overwrite = await askBool(`Config file already exists at ${outputPath}. Overwrite?`, false)
            if (!overwrite) {
              rl.close()
              return { content: "Configuration wizard cancelled." }
            }
          } catch {
            // File doesn't exist, proceed
          }
        }

        // Ensure output directory exists
        await fs.mkdir(path.dirname(outputPath), { recursive: true })

        // Write config file
        await fs.writeFile(outputPath, JSON.stringify(config, null, 2))

        rl.close()

        const successMsg = `✅ Configuration written to ${outputPath}`
        console.log(successMsg)
        console.log("\nYou can now use the plugin with this configuration.")
        console.log("To modify later, run this command again or edit the file directly.")

        return { content: successMsg, path: outputPath, config }
      },
    })
  })
}
