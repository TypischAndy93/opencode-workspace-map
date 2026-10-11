import type { SymbolRule } from "../../config/index.ts"

/**
 * Go symbol extraction rules.
 * Covers: Go (.go)
 */
export const GO_SYMBOL_RULES: SymbolRule[] = [
  { re: /^func\s+(?:\([^)]*\)\s*)?([A-Z][A-Za-z0-9_]*)/, group: 1, kind: "export", symbolKind: "function" },
  { re: /^type\s+([A-Z][A-Za-z0-9_]*)/, group: 1, kind: "export", symbolKind: "type" },
  { re: /^func\s+(?:\([^)]*\)\s*)?([a-z][A-Za-z0-9_]*)/, group: 1, kind: "local", symbolKind: "function" },
]

export const GO_EXTENSIONS = ["go"] as const
