import type { SymbolRule } from "../../config/index.ts"

/**
 * PHP symbol extraction rules.
 * Covers: PHP (.php)
 */
export const PHP_SYMBOL_RULES: SymbolRule[] = [
  { re: /^\s*(?:public|private|protected|static|final|abstract)?\s*function\s+(?:&\s*)?([A-Za-z_]\w*)/, group: 1, kind: "export", symbolKind: "function" },
  { re: /^\s*(?:public|private|protected|static|final|abstract)?\s*class\s+([A-Za-z_]\w*)/, group: 1, kind: "export", symbolKind: "class" },
  { re: /^\s*(?:public|private|protected|static|final|abstract)?\s*interface\s+([A-Za-z_]\w*)/, group: 1, kind: "export", symbolKind: "interface" },
  { re: /^\s*(?:public|private|protected|static|final|abstract)?\s*trait\s+([A-Za-z_]\w*)/, group: 1, kind: "export", symbolKind: "interface" },
]

export const PHP_EXTENSIONS = ["php"] as const
