import type { SymbolRule, SymbolInfo } from "../config/index.ts"
import { languageRuleRegistry, GENERIC_CODE_SYMBOL_RULES, familyOf } from "../config/index.ts"
import type { LanguageRules } from "./languages/registry.ts"

/**
 * Collect symbols (exports and locals) from source lines using language-specific rules.
 * Returns objects with name and optional kind (function, class, interface, etc.)
 */
export function collectSymbols(lines: string[], rules: SymbolRule[]): { exports: SymbolInfo[]; locals: SymbolInfo[] } {
  const exports: SymbolInfo[] = []
  const locals: SymbolInfo[] = []
  
  for (const line of lines) {
    for (const rule of rules) {
      const m = rule.re.exec(line)
      if (m?.[rule.group]) {
        const name = m[rule.group]
        const bucket = rule.kind === "export" ? exports : locals
        if (!bucket.some(s => s.name === name)) {
          const kind = rule.symbolKind as SymbolInfo["kind"] | undefined
          bucket.push({ name, kind })
        }
        break
      }
    }
    if (exports.length >= 40 && locals.length >= 20) break
  }
  return { exports, locals }
}

/**
 * Get symbol rules for a file extension using the language registry.
 * @param ext - File extension without dot (e.g., "ts", "py")
 * @returns Symbol rules for the extension, or generic rules if not found
 */
export function getSymbolRules(ext: string): SymbolRule[] {
  return languageRuleRegistry.get(ext.toLowerCase())
}

/**
 * Collect symbols for a file by detecting its language from extension.
 */
export function collectSymbolsForFile(lines: string[], ext: string): { exports: SymbolInfo[]; locals: SymbolInfo[] } {
  const rules = getSymbolRules(ext) ?? GENERIC_CODE_SYMBOL_RULES
  return collectSymbols(lines, rules)
}