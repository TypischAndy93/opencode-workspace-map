import type { SymbolRule } from "../../config/index.ts"

/**
 * JavaScript/TypeScript symbol extraction rules.
 * Covers: JS, TS, JSX, TSX, Vue, Svelte
 */
export const JAVASCRIPT_SYMBOL_RULES: SymbolRule[] = [
  // Exported functions
  { re: /^\s*export\s+default\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/, group: 1, kind: "export", symbolKind: "function" },
  { re: /^\s*export\s+default\s+(?:async\s+)?class\s+([A-Za-z0-9_$]+)/, group: 1, kind: "export", symbolKind: "class" },
  { re: /^\s*export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/, group: 1, kind: "export", symbolKind: "function" },
  { re: /^\s*export\s+(?:abstract\s+)?class\s+([A-Za-z0-9_$]+)/, group: 1, kind: "export", symbolKind: "class" },
  { re: /^\s*export\s+const\s+([A-Za-z0-9_$]+)/, group: 1, kind: "export", symbolKind: "const" },
  { re: /^\s*export\s+let\s+([A-Za-z0-9_$]+)/, group: 1, kind: "export", symbolKind: "var" },
  { re: /^\s*export\s+var\s+([A-Za-z0-9_$]+)/, group: 1, kind: "export", symbolKind: "var" },
  { re: /^\s*export\s+interface\s+([A-Za-z0-9_$]+)/, group: 1, kind: "export", symbolKind: "interface" },
  { re: /^\s*export\s+type\s+([A-Za-z0-9_$]+)/, group: 1, kind: "export", symbolKind: "type" },
  { re: /^\s*export\s+enum\s+([A-Za-z0-9_$]+)/, group: 1, kind: "export", symbolKind: "enum" },
  { re: /^\s*export\s+namespace\s+([A-Za-z0-9_$]+)/, group: 1, kind: "export", symbolKind: "namespace" },
  
  // Local (non-exported) symbols
  { re: /^\s*(?:async\s+)?function\s+([A-Za-z0-9_$]+)/, group: 1, kind: "local", symbolKind: "function" },
  { re: /^\s*(?:abstract\s+)?class\s+([A-Za-z0-9_$]+)/, group: 1, kind: "local", symbolKind: "class" },
  { re: /^\s*(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?\(/, group: 1, kind: "local", symbolKind: "function" },
]

export const JAVASCRIPT_EXTENSIONS = ["js", "jsx", "mjs", "cjs", "ts", "tsx", "vue", "svelte"] as const
