import { extOf, familyOf, type SummarySectionConfig } from "../config/index.ts"
import { leadingDoc, extractTodos, extractPurpose } from "./doc-comments.ts"
import { collectImports } from "./imports.ts"
import { collectSymbols, getSymbolRules, collectSymbolsForFile } from "./symbols.ts"
import type { SummarySections, SymbolInfo } from "../config/types.ts"

/**
 * Shared utilities for summarization.
 * Re-exports from sub-modules for backward compatibility.
 */

export { extOf, familyOf, leadingDoc, collectSymbols, collectImports, extractTodos, extractPurpose }
export { getSymbolRules, collectSymbolsForFile }

/**
 * Summarize data files (JSON, YAML, markdown, etc.)
 */
export function dataSummary(content: string, ext: string): { summary: string; symbols: string[] } {
  const lines = content.split(/\r?\n/)
  const symbols: string[] = []
  const push = (s: string) => {
    if (s && !symbols.includes(s)) symbols.push(s)
  }
  if (ext === "json" || ext === "jsonc") {
    try {
      const parsed = JSON.parse(content.replace(/^\s*\/\/.*$/gm, ""))
      if (Array.isArray(parsed)) {
        return { summary: `json array · ${parsed.length} items · ${lines.length} lines`, symbols: [] }
      }
      if (parsed && typeof parsed === "object") {
        for (const key of Object.keys(parsed)) push(key)
        const extra: string[] = []
        if (typeof (parsed as any).name === "string") extra.push(`name=${(parsed as any).name}`)
        if (typeof (parsed as any).version === "string") extra.push(`version=${(parsed as any).version}`)
        if ((parsed as any).scripts) extra.push(`scripts: ${Object.keys((parsed as any).scripts).slice(0, 8).join(", ")}`)
        return {
          summary: `json object · ${Object.keys(parsed).length} keys${extra.length ? " · " + extra.join(" · ") : ""}`,
          symbols: symbols.slice(0, 40),
        }
      }
    } catch {
      /* fall through */
    }
  }
  if (ext === "md" || ext === "mdx") {
    for (const line of lines) {
      const m = /^(#{1,3})\s+(.+)$/.exec(line)
      if (m) push(m[2].trim().slice(0, 60))
      if (symbols.length >= 20) break
    }
    return { summary: `markdown · ${lines.length} lines${symbols.length ? ` · sections: ${symbols.slice(0, 8).join(", ")}` : ""}`, symbols }
  }
  // yaml / toml / ini / cfg / properties: top-level keys and sections
  for (const line of lines) {
    const section = /^\s*\[([^\]]+)\]/.exec(line)
    const key = /^([A-Za-z0-9_."'-]+)\s*[:=]/.exec(line)
    if (section) push(section[1].trim())
    else if (key) push(key[1].replace(/["']/g, ""))
    if (symbols.length >= 30) break
  }
  return { summary: `${ext || "data"} file · ${lines.length} lines${symbols.length ? ` · keys: ${symbols.slice(0, 10).join(", ")}` : ""}`, symbols }
}

/**
 * Summarize code files with symbols, imports, and structured sections.
 */
export function codeSummary(
  content: string,
  ext: string,
  sectionConfig?: SummarySectionConfig,
  maxLength?: number
): { summary: string; symbols: SymbolInfo[]; imports: string[]; sections?: SummarySections } {
  const lines = content.split(/\r?\n/)
  // Use extension directly to get correct language-specific rules
  const { exports, locals } = collectSymbolsForFile(lines, ext)
  const family = familyOf(ext)
  const imports = collectImports(content, family)

  // Build structured sections
  const sections: SummarySections = {}
  
  const includePurpose = sectionConfig?.includePurpose ?? true
  const includeKeyExports = sectionConfig?.includeKeyExports ?? true
  const includeDependencies = sectionConfig?.includeDependencies ?? true
  const includeTodos = sectionConfig?.includeTodos ?? true
  const maxPurposeLength = sectionConfig?.maxPurposeLength ?? 200
  const maxExports = sectionConfig?.maxExports ?? 12
  const maxDependencies = sectionConfig?.maxDependencies ?? 8
  const maxTodos = sectionConfig?.maxTodos ?? 5
  
  if (includePurpose) {
    const purpose = extractPurpose(content, maxPurposeLength)
    if (purpose) sections.purpose = purpose
  }
  
  if (includeKeyExports) {
    const keyExports = exports.length ? exports.slice(0, maxExports) : locals.slice(0, maxExports)
    if (keyExports.length) sections.keyExports = keyExports
  }
  
  if (includeDependencies && imports.length) {
    sections.dependencies = imports.slice(0, maxDependencies)
  }
  
  if (includeTodos) {
    const todos = extractTodos(content, maxTodos)
    if (todos.length) sections.todos = todos
  }
  
  // Build traditional summary string for backward compatibility
  const bits = [`${ext} file`, `${lines.length} lines`]
  const formatSymbols = (arr: Array<{ name: string; kind?: string }>) =>
    arr.slice(0, 12).map(s => s.kind ? `${s.name}:${s.kind}` : s.name).join(", ")
  if (exports.length) bits.push(`exports: ${formatSymbols(exports)}`)
  if (!exports.length && locals.length) bits.push(`defines: ${formatSymbols(locals)}`)
  if (imports.length) bits.push(`imports: ${imports.slice(0, 8).join(", ")}`)
  const doc = leadingDoc(content)
  if (doc) bits.push(doc)
  
  let summary = bits.join(" · ")
  if (maxLength && summary.length > maxLength) {
    summary = summary.slice(0, maxLength - 1) + "…"
  }
  
  return { summary, symbols: exports.length ? exports : locals, imports, sections }
}

/**
 * Parse model-generated summary text into structured format.
 * Extracts "Symbols:" line and remaining summary text.
 */
export function parseModelSummary(text: string): { summary: string; symbols: string[] } {
  const symbols: string[] = []
  const kept: string[] = []
  for (const line of (text ?? "").split(/\r?\n/)) {
    const m = /^\s*symbols?\s*:\s*(.+)$/i.exec(line)
    if (m) {
      // Split on commas, semicolons, pipes, and whitespace
      for (const part of m[1].split(/[,;|\s]+/)) {
        const s = part.replace(/[`'"]/g, "").trim()
        if (s && !symbols.includes(s)) symbols.push(s)
      }
    } else if (line.trim()) {
      kept.push(line.trim())
    }
  }
  return { summary: kept.join(" ").slice(0, 400), symbols: symbols.slice(0, 40) }
}