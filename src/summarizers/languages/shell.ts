import type { SymbolRule } from "../../config/index.ts"

/**
 * Shell script symbol extraction rules.
 * Covers: Shell (.sh, .bash, .zsh, .ps1)
 */
export const SHELL_SYMBOL_RULES: SymbolRule[] = [
  { re: /^\s*function\s+([A-Za-z_][A-Za-z0-9_]*)/, group: 1, kind: "local", symbolKind: "function" },
  { re: /^([A-Za-z_][A-Za-z0-9_]*)\s*\(\)/, group: 1, kind: "local", symbolKind: "function" },
]

export const SHELL_EXTENSIONS = ["sh", "bash", "zsh", "ps1"] as const
