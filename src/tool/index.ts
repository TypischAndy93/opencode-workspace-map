import type { Options, FileEntry, Stats, WorkspaceMapInput, ProjectInfo, PluginContext, MonorepoPackage, SymbolInfo } from "../config/index.ts"
import { TOOL_NAME } from "../config/index.ts"
import { renderTree, renderReverseDeps } from "../injection/render.ts"
import { promises as fs } from "node:fs"
import { createWriteStream } from "node:fs"
import * as path from "node:path"
import { VERSION } from "../version.ts"

interface SymbolLocation {
  rel: string
  name: string
  kind?: string
  line?: number
  character?: number
}

function buildSymbolIndex(cache: Map<string, FileEntry>): Map<string, SymbolLocation[]> {
  const index = new Map<string, SymbolLocation[]>()
  for (const [rel, entry] of cache) {
    for (const sym of entry.symbols ?? []) {
      const locs = index.get(sym.name) ?? []
      locs.push({ rel, name: sym.name, kind: sym.kind, line: sym.line, character: sym.character })
      index.set(sym.name, locs)
    }
  }
  return index
}

export function createWorkspaceMapTool(pluginCtx: PluginContext) {
  const { api, opts, root, locKey, cache, reverseDeps, stats, recentBySession, recentGlobal, listFiles, getChangedFilesCached, summarizeMany, project } = pluginCtx
  return {
    name: TOOL_NAME,
    description:
      "Returns workspace tree + per-file summaries (outline default, zero model cost). " +
      "Call directly as workspace_map({ path, query, refresh, limit, format, action, symbol }). " +
      "Accepts: path (limit to dir/file), query (filter by path, summary, or symbols), limit (cap), format (map|json), refresh (re-scan), action (map|stats|export|graph|packages|symbols|definition|references), symbol (symbol name for definition/references actions).",
    options: { codemode: false },
    input: {
      type: "object",
      properties: {
        path: { type: "string", description: "Limit results to this file or directory, relative to the workspace root." },
        query: { type: "string", description: "Only include files whose path, summary, or symbols contain this text." },
        refresh: { type: "boolean", description: "Force a fresh filesystem scan and re-summarize the matching files." },
        limit: { type: "number", description: "Cap the number of matching files returned (and summarized on refresh)." },
        format: { type: "string", enum: ["map", "json"], description: "Return the rendered map (default) or raw JSON." },
        action: { type: "string", enum: ["map", "stats", "export", "graph", "packages", "symbols", "definition", "references"], description: "Return the map (default), plugin statistics, export JSONL, dependency graph, monorepo packages, symbol list, symbol definition, or symbol references." },
        symbol: { type: "string", description: "Symbol name to look up (used with action: definition or references)." },
      },
      additionalProperties: false,
    },
    execute: async (input: WorkspaceMapInput, context: { progress?: (update: { status: string }) => Promise<void> } | undefined) => {
      try {
        await context?.progress?.({ status: "building workspace map" })
        if (input?.action === "stats") {
          stats.sessions = recentBySession.size
          return {
            content: JSON.stringify(
              { version: VERSION, root, broadRoot: false, locationKey: locKey, cachedEntries: cache.size, ...stats, monorepo: project.isMonorepo ? { type: project.monorepoType, packages: project.packages.map((p: MonorepoPackage) => ({ name: p.name, path: p.path, language: p.language })) } : null },
              null,
              2,
            ),
          }
        }
        
        if (input?.action === "packages") {
          if (!project.isMonorepo) {
            return { content: "Not a monorepo" }
          }
          return {
            content: JSON.stringify(
              { packages: project.packages.map((p: MonorepoPackage) => ({ name: p.name, path: p.path, language: p.language, packageJson: p.packageJson })) },
              null,
              2,
            ),
          }
        }

        // ---- Symbol Navigation Actions ----

        if (input?.action === "symbols") {
          const index = buildSymbolIndex(cache)
          const query = typeof input?.query === "string" ? input.query.toLowerCase() : undefined
          const results: SymbolLocation[] = []
          for (const [name, locs] of index) {
            if (query && !name.toLowerCase().includes(query)) continue
            for (const loc of locs) results.push(loc)
          }
          results.sort((a, b) => a.name.localeCompare(b.name))
          const limit = typeof input?.limit === "number" && input.limit > 0 ? Math.floor(input.limit) : undefined
          const capped = limit ? results.slice(0, limit) : results
          return {
            content: JSON.stringify(
              { version: VERSION, action: "symbols", query, total: results.length, symbols: capped.map(r => ({ file: r.rel, name: r.name, kind: r.kind })) },
              null, 2,
            ),
          }
        }

        if (input?.action === "definition") {
          const symbolName = input?.symbol
          if (!symbolName) {
            return { content: "definition action requires a 'symbol' parameter", isError: true }
          }
          const index = buildSymbolIndex(cache)
          const locs = index.get(symbolName)
          if (!locs || locs.length === 0) {
            return { content: JSON.stringify({ version: VERSION, action: "definition", symbol: symbolName, found: false, message: "Symbol not found in workspace index" }, null, 2) }
          }
          // Return the first definition location (LSP would give line/character; outline gives file only)
          const def = locs[0]
          return {
            content: JSON.stringify(
              { version: VERSION, action: "definition", symbol: symbolName, found: true, file: def.rel, line: def.line, character: def.character, kind: def.kind, note: "line/character require LSP summarizer; outline mode provides file only" },
              null, 2,
            ),
          }
        }

        if (input?.action === "references") {
          const symbolName = input?.symbol
          if (!symbolName) {
            return { content: "references action requires a 'symbol' parameter", isError: true }
          }
          const index = buildSymbolIndex(cache)
          const defLocs = index.get(symbolName)
          if (!defLocs || defLocs.length === 0) {
            return { content: JSON.stringify({ version: VERSION, action: "references", symbol: symbolName, found: false, message: "Symbol not found in workspace index" }, null, 2) }
          }
          // Find files that import/define the symbol using reverseDeps + symbol index
          const refFiles = new Set<string>()
          for (const loc of defLocs) {
            // Files that import this symbol's file (reverseDeps keyed by import path)
            const importers = reverseDeps.get(loc.rel)
            if (importers) for (const f of importers) refFiles.add(f)
            // Best-effort: match import path to defining file by basename (e.g. "./user" -> "src/user.ts")
            const locBase = path.basename(loc.rel, path.extname(loc.rel))
            for (const [imp, importers] of reverseDeps) {
              const impBase = imp.replace(/^\.\//, "").replace(/^\.\.\//, "")
              if (locBase.endsWith(impBase) || impBase.endsWith(locBase)) {
                for (const f of importers) refFiles.add(f)
              }
            }
            // The defining file itself
            refFiles.add(loc.rel)
          }
          // Also match by symbol name appearing in other files' symbols
          for (const [name, locs] of index) {
            if (name === symbolName) continue
            // Fuzzy: symbol name contains the query symbol (e.g., "UserService" contains "User")
            if (name.includes(symbolName) || symbolName.includes(name)) {
              for (const loc of locs) refFiles.add(loc.rel)
            }
          }
          const results = [...refFiles].sort().map(rel => ({ file: rel }))
          return {
            content: JSON.stringify(
              { version: VERSION, action: "references", symbol: symbolName, total: results.length, references: results },
              null, 2,
            ),
          }
        }

        // ---- Health Check Action ----

        if (input?.action === "health") {
          const mem = process.memoryUsage()
          const totalCacheLookups = stats.summaries + stats.skippedSummaries
          const cacheHitRate = totalCacheLookups > 0 ? (stats.summaries / totalCacheLookups) * 100 : 100

          // Health thresholds
          const walkWarningMs = 5000
          const walkCriticalMs = 15000
          const hitRateWarning = 70
          const hitRateCritical = 40

          let status = "ok"
          const issues: string[] = []

          if (stats.lastWalkMs > walkCriticalMs) {
            status = "critical"
            issues.push(`walk duration ${stats.lastWalkMs}ms exceeds critical threshold ${walkCriticalMs}ms`)
          } else if (stats.lastWalkMs > walkWarningMs) {
            if (status === "ok") status = "warning"
            issues.push(`walk duration ${stats.lastWalkMs}ms exceeds warning threshold ${walkWarningMs}ms`)
          }

          if (cacheHitRate < hitRateCritical) {
            status = "critical"
            issues.push(`cache hit rate ${cacheHitRate.toFixed(1)}% below critical threshold ${hitRateCritical}%`)
          } else if (cacheHitRate < hitRateWarning) {
            if (status === "ok") status = "warning"
            issues.push(`cache hit rate ${cacheHitRate.toFixed(1)}% below warning threshold ${hitRateWarning}%`)
          }

          const health = {
            version: VERSION,
            action: "health",
            status,
            timestamp: Date.now(),
            issues,
            cache: {
              entries: cache.size,
              summaries: stats.summaries,
              skipped: stats.skippedSummaries,
              hitRatePercent: Math.round(cacheHitRate * 100) / 100,
            },
            walk: {
              lastWalkMs: stats.lastWalkMs,
              totalWalks: stats.walks,
              files: stats.files,
            },
            injections: {
              full: stats.fullInjections,
              digest: stats.digestInjections,
              dirtyFlushes: stats.dirtyFlushes,
              lastInjectionChars: stats.lastInjectionChars,
              lastInjectionAt: stats.lastInjectionAt,
            },
            memory: {
              rssMb: Math.round(mem.rss / 1024 / 1024 * 100) / 100,
              heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024 * 100) / 100,
              heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024 * 100) / 100,
              externalMb: Math.round(mem.external / 1024 / 1024 * 100) / 100,
            },
            summaries: {
              outline: stats.outlineSummaries,
              model: stats.modelSummaries,
              lsp: stats.lspSummaries,
              total: stats.summaries,
            },
            cost: {
              totalInputTokens: stats.totalInputTokens,
              totalOutputTokens: stats.totalOutputTokens,
              totalCostUsd: Math.round(stats.totalCostUsd * 1_000_000) / 1_000_000,
            },
            sessions: stats.sessions,
            warmup: stats.warmups,
          }

          return { content: JSON.stringify(health, null, 2) }
        }

        const force = input?.refresh === true
        const files = await listFiles(force)
        let matched = files
        if (input?.path) {
          const rel = toRel(String(input.path), root)
          if (rel) matched = matched.filter((f: string) => f === rel || f.startsWith(rel.replace(/\/$/, "") + "/"))
        }
        const query = typeof input?.query === "string" ? input.query.toLowerCase() : undefined
        if (query) {
          matched = matched.filter((f: string) => {
            const entry = cache.get(f)
            const summary = entry?.summary ?? ""
            const symbols = entry?.symbols?.join(" ") ?? ""
            return f.toLowerCase().includes(query) ||
              summary.toLowerCase().includes(query) ||
              symbols.toLowerCase().includes(query)
          })
        }
        const limit = typeof input?.limit === "number" && input.limit > 0 ? Math.floor(input.limit) : undefined
        if (limit) matched = matched.slice(0, limit)
        const shown = matched.slice(0, opts.maxSummaries)
        if (force) {
          const toSum = matched.slice(0, 2000)
          await summarizeMany(toSum, false)
        }
        if (input?.action === "export") {
          const exportPath = opts.exportJsonlPath || ".opencode/workspace-map.jsonl"
          const absExportPath = path.isAbsolute(exportPath) ? exportPath : path.join(root, exportPath)
          await fs.mkdir(path.dirname(absExportPath), { recursive: true })
          
          const files = await listFiles(false)
          const writeStream = createWriteStream(absExportPath)
          let count = 0
          
          for (const rel of files) {
            const e = cache.get(rel)
            if (e) {
              const line = JSON.stringify({
                rel: e.rel,
                summary: e.summary,
                symbols: e.symbols,
                imports: e.imports,
                size: e.size,
                mtimeMs: e.mtimeMs,
                kind: e.kind,
                updatedAt: e.updatedAt,
              })
              writeStream.write(line + "\n")
              count++
            }
          }
          
          await new Promise<void>((resolve, reject) => {
            writeStream.end()
            writeStream.on("finish", () => resolve())
            writeStream.on("error", reject)
          })
          
          return { content: `Exported ${count} file summaries to ${exportPath}` }
        }
        
        if (input?.action === "graph") {
          const depGraph = buildDependencyGraph(cache, reverseDeps, matched)
          return { content: JSON.stringify(depGraph, null, 2) }
        }
        
        if (input?.format === "json") {
          const changed = await getChangedFilesCached()
          const notes: Record<string, any> = {}
          for (const rel of shown) {
            const e = cache.get(rel)
            notes[rel] = e
              ? { summary: e.summary, symbols: e.symbols, imports: e.imports, size: e.size, updatedAt: e.updatedAt, importedBy: reverseDeps.get(rel) ? [...reverseDeps.get(rel)!] : [] }
              : { summary: null }
          }
          return {
            content: JSON.stringify(
              { version: VERSION, root, broadRoot: false, locationKey: locKey, total: matched.length, changed, files: shown, notes, stats: { ...stats, sessions: recentBySession.size }, monorepo: project.isMonorepo ? { type: project.monorepoType, packages: project.packages.map((p: MonorepoPackage) => ({ name: p.name, path: p.path, language: p.language })) } : null },
              null,
              2,
            ),
          }
        }
        const out: string[] = [
          `# Workspace map (v${VERSION})`,
          `Root: ${root}`,
          `${matched.length} matching file${matched.length === 1 ? "" : "s"}`,
          "",
          renderTree(matched, opts, false),
        ]
        if (shown.length) {
          out.push("", "## File notes")
          for (const rel of shown) {
            const e = cache.get(rel)
            out.push(`### ${rel}`)
            out.push(e?.summary ?? "(not indexed yet — pass refresh: true)")
            if (e?.imports?.length) out.push(`Imports: ${e.imports.join(", ")}`)
            if (e?.symbols?.length) {
              const symStr = e.symbols.map((s: SymbolInfo) => typeof s === "string" ? s : (s.kind ? `${s.name}:${s.kind}` : s.name)).join(", ")
              out.push(`Symbols: ${symStr}`)
            }
            // Structured sections
            if (e?.sections) {
              const s = e.sections
              if (s.purpose) out.push(`**Purpose:** ${s.purpose}`)
              if (s.keyExports?.length) {
                const expStr = s.keyExports.map((se: SymbolInfo) => se.kind ? `${se.name}:${se.kind}` : se.name).join(", ")
                out.push(`**Key Exports:** ${expStr}`)
              }
              if (s.dependencies?.length) out.push(`**Dependencies:** ${s.dependencies.join(", ")}`)
              if (s.todos?.length) out.push(`**TODOs:** ${s.todos.join("; ")}`)
            }
            const importedBy = reverseDeps.get(rel)
            if (importedBy?.size) out.push(`Imported by: ${[...importedBy].join(", ")}`)
            out.push("")
          }
        }
        return { content: out.join("\n") }
      } catch (err) {
        const log = (...args: unknown[]) => { if (opts.debug) console.error("[workspace-map]", ...args) }
        log("tool execute error", err)
        const msg = err instanceof Error ? err.message : String(err)
        return { content: `workspace_map error: ${msg}`, isError: true }
      }
    },
  }
}

function toRel(input: string, root: string): string | undefined {
  if (typeof input !== "string" || !input.trim()) return undefined
  const abs = path.isAbsolute(input) ? input : path.resolve(root, input)
  const rel = path.relative(root, abs)
  if (!rel || rel.startsWith("..")) return undefined
  return rel.split(path.sep).join("/")
}

export function buildDependencyGraph(cache: Map<string, FileEntry>, reverseDeps: Map<string, Set<string>>, files: string[]): {
  nodes: Array<{ id: string; imports: string[]; importedBy: string[]; fanIn: number; fanOut: number; layer: number }>;
  edges: Array<{ from: string; to: string }>;
  circularDependencies: Array<string[]>;
} {
  const nodes = new Map<string, { id: string; imports: string[]; importedBy: string[]; fanIn: number; fanOut: number; layer: number }>()
  const edges: Array<{ from: string; to: string }> = []

  for (const rel of files) {
    const entry = cache.get(rel)
    if (!entry) continue
    const importedBy = reverseDeps.get(rel) ? [...reverseDeps.get(rel)!] : []
    const layer = rel.split("/").length - 1 // directory depth (root-level files = 0)
    nodes.set(rel, {
      id: rel,
      imports: entry.imports ?? [],
      importedBy,
      fanIn: importedBy.length,
      fanOut: entry.imports?.length ?? 0,
      layer,
    })
  }

  // Build edges from imports (best-effort resolution)
  for (const [rel, entry] of nodes) {
    for (const imp of entry.imports) {
      const resolved = resolveImport(imp, rel, nodes)
      if (resolved) {
        edges.push({ from: rel, to: resolved })
      }
    }
  }

  // Detect circular dependencies via DFS
  const circularDependencies = detectCycles(nodes, edges)

  return {
    nodes: [...nodes.values()],
    edges,
    circularDependencies,
  }
}

/**
 * Detects cycles in the dependency graph using DFS with coloring.
 * Returns each cycle as an array of node ids forming the cycle.
 */
function detectCycles(nodes: Map<string, any>, edges: Array<{ from: string; to: string }>): Array<string[]> {
  const adjacency = new Map<string, string[]>()
  for (const node of nodes.values()) {
    adjacency.set(node.id, [])
  }
  for (const { from, to } of edges) {
    const targets = adjacency.get(from)
    if (targets) targets.push(to)
  }

  const WHITE = 0, GRAY = 1, BLACK = 2
  const color = new Map<string, number>()
  for (const id of nodes.keys()) color.set(id, WHITE)

  const cycles: Array<string[]> = []
  const stack: string[] = []

  function dfs(u: string): boolean {
    color.set(u, GRAY)
    stack.push(u)
    for (const v of adjacency.get(u) ?? []) {
      if (!nodes.has(v)) continue
      const c = color.get(v)
      if (c === GRAY) {
        // Found a back edge → cycle. Extract the cycle from the stack.
        const cycleStart = stack.indexOf(v)
        if (cycleStart >= 0) {
          const cycle = [...stack.slice(cycleStart), v]
          cycles.push(cycle)
        }
      } else if (c === WHITE) {
        dfs(v)
      }
    }
    stack.pop()
    color.set(u, BLACK)
    return true
  }

  for (const id of nodes.keys()) {
    if (color.get(id) === WHITE) {
      dfs(id)
    }
  }

  // Deduplicate cycles that are rotations of each other
  const canonical = new Set<string>()
  const unique: Array<string[]> = []
  for (const cycle of cycles) {
    // Remove the repeated last node (v appears twice) for canonical form
    const nodesOnly = cycle.slice(0, -1)
    // Rotate so the lexicographically smallest node comes first
    let minIdx = 0
    for (let i = 1; i < nodesOnly.length; i++) {
      if (nodesOnly[i] < nodesOnly[minIdx]) minIdx = i
    }
    const rotated = [...nodesOnly.slice(minIdx), ...nodesOnly.slice(0, minIdx)]
    const key = rotated.join("|")
    if (!canonical.has(key)) {
      canonical.add(key)
      unique.push([...rotated, rotated[0]]) // close the cycle
    }
  }
  return unique
}

function resolveImport(imp: string, fromFile: string, nodes: Map<string, any>): string | null {
  // Handle relative imports
  if (imp.startsWith(".") || imp.startsWith("/")) {
    const dir = path.dirname(fromFile)
    let resolved = path.resolve(dir, imp)
    // Add extension if missing
    if (!path.extname(resolved)) {
      for (const ext of [".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs"]) {
        if (nodes.has(resolved + ext)) return resolved + ext
      }
      if (nodes.has(resolved)) return resolved
    }
    if (nodes.has(resolved)) return resolved
    // Try with index
    for (const ext of [".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs"]) {
      const withIndex = path.join(resolved, "index" + ext)
      if (nodes.has(withIndex)) return withIndex
    }
  }
  // For absolute imports (node_modules, etc.), check if we have a matching file
  // This is a best-effort approach
  for (const [nodePath] of nodes) {
    if (nodePath.endsWith(imp) || nodePath === imp) return nodePath
  }
  return null
}