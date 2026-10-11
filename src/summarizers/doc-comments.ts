/**
 * Documentation comment extraction utilities.
 * Handles JSDoc, TSDoc, Python docstrings, and hash/slash comments.
 */

/**
 * Extract leading documentation comment from file content.
 * Supports JSDoc (/**, /**), hash comments (#), and slash comments (//).
 * Returns first meaningful comment block, truncated to 140 chars.
 */
export function leadingDoc(content: string): string | undefined {
  const lines = content.split(/\r?\n/).slice(0, 40)
  let block: string | undefined
  
  const firstLine = lines[0]?.trimStart() ?? ""
  
  // JSDoc/TSDoc style: /** ... */
  if (firstLine.startsWith("/**")) {
    const buf: string[] = []
    for (const line of lines) {
      buf.push(line.replace(/^\s*\/?\*+\/?/, "").trim())
      if (line.includes("*/") && buf.length > 1) break
    }
    block = buf.filter(Boolean).join(" ")
  }
  // Python docstrings: """...""" or '''...''' (check first few lines)
  else if (firstLine.startsWith('"""') || firstLine.startsWith("'''") || 
           lines.slice(1, 5).some(l => l.trimStart().startsWith('"""') || l.trimStart().startsWith("'''"))) {
    const quote = firstLine.startsWith('"""') || lines.slice(1,5).some(l => l.trimStart().startsWith('"""')) ? '"""' : "'''"
    const buf: string[] = []
    let foundClosing = false
    for (const line of lines) {
      const trimmed = line.trimStart()
      if (trimmed.startsWith(quote) && trimmed !== quote) {
        // Single-line docstring: """docstring"""
        const content = trimmed.slice(3, -3).trim()
        if (content) buf.push(content)
        foundClosing = true
        break
      } else if (trimmed.startsWith(quote)) {
        // Opening quote, continue collecting
        continue
      } else if (trimmed.endsWith(quote)) {
        // Closing quote
        buf.push(trimmed.slice(0, -3).trim())
        foundClosing = true
        break
      } else if (buf.length > 0 || trimmed.startsWith(quote)) {
        // Inside docstring
        buf.push(trimmed)
      }
    }
    if (foundClosing || buf.length > 0) {
      block = buf.filter(Boolean).join(" ")
    }
  }
  // Hash/slash comments
  else {
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

/**
 * Extract TODO/FIXME/HACK/BUG/XXX/NOTE comments from content.
 * Returns array of formatted TODO strings, limited by maxTodos.
 */
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

/**
 * Extract purpose/description from leading documentation.
 * First tries leadingDoc(), then falls back to first meaningful comment line.
 * Returns undefined if no meaningful purpose found.
 */
export function extractPurpose(content: string, maxLength: number = 200): string | undefined {
  // Try to get the leading doc comment first
  const doc = leadingDoc(content)
  if (doc && doc.length > 20) return doc.length > maxLength ? doc.slice(0, maxLength) + "…" : doc
  
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