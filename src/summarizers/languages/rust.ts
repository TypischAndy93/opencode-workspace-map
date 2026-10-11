import type { SymbolRule } from "../../config/index.ts"

/**
 * Rust symbol extraction rules.
 * Covers: Rust (.rs)
 */
export const RUST_SYMBOL_RULES: SymbolRule[] = [
  { re: /^\s*pub\s+(?:async\s+)?fn\s+([A-Za-z0-9_]+)/, group: 1, kind: "export", symbolKind: "function" },
  { re: /^\s*pub\s+struct\s+([A-Za-z0-9_]+)/, group: 1, kind: "export", symbolKind: "class" },
  { re: /^\s*pub\s+enum\s+([A-Za-z0-9_]+)/, group: 1, kind: "export", symbolKind: "enum" },
  { re: /^\s*pub\s+trait\s+([A-Za-z0-9_]+)/, group: 1, kind: "export", symbolKind: "interface" },
  { re: /^\s*pub\s+type\s+([A-Za-z0-9_]+)/, group: 1, kind: "export", symbolKind: "type" },
  { re: /^\s*pub\s+mod\s+([A-Za-z0-9_]+)/, group: 1, kind: "export", symbolKind: "module" },
  { re: /^\s*pub\s+const\s+([A-Za-z0-9_]+)/, group: 1, kind: "export", symbolKind: "const" },
  { re: /^\s*pub\s+static\s+([A-Za-z0-9_]+)/, group: 1, kind: "export", symbolKind: "const" },
  { re: /^\s*(?:async\s+)?fn\s+([A-Za-z0-9_]+)/, group: 1, kind: "local", symbolKind: "function" },
  { re: /^\s*struct\s+([A-Za-z0-9_]+)/, group: 1, kind: "local", symbolKind: "class" },
  { re: /^\s*enum\s+([A-Za-z0-9_]+)/, group: 1, kind: "local", symbolKind: "enum" },
  { re: /^\s*trait\s+([A-Za-z0-9_]+)/, group: 1, kind: "local", symbolKind: "interface" },
  { re: /^\s*type\s+([A-Za-z0-9_]+)/, group: 1, kind: "local", symbolKind: "type" },
  { re: /^\s*mod\s+([A-Za-z0-9_]+)/, group: 1, kind: "local", symbolKind: "module" },
]

export const RUST_EXTENSIONS = ["rs"] as const
