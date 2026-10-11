import type { SymbolRule } from "../../config/index.ts"

/**
 * Lua symbol extraction rules.
 * Covers: Lua (.lua)
 */
export const LUA_SYMBOL_RULES: SymbolRule[] = [
  { re: /^\s*(?:local\s+)?function\s+([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)/, group: 1, kind: "local", symbolKind: "function" },
]

export const LUA_EXTENSIONS = ["lua"] as const
