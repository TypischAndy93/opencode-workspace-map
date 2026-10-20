import type { SymbolRule } from "../../config/index.ts"

/**
 * C# (Roslyn-style) symbol extraction rules.
 * Covers: C# (.cs)
 *
 * Matches: classes, structs, interfaces, enums, records, methods,
 * properties, fields, events, delegates, namespaces, using directives.
 *
 * Modifier pattern: (?:\s*(?:public|private|...))* allows multiple
 * modifiers (e.g., "public abstract class", "public static async Task").
 * Type pattern: (?:\s*[\w<>\[\]?,\.]+\s+)? allows optional return/type
 * annotation before the symbol name.
 */
export const CSHARP_SYMBOL_RULES: SymbolRule[] = [
  // Namespaces
  { re: /^\s*namespace\s+([A-Za-z_]\w*(?:\.\w+)*)/, group: 1, kind: "export", symbolKind: "namespace" },
  // Using directives (imports)
  { re: /^\s*using\s+([A-Za-z_]\w*(?:\.\w+)*)\s*;/, group: 1, kind: "local", symbolKind: "module" },
  // Classes (including generic, sealed, abstract, static, partial)
  { re: /^\s*(?:\s*(?:public|private|protected|internal|static|sealed|abstract|partial|unsafe))+\s*class\s+([A-Za-z_]\w*)/, group: 1, kind: "export", symbolKind: "class" },
  // Structs
  { re: /^\s*(?:\s*(?:public|private|protected|internal|static|sealed|abstract|partial|unsafe))+\s*struct\s+([A-Za-z_]\w*)/, group: 1, kind: "export", symbolKind: "class" },
  // Interfaces
  { re: /^\s*(?:\s*(?:public|private|protected|internal))+\s*interface\s+([A-Za-z_]\w*)/, group: 1, kind: "export", symbolKind: "interface" },
  // Enums
  { re: /^\s*(?:\s*(?:public|private|protected|internal))+\s*enum\s+([A-Za-z_]\w*)/, group: 1, kind: "export", symbolKind: "enum" },
  // Records
  { re: /^\s*(?:\s*(?:public|private|protected|internal))+\s*record\s+([A-Za-z_]\w*)/, group: 1, kind: "export", symbolKind: "class" },
  // Delegates
  { re: /^\s*(?:\s*(?:public|private|protected|internal))+\s*delegate\s+[\w<>\[\]?,\s]+\s+([A-Za-z_]\w*)/, group: 1, kind: "export", symbolKind: "function" },
  // Methods (including async, static, virtual, override, abstract, extern)
  { re: /^\s*(?:\s*(?:public|private|protected|internal|static|virtual|override|abstract|extern|async|new))*\s*(?:[\w<>\[\]?,\.\s]+\s+)?([A-Za-z_]\w*)\s*\(/, group: 1, kind: "local", symbolKind: "method" },
  // Properties (auto and full)
  { re: /^\s*(?:\s*(?:public|private|protected|internal|static|virtual|override|abstract|new))*\s*(?:[\w<>\[\]?,\.\s]+\s+)?([A-Za-z_]\w*)\s*\{/, group: 1, kind: "local", symbolKind: "property" },
  // Fields
  { re: /^\s*(?:\s*(?:public|private|protected|internal|static|readonly|const))*\s*(?:[\w<>\[\]?,\.\s]+\s+)?([A-Za-z_]\w*)\s*;/, group: 1, kind: "local", symbolKind: "var" },
  // Events
  { re: /^\s*(?:\s*(?:public|private|protected|internal|static))*\s*event\s+[\w<>\[\]?,\s]+\s+([A-Za-z_]\w*)/, group: 1, kind: "local", symbolKind: "method" },
]

export const CSHARP_EXTENSIONS = ["cs"] as const
