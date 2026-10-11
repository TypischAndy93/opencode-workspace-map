import type { SymbolRule, SummarySectionConfig, SymbolInfo, SummarySections } from "../config/index.ts"
import {
  languageRuleRegistry,
  GENERIC_CODE_SYMBOL_RULES,
  familyOf,
  extOf,
  CODE_EXT,
  DATA_EXT,
} from "../config/index.ts"

export { familyOf, extOf }

export function leadingDoc(content: string): string | undefined {
  const lines = content.split(/\r?\n/).slice(0, 40)
  let block: string | undefined
  if (lines[0]?.trimStart().startsWith("/**")) {
    const buf: string[] = []
    for (const line of lines) {
      buf.push(line.replace(/^\s*\/?\*+\/?/, "").trim())
      if (line.includes("*/") && buf.length > 1) break
    }
    block = buf.filter(Boolean).join(" ")
  } else {
    const buf: string[] = []
    for (const line of lines) {
      const t = line.trimStart()
      if (t.startsWith("#") || t.startsWith("//")) buf.push(t.replace(/^[#/]+\s?/, "").trim())
      else if (buf.length) break
    }
    if (buf.length) block = buf.join(" ")
  }
  if (!block) return undefined
  return block.length > 140 ? block.slice(0, 140) + "…" : block
}

export function extractTodos(content: string, maxTodos: number = 5): string[] {
  const todos: string[] = []
  const lines = content.split(/\r?\n/)
  const todoRe = /\b(TODO|FIXME|HACK|BUG|XXX|NOTE)\b\s*[:\-]?\s*(.+)/i
  for (const line of lines) {
    const m = todoRe.exec(line)
    if (m && m[2]?.trim()) {
      todos.push(`${m[1].toUpperCase()}: ${m[2].trim().slice(0, 100)}`)
      if (todos.length >= maxTodos) break
    }
  }
  return todos
}

export function extractPurpose(content: string, maxLength: number = 200): string | undefined {
  // Try to get the leading doc comment first
  const doc = leadingDoc(content)
  if (doc && doc.length > 20) return doc
  
  // Fallback: first meaningful comment line
  const lines = content.split(/\r?\n/)
  for (const line of lines.slice(0, 30)) {
    const trimmed = line.trimStart()
    if (trimmed.startsWith("//") || trimmed.startsWith("#") || trimmed.startsWith("/*")) {
      const cleaned = trimmed.replace(/^[\/#\*]+\s*/, "").trim()
      if (cleaned.length > 20) {
        return cleaned.length > maxLength ? cleaned.slice(0, maxLength) + "…" : cleaned
      }
    }
  }
  return undefined
}

export function collectSymbols(lines: string[], rules: SymbolRule[]): { exports: Array<{ name: string; kind?: SymbolInfo["kind"] }>; locals: Array<{ name: string; kind?: SymbolInfo["kind"] }> } {
  const exports: Array<{ name: string; kind?: SymbolInfo["kind"] }> = []
  const locals: Array<{ name: string; kind?: SymbolInfo["kind"] }> = []
  for (const line of lines) {
    for (const rule of rules) {
      const m = rule.re.exec(line)
      if (m?.[rule.group]) {
        const name = m[rule.group]
        const bucket = rule.kind === "export" ? exports : locals
        if (!bucket.some(s => s.name === name)) {
          const kind = rule.symbolKind as SymbolInfo["kind"] | undefined
          bucket.push({ name, kind })
        }
        break
      }
    }
    if (exports.length >= 40 && locals.length >= 20) break
  }
  return { exports, locals }
}
 
export function collectImports(content: string, family: string): string[] {
  const specs = new Set<string>()
  const add = (s: string) => {
    const v = s.trim()
    if (v) specs.add(v)
  }
  if (family === "js") {
    let m: RegExpExecArray | null
    const fromRe = /(?:^|\s)(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g
    while ((m = fromRe.exec(content))) add(m[1])
    const reqRe = /require\(\s*['"]([^'"]+)['"]\s*\)/g
    while ((m = reqRe.exec(content))) add(m[1])
  } else if (family === "py") {
    let m: RegExpExecArray | null
    const re = /^\s*(?:from\s+([A-Za-z0-9_.]+)\s+import|import\s+([A-Za-z0-9_.,\s]+))/gm
    while ((m = re.exec(content))) add(m[1] ?? (m[2] ?? "").split(",")[0])
  } else if (family === "go") {
    let m: RegExpExecArray | null
    const re = /^\s*(?:import\s+)?[`"]([^`"]+)[`"]/gm
    while ((m = re.exec(content))) add(m[1])
  } else if (family === "rust") {
    let m: RegExpExecArray | null
    const re = /^\s*use\s+([A-Za-z0-9_:]+)/gm
    while ((m = re.exec(content))) add(m[1])
  } else if (family === "jvm") {
    let m: RegExpExecArray | null
    const re = /^\s*import\s+([A-Za-z0-9_.*]+)/gm
    while ((m = re.exec(content))) add(m[1])
  } else if (family === "code") {
    let m: RegExpExecArray | null
    const re = /^\s*#\s*include\s+[<"]([^>"]+)[>"]/gm
    while ((m = re.exec(content))) add(m[1])
  }
  return [...specs].slice(0, 25)
}

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

export function codeSummary(content: string, ext: string, sectionConfig?: SummarySectionConfig, maxLength?: number): { summary: string; symbols: Array<{ name: string; kind?: string }>; imports: string[]; sections?: SummarySections } {
  const lines = content.split(/\r?\n/)
  const family = familyOf(ext)
  const rules = languageRuleRegistry.get(ext)
  const { exports, locals } = collectSymbols(lines, rules)
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

export function parseModelSummary(text: string): { summary: string; symbols: string[] } {
  const symbols: string[] = []
  const kept: string[] = []
  for (const line of (text ?? "").split(/\r?\n/)) {
    const m = /^\s*symbols?\s*:\s*(.+)$/i.exec(line)
    if (m) {
      for (const part of m[1].split(/[,\s]+/)) {
        const s = part.replace(/[`'"]/g, "").trim()
        if (s && !symbols.includes(s)) symbols.push(s)
      }
    } else if (line.trim()) {
      kept.push(line.trim())
    }
  }
  return { summary: kept.join(" ").slice(0, 400), symbols: symbols.slice(0, 40) }
}