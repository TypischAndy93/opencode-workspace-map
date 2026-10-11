import type { SymbolRule } from "../../config/index.ts"

/**
 * Swift/Dart symbol extraction rules.
 * Covers: Swift (.swift), Dart (.dart)
 */
export const SWIFT_DART_SYMBOL_RULES: SymbolRule[] = [
  { re: /^\s*(?:public|private|internal|open|final|static|async)?\s*(?:func|function)\s+([A-Za-z_]\w*)/, group: 1, kind: "export", symbolKind: "function" },
  { re: /^\s*(?:public|private|internal|open|final|static|async)?\s*class\s+([A-Za-z_]\w*)/, group: 1, kind: "export", symbolKind: "class" },
  { re: /^\s*(?:public|private|internal|open|final|static|async)?\s*struct\s+([A-Za-z_]\w*)/, group: 1, kind: "export", symbolKind: "class" },
  { re: /^\s*(?:public|private|internal|open|final|static|async)?\s*enum\s+([A-Za-z_]\w*)/, group: 1, kind: "export", symbolKind: "enum" },
  { re: /^\s*(?:public|private|internal|open|final|static|async)?\s*protocol\s+([A-Za-z_]\w*)/, group: 1, kind: "export", symbolKind: "interface" },
  { re: /^\s*(?:public|private|internal|open|final|static|async)?\s*extension\s+([A-Za-z_]\w*)/, group: 1, kind: "export", symbolKind: "class" },
]

export const SWIFT_DART_EXTENSIONS = ["swift", "dart"] as const
