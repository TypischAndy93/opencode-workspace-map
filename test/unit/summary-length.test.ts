import { describe, it, expect } from "vitest"
import { codeSummary, collectSymbols } from "../../src/summarizers/summarize-utils.ts"
import { JAVASCRIPT_SYMBOL_RULES } from "../../src/summarizers/languages/javascript.ts"
import { DEFAULT_OPTIONS, type Options } from "../../src/config/index.js"

function createTestOpts(overrides: Partial<Options> = {}): Options {
  return { ...DEFAULT_OPTIONS, ...overrides }
}

describe("summary length caps", () => {
  it("codeSummary returns valid structure for JS files", () => {
    const opts = createTestOpts()
    const content = "export function foo() {}\nexport class Bar {}\nimport { something } from 'something'\n"
    const { summary, symbols, imports } = codeSummary(content, "js")
    expect(typeof summary).toBe("string")
    expect(Array.isArray(symbols)).toBe(true)
    expect(Array.isArray(imports)).toBe(true)
    expect(imports).toContain("something")
  })

  it("codeSummary does not throw on empty input", () => {
    const opts = createTestOpts()
    const { summary } = codeSummary("", "js")
    expect(typeof summary).toBe("string")
  })

  it("codeSummary does not throw on very long input", () => {
    const opts = createTestOpts()
    const content = "x".repeat(10000)
    const { summary } = codeSummary(content, "js")
    expect(typeof summary).toBe("string")
  })

  it("collectSymbols deduplicates symbol names", () => {
    const lines = [
      "export function foo() {}",
      "export function foo() {}",
      "export function bar() {}",
      "export function bar() {}",
    ]
    const { exports } = collectSymbols(lines, JAVASCRIPT_SYMBOL_RULES)
    const seen = new Set<string>()
    for (const e of exports) {
      expect(seen.has(e.name)).toBe(false)
      seen.add(e.name)
    }
    expect(seen.size).toBe(2) // foo and bar
  })

  it("collectSymbols handles arbitrary input without throwing", () => {
    const lines = ["", "   ", "export function test() {}", "not valid js at all!!!"]
    const { exports } = collectSymbols(lines, JAVASCRIPT_SYMBOL_RULES)
    expect(Array.isArray(exports)).toBe(true)
  })
})
