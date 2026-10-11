import type { SymbolRule } from "../../config/index.ts"

/**
 * Generic code symbol extraction rules.
 * Fallback for languages without specific rules.
 */
export const GENERIC_CODE_SYMBOL_RULES: SymbolRule[] = [
  { re: /^\s*(?:public|private|protected|internal|static|final|abstract|async)?\s*function\s+([A-Za-z_]\w*)/, group: 1, kind: "local", symbolKind: "function" },
  { re: /^\s*(?:public|private|protected|internal|static|final|abstract|async)?\s*class\s+([A-Za-z_]\w*)/, group: 1, kind: "local", symbolKind: "class" },
  { re: /^\s*(?:public|private|protected|internal|static|final|abstract|async)?\s*struct\s+([A-Za-z_]\w*)/, group: 1, kind: "local", symbolKind: "class" },
  { re: /^\s*(?:public|private|protected|internal|static|final|abstract|async)?\s*enum\s+([A-Za-z_]\w*)/, group: 1, kind: "local", symbolKind: "enum" },
  { re: /^\s*(?:public|private|protected|internal|static|final|abstract|async)?\s*interface\s+([A-Za-z_]\w*)/, group: 1, kind: "local", symbolKind: "interface" },
  { re: /^\s*(?:const|let|var)\s+([A-Za-z_]\w*)/, group: 1, kind: "local", symbolKind: "var" },
  { re: /^\s*def\s+([A-Za-z_]\w*)/, group: 1, kind: "local", symbolKind: "function" },
  { re: /^\s*fun\s+([A-Za-z_]\w*)/, group: 1, kind: "local", symbolKind: "function" },
]

export const GENERIC_CODE_EXTENSIONS = [] as const
