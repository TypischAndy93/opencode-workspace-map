import type { SymbolRule } from "../../config/index.ts"

/**
 * SQL symbol extraction rules.
 * Covers: SQL (.sql)
 */
export const SQL_SYMBOL_RULES: SymbolRule[] = [
  { re: /^\s*(CREATE|ALTER|DROP)\s+(TABLE|VIEW|INDEX|PROCEDURE|FUNCTION|TRIGGER|SEQUENCE)\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z0-9_.]+)/i, group: 3, kind: "export", symbolKind: "function" },
]

export const SQL_EXTENSIONS = ["sql"] as const
