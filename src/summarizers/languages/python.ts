import type { SymbolRule } from "../../config/index.ts"

/**
 * Python symbol extraction rules.
 * Covers: Python (.py)
 */
export const PYTHON_SYMBOL_RULES: SymbolRule[] = [
  { re: /^(?:async\s+)?def\s+([A-Za-z0-9_]+)/, group: 1, kind: "export", symbolKind: "function" },
  { re: /^class\s+([A-Za-z0-9_]+)/, group: 1, kind: "export", symbolKind: "class" },
]

export const PYTHON_EXTENSIONS = ["py"] as const
