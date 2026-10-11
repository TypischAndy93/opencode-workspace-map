import type { SymbolRule } from "../../config/index.ts"

/**
 * Ruby symbol extraction rules.
 * Covers: Ruby (.rb)
 */
export const RUBY_SYMBOL_RULES: SymbolRule[] = [
  { re: /^\s*def\s+([A-Za-z_]\w*(?:\.[A-Za-z_]\w*|[A-Za-z_]\w*))/i, group: 1, kind: "export", symbolKind: "function" },
  { re: /^\s*class\s+([A-Za-z_]\w*(?:\.[A-Za-z_]\w*|[A-Za-z_]\w*))/i, group: 1, kind: "export", symbolKind: "class" },
  { re: /^\s*module\s+([A-Za-z_]\w*(?:\.[A-Za-z_]\w*|[A-Za-z_]\w*))/i, group: 1, kind: "export", symbolKind: "module" },
]

export const RUBY_EXTENSIONS = ["rb"] as const
