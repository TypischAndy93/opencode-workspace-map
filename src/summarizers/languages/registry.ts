import type { SymbolRule } from "../../config/index.ts"

// Import all language rule modules
import { JAVASCRIPT_SYMBOL_RULES, JAVASCRIPT_EXTENSIONS } from "./javascript.ts"
import { PYTHON_SYMBOL_RULES, PYTHON_EXTENSIONS } from "./python.ts"
import { GO_SYMBOL_RULES, GO_EXTENSIONS } from "./go.ts"
import { RUST_SYMBOL_RULES, RUST_EXTENSIONS } from "./rust.ts"
import { JVM_SYMBOL_RULES, JVM_EXTENSIONS } from "./jvm.ts"
import { CSHARP_SYMBOL_RULES, CSHARP_EXTENSIONS } from "./csharp.ts"
import { SHELL_SYMBOL_RULES, SHELL_EXTENSIONS } from "./shell.ts"
import { SQL_SYMBOL_RULES, SQL_EXTENSIONS } from "./sql.ts"
import { C_SYMBOL_RULES, C_EXTENSIONS } from "./c.ts"
import { PHP_SYMBOL_RULES, PHP_EXTENSIONS } from "./php.ts"
import { RUBY_SYMBOL_RULES, RUBY_EXTENSIONS } from "./ruby.ts"
import { SWIFT_DART_SYMBOL_RULES, SWIFT_DART_EXTENSIONS } from "./swift-dart.ts"
import { LUA_SYMBOL_RULES, LUA_EXTENSIONS } from "./lua.ts"
import { GENERIC_CODE_SYMBOL_RULES } from "./generic.ts"

export interface LanguageRules {
  extensions: readonly string[]
  rules: SymbolRule[]
}

/**
 * Language rule registry.
 * Maps extensions to their symbol extraction rules.
 */
export class LanguageRuleRegistry {
  private rulesByExt: Map<string, SymbolRule[]> = new Map()
  private extensions: Set<string> = new Set()
  
  constructor() {
    this.registerBuiltinLanguages()
  }
  
  private registerBuiltinLanguages(): void {
    this.register("javascript", JAVASCRIPT_EXTENSIONS, JAVASCRIPT_SYMBOL_RULES)
    this.register("typescript", JAVASCRIPT_EXTENSIONS, JAVASCRIPT_SYMBOL_RULES)
    this.register("python", PYTHON_EXTENSIONS, PYTHON_SYMBOL_RULES)
    this.register("go", GO_EXTENSIONS, GO_SYMBOL_RULES)
    this.register("rust", RUST_EXTENSIONS, RUST_SYMBOL_RULES)
    this.register("csharp", CSHARP_EXTENSIONS, CSHARP_SYMBOL_RULES)
    this.register("jvm", JVM_EXTENSIONS, JVM_SYMBOL_RULES)
    this.register("shell", SHELL_EXTENSIONS, SHELL_SYMBOL_RULES)
    this.register("sql", SQL_EXTENSIONS, SQL_SYMBOL_RULES)
    this.register("c", C_EXTENSIONS, C_SYMBOL_RULES)
    this.register("php", PHP_EXTENSIONS, PHP_SYMBOL_RULES)
    this.register("ruby", RUBY_EXTENSIONS, RUBY_SYMBOL_RULES)
    this.register("swift-dart", SWIFT_DART_EXTENSIONS, SWIFT_DART_SYMBOL_RULES)
    this.register("lua", LUA_EXTENSIONS, LUA_SYMBOL_RULES)
  }
  
  /**
   * Register a language with its extensions and rules.
   * @param name - Language identifier (e.g., "javascript", "python")
   * @param extensions - File extensions (without dot) this language uses
   * @param rules - Symbol extraction rules for this language
   */
  register(name: string, extensions: readonly string[], rules: SymbolRule[]): void {
    for (const ext of extensions) {
      this.rulesByExt.set(ext, rules)
      this.extensions.add(ext)
    }
  }
  
  /**
   * Get symbol rules for a file extension.
   * @param ext - File extension without dot (e.g., "ts", "py")
   * @returns Symbol rules for the extension, or generic rules if not found
   */
  get(ext: string): SymbolRule[] {
    return this.rulesByExt.get(ext.toLowerCase()) ?? GENERIC_CODE_SYMBOL_RULES
  }
  
  /**
   * Check if an extension is registered.
   */
  has(ext: string): boolean {
    return this.extensions.has(ext.toLowerCase())
  }
  
  /**
   * Get all registered extensions.
   */
  getAllExtensions(): string[] {
    return [...this.extensions]
  }
  
  /**
   * Get rules for a language by name.
   */
  getByLanguage(name: string): SymbolRule[] | undefined {
    // This is a simple lookup - in practice you'd want a reverse map
    const langMap: Record<string, SymbolRule[]> = {
      javascript: JAVASCRIPT_SYMBOL_RULES,
      typescript: JAVASCRIPT_SYMBOL_RULES,
      python: PYTHON_SYMBOL_RULES,
      go: GO_SYMBOL_RULES,
      rust: RUST_SYMBOL_RULES,
      csharp: CSHARP_SYMBOL_RULES,
      jvm: JVM_SYMBOL_RULES,
      shell: SHELL_SYMBOL_RULES,
      sql: SQL_SYMBOL_RULES,
      c: C_SYMBOL_RULES,
      php: PHP_SYMBOL_RULES,
      ruby: RUBY_SYMBOL_RULES,
      "swift-dart": SWIFT_DART_SYMBOL_RULES,
      lua: LUA_SYMBOL_RULES,
    }
    return langMap[name.toLowerCase()]
  }
}

// Export singleton instance
export const languageRuleRegistry = new LanguageRuleRegistry()

// Re-export generic rules for fallback
export { GENERIC_CODE_SYMBOL_RULES } from "./generic.ts"
