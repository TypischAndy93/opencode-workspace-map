import type { SymbolRule } from "../../config/index.ts"

/**
 * C/C++ symbol extraction rules.
 * Covers: C (.c, .h), C++ (.cc, .cpp, .cxx, .hpp, .hh)
 */
export const C_SYMBOL_RULES: SymbolRule[] = [
  { re: /^\s*#\s*define\s+([A-Za-z_][A-Za-z0-9_]*)/, group: 1, kind: "local", symbolKind: "const" },
  { re: /^\s*typedef\s+[^;]*?\s([A-Za-z_]\w*)\s*;/, group: 1, kind: "export", symbolKind: "type" },
  { re: /^\s*(?:static\s+|inline\s+|const\s+|extern\s+)*(?:[\w:]+\s+)+([A-Za-z_]\w*)\s*\([^;]*?\)\s*\{/, group: 1, kind: "local", symbolKind: "function" },
]

export const C_EXTENSIONS = ["c", "cc", "cpp", "cxx", "h", "hpp", "hh"] as const
