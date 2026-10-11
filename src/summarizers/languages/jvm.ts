import type { SymbolRule } from "../../config/index.ts"

/**
 * JVM language symbol extraction rules.
 * Covers: Java (.java), Kotlin (.kt, .kts), Scala (.scala), C# (.cs)
 */
export const JVM_SYMBOL_RULES: SymbolRule[] = [
  { re: /^\s*(?:public|private|protected|internal)?\s*(?:static\s+|final\s+|abstract\s+|open\s+|sealed\s+|data\s+)*class\s+([A-Za-z0-9_]+)/, group: 1, kind: "export", symbolKind: "class" },
  { re: /^\s*(?:public|private|protected|internal)?\s*interface\s+([A-Za-z0-9_]+)/, group: 1, kind: "export", symbolKind: "interface" },
  { re: /^\s*(?:public|private|protected|internal)?\s*enum\s+([A-Za-z0-9_]+)/, group: 1, kind: "export", symbolKind: "enum" },
  { re: /^\s*(?:public|private|protected|internal)?\s*(?:static\s+)?fun\s+([A-Za-z0-9_]+)/, group: 1, kind: "export", symbolKind: "function" },
  { re: /^\s*(?:public|private|protected|internal)?\s*(?:static\s+)?(?:val|var)\s+([A-Za-z0-9_]+)/, group: 1, kind: "export", symbolKind: "property" },
]

export const JVM_EXTENSIONS = ["java", "kt", "kts", "scala", "cs"] as const
