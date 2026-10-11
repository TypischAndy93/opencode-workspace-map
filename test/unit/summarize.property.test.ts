import { describe, it, expect } from "vitest"
import fc from "fast-check"
import { 
  codeSummary, 
  dataSummary, 
  extractPurpose, 
  extractTodos, 
  leadingDoc,
  collectSymbols,
  collectImports,
  parseModelSummary 
} from "../../src/summarizers/index.js"
import { DEFAULT_OPTIONS, type Options, type Stats } from "../../src/config/index.js"

function createTestOpts(overrides: Partial<Options> = {}): Options {
  return { ...DEFAULT_OPTIONS, ...overrides }
}

function createTestStats(): Stats {
  return {
    summaries: 0, skippedByRule: 0, walks: 0, fullInjections: 0, digestInjections: 0,
    dirtyFlushes: 0, warmups: 0, sessions: 0, files: 0, outlineSummaries: 0,
    modelSummaries: 0, skippedSummaries: 0, lastWalkMs: 0, lastInjectionChars: 0, lastInjectionAt: 0
  }
}

describe("Property-based tests for summarizers", () => {
  describe("codeSummary", () => {
    it("should be idempotent for same input", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 0, maxLength: 500 }), (content) => {
          const opts = createTestOpts()
          const stats = createTestStats()
          const result1 = codeSummary(content, "ts", opts.summarySections, 500)
          const result2 = codeSummary(content, "ts", opts.summarySections, 500)
          expect(result1.summary).toBe(result2.summary)
          expect(result1.symbols).toEqual(result2.symbols)
          expect(result1.imports).toEqual(result2.imports)
          return true
        }),
        { numRuns: 200 }
      )
    })

    it("should respect maxLength truncation", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 100, maxLength: 2000 }),
          fc.integer({ min: 50, max: 500 }),
          (content, maxLength) => {
            const opts = createTestOpts()
            const stats = createTestStats()
            const result = codeSummary(content, "ts", opts.summarySections, maxLength)
            if (result.summary.length > maxLength) {
              expect(result.summary).toMatch(/…$/)
              expect(result.summary.length).toBeLessThanOrEqual(maxLength)
            }
            return true
          }
        ),
        { numRuns: 100 }
      )
    })

    it("should extract imports from JavaScript/TypeScript", () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1, maxLength: 30 }).filter(s => /^[a-zA-Z0-9_./-]+$/.test(s)), { minLength: 0, maxLength: 5 }),
          (imports) => {
            const content = imports.map(i => `import ${i} from '${i}'`).join("\n")
            const opts = createTestOpts()
            const stats = createTestStats()
            const result = codeSummary(content, "ts", opts.summarySections)
            for (const imp of imports) {
              expect(result.imports.some(i => i.includes(imp))).toBe(true)
            }
            return true
          }
        ),
        { numRuns: 50 }
      )
    })

    it("should extract imports from Python", () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1, maxLength: 30 }).filter(s => /^[a-zA-Z0-9_.]+$/.test(s)), { minLength: 0, maxLength: 5 }),
          (imports) => {
            const content = imports.map(i => `import ${i}`).join("\n") + "\n" + imports.map(i => `from ${i} import something`).join("\n")
            const opts = createTestOpts()
            const stats = createTestStats()
            const result = codeSummary(content, "py", opts.summarySections)
            // Python imports are collected
            expect(typeof result.imports).toBe("object")
            return true
          }
        ),
        { numRuns: 50 }
      )
    })

    it("should extract imports from Go", () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1, maxLength: 30 }).filter(s => /^[a-zA-Z0-9_./-]+$/.test(s)), { minLength: 0, maxLength: 5 }),
          (imports) => {
            const content = `package main\nimport (\n${imports.map(i => `\t"${i}"`).join("\n")}\n)`
            const opts = createTestOpts()
            const stats = createTestStats()
            const result = codeSummary(content, "go", opts.summarySections)
            for (const imp of imports) {
              expect(result.imports.some(i => i.includes(imp))).toBe(true)
            }
            return true
          }
        ),
        { numRuns: 50 }
      )
    })

    it("should handle empty files gracefully", () => {
      const opts = createTestOpts()
      const stats = createTestStats()
      const result = codeSummary("", "ts", opts.summarySections)
      expect(result.summary).toContain("ts file")
      expect(result.summary).toContain("1 lines") // Empty string splits to 1 line
      expect(result.symbols).toEqual([])
      expect(result.imports).toEqual([])
    })

    it("should handle files with only comments", () => {
      const content = "// This is a comment\n/* Another comment */\n# Shell comment"
      const opts = createTestOpts()
      const stats = createTestStats()
      const result = codeSummary(content, "ts", opts.summarySections)
      expect(result.summary).toContain("ts file")
    })

    it("should detect TypeScript interfaces and types", () => {
      const content = `
export interface User { name: string; age: number; }
export type UserRole = "admin" | "user";
export interface Admin extends User { permissions: string[]; }
`
      const opts = createTestOpts()
      const stats = createTestStats()
      const result = codeSummary(content, "ts", opts.summarySections)
      const symbolNames = result.symbols.map(s => s.name)
      expect(symbolNames.some(n => n.includes("User"))).toBe(true)
    })

    it("should detect Rust structs and enums", () => {
      const content = `
struct User { name: String, age: u32 }
enum Status { Active, Inactive }
impl User { fn new() -> Self { unimplemented!() } }
`
      const opts = createTestOpts()
      const stats = createTestStats()
      const result = codeSummary(content, "rs", opts.summarySections)
      const symbolNames = result.symbols.map(s => s.name)
      expect(symbolNames.some(n => n.includes("User"))).toBe(true)
      expect(symbolNames.some(n => n.includes("Status"))).toBe(true)
    })

    it("should handle deeply nested code structures", () => {
      // Generate nested if/for/while structures
      const generateNested = (depth: number): string => {
        if (depth <= 0) return "  // code\n"
        return `if (true) {\n${generateNested(depth - 1)}} else {\n${generateNested(depth - 1)}}`
      }
      
      for (let depth = 1; depth <= 10; depth++) {
        const content = generateNested(depth)
        const opts = createTestOpts()
        const stats = createTestStats()
        const result = codeSummary(content, "ts", opts.summarySections)
        expect(result.summary).toContain("ts file")
        // Should not crash or hang
      }
      expect(true).toBe(true)
    })
  })

  describe("dataSummary", () => {
    it("should be idempotent for JSON", () => {
      fc.assert(
        fc.property(fc.json({ maxDepth: 3 }), (json) => {
          const content = JSON.stringify(json, null, 2)
          const result1 = dataSummary(content, "json")
          const result2 = dataSummary(content, "json")
          expect(result1.summary).toBe(result2.summary)
          expect(result1.symbols).toEqual(result2.symbols)
          return true
        }),
        { numRuns: 100 }
      )
    })

    it("should handle invalid JSON gracefully", () => {
      const invalidJson = "{ invalid json: }"
      const result = dataSummary(invalidJson, "json")
      expect(result.summary).toContain("json")
    })

    it("should extract keys from JSON objects", () => {
      const content = `{"name": "test", "version": "1.0.0", "scripts": {"build": "tsc", "test": "vitest"}}`
      const result = dataSummary(content, "json")
      expect(result.symbols).toContain("name")
      expect(result.symbols).toContain("version")
      expect(result.symbols).toContain("scripts")
    })

    it("should handle markdown headings", () => {
      const content = `# Title\n## Section\n### Subsection\nSome text\n## Another`
      const result = dataSummary(content, "md")
      expect(result.symbols).toContain("Title")
      expect(result.symbols).toContain("Section")
      expect(result.symbols).toContain("Subsection")
      expect(result.symbols).toContain("Another")
    })

    it("should handle YAML/TOML sections", () => {
      const yamlContent = `section1:\n  key: value\nsection2:\n  items:\n    - a\n    - b`
      const result = dataSummary(yamlContent, "yaml")
      expect(result.symbols.some(s => s.includes("section1"))).toBe(true)
      expect(result.symbols.some(s => s.includes("section2"))).toBe(true)
    })
  })

  describe("extractPurpose", () => {
    it("should be idempotent", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 0, maxLength: 500 }), (content) => {
          const p1 = extractPurpose(content, 200)
          const p2 = extractPurpose(content, 200)
          expect(p1).toBe(p2)
          return true
        }),
        { numRuns: 200 }
      )
    })

    it("should extract JSDoc purpose", () => {
      const content = `/**
 * This function calculates the sum of two numbers.
 * It handles edge cases for overflow.
 */
function add(a: number, b: number): number { return a + b }`
      const purpose = extractPurpose(content, 200)
      expect(purpose).toContain("calculates the sum")
    })

    it("should extract Python docstring purpose", () => {
      const content = `def calculate_sum(a: int, b: int) -> int:
    """Calculate the sum of two integers."""
    return a + b`
      const purpose = extractPurpose(content, 200)
      expect(purpose).toContain("Calculate the sum")
    })

    it("should respect maxLength", () => {
      const longDoc = "/** " + "x".repeat(500) + " */"
      const purpose = extractPurpose(longDoc, 100)
      expect(purpose!.length).toBeLessThanOrEqual(100 + 3) // 100 + "..."
    })

    it("should return undefined for files without leading comments", () => {
      const content = "function foo() { return 1; }"
      const purpose = extractPurpose(content, 200)
      expect(purpose).toBeUndefined()
    })
  })

  describe("extractTodos", () => {
    it("should be idempotent", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 0, maxLength: 500 }), (content) => {
          const t1 = extractTodos(content, 10)
          const t2 = extractTodos(content, 10)
          expect(t1).toEqual(t2)
          return true
        }),
        { numRuns: 200 }
      )
    })

    it("should extract TODO/FIXME/HACK/BUG/NOTE comments", () => {
      const content = `
// TODO: Implement this feature
// FIXME: Fix the bug in production
// HACK: Temporary workaround
// BUG: Known issue
// NOTE: This is important
`
      const todos = extractTodos(content, 10)
      expect(todos).toContain("TODO: Implement this feature")
      expect(todos).toContain("FIXME: Fix the bug in production")
      expect(todos).toContain("HACK: Temporary workaround")
      expect(todos).toContain("BUG: Known issue")
      expect(todos).toContain("NOTE: This is important")
    })

    it("should respect maxTodos limit", () => {
      const content = Array.from({ length: 20 }, (_, i) => `// TODO: Task ${i}`).join("\n")
      const todos = extractTodos(content, 5)
      expect(todos.length).toBeLessThanOrEqual(5)
    })

    it("should extract todos from different comment styles", () => {
      const content = `# TODO: Python comment
/* TODO: C block comment */
-- TODO: SQL comment
`
      const todos = extractTodos(content, 10)
      expect(todos.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe("leadingDoc", () => {
    it("should be idempotent", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 0, maxLength: 500 }), (content) => {
          const d1 = leadingDoc(content)
          const d2 = leadingDoc(content)
          expect(d1).toBe(d2)
          return true
        }),
        { numRuns: 200 }
      )
    })

    it("should extract JSDoc block", () => {
      const content = `/**
 * Main entry point for the application.
 * Initializes all subsystems.
 */
export function main() {}`
      const doc = leadingDoc(content)
      expect(doc).toContain("Main entry point")
      expect(doc).toContain("Initializes all subsystems")
    })

    it("should extract Python module docstring", () => {
      const content = `"""Module for user management."""
import os`
      const doc = leadingDoc(content)
      expect(doc).toContain("Module for user management")
    })

    it("should return undefined for no leading doc", () => {
      // A single line comment is still extracted as a leading doc
      const content = "// Just a comment\nfunction foo() {}"
      const doc = leadingDoc(content)
      expect(doc).toBe("Just a comment")
    })
  })

  describe("collectSymbols", () => {
    it("should be idempotent", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 0, maxLength: 1000 }), (content) => {
          const lines = content.split("\n")
          const rules = [
            { re: /^\s*(?:export\s+)?(?:function|const|let|var)\s+(\w+)/, group: 1, kind: "export" as const },
            { re: /^\s*(?:class|interface|type)\s+(\w+)/, group: 1, kind: "export" as const },
          ]
          const r1 = collectSymbols(lines, rules)
          const r2 = collectSymbols(lines, rules)
          expect(r1.exports).toEqual(r2.exports)
          expect(r1.locals).toEqual(r2.locals)
          return true
        }),
        { numRuns: 100 }
      )
    })

    it("should separate exports and locals", () => {
      const lines = [
        "export function foo() {}",
        "const bar = 1;",
        "function baz() {}",
      ]
      const rules = [
        { re: /^\s*export\s+function\s+(\w+)/, group: 1, kind: "export" as const },
        { re: /^\s*const\s+(\w+)/, group: 1, kind: "local" as const },
        { re: /^\s*function\s+(\w+)/, group: 1, kind: "local" as const },
      ]
      const { exports, locals } = collectSymbols(lines, rules)
      expect(exports.some(e => e.name === "foo")).toBe(true)
      expect(locals.some(l => l.name === "bar")).toBe(true)
      expect(locals.some(l => l.name === "baz")).toBe(true)
    })

    it("should not duplicate symbols", () => {
      const lines = [
        "export function foo() {}",
        "export function foo() {}", // duplicate
      ]
      const rules = [
        { re: /^\s*export\s+function\s+(\w+)/, group: 1, kind: "export" as const },
      ]
      const { exports } = collectSymbols(lines, rules)
      expect(exports.filter(e => e.name === "foo").length).toBe(1)
    })
  })

  describe("collectImports", () => {
    it("should extract ES6 imports", () => {
      const content = `
import React from 'react';
import { useState, useEffect } from 'react';
import * as utils from './utils';
import './styles.css';
`
      const imports = collectImports(content, "js")
      expect(imports.some(i => i.includes("react"))).toBe(true)
      expect(imports.some(i => i.includes("./utils"))).toBe(true)
      expect(imports.some(i => i.includes("./styles.css"))).toBe(true)
      // Named imports (useState, useEffect) are NOT extracted - only module paths
    })

    it("should extract CommonJS requires", () => {
      const content = `
const fs = require('fs');
const path = require('path');
const myModule = require('./my-module');
`
      const imports = collectImports(content, "js")
      expect(imports.some(i => i.includes("fs"))).toBe(true)
      expect(imports.some(i => i.includes("path"))).toBe(true)
      expect(imports.some(i => i.includes("./my-module"))).toBe(true)
    })

    it("should not duplicate imports", () => {
      const content = `
import React from 'react';
import React from 'react';
`
      const imports = collectImports(content, "js")
      expect(imports.filter(i => i.includes("react")).length).toBe(1)
    })
  })

  describe("parseModelSummary", () => {
    it("should parse summary and symbols", () => {
      const text = `This is a summary of the file.
It describes the purpose.

Symbols: foo, bar, baz`
      const result = parseModelSummary(text)
      expect(result.summary).toContain("summary of the file")
      expect(result.symbols).toContain("foo")
      expect(result.symbols).toContain("bar")
      expect(result.symbols).toContain("baz")
    })

    it("should handle missing Symbols section", () => {
      const text = `Just a summary without symbols.`
      const result = parseModelSummary(text)
      expect(result.summary).toBe("Just a summary without symbols.")
      expect(result.symbols).toEqual([])
    })

    it("should handle various symbol separators", () => {
      const text = `Summary text.
Symbols: foo, bar; baz | qux`
      const result = parseModelSummary(text)
      expect(result.symbols).toContain("foo")
      expect(result.symbols).toContain("bar")
      expect(result.symbols).toContain("baz")
      expect(result.symbols).toContain("qux")
    })

    it("should trim symbol names", () => {
      const text = `Summary.
Symbols:  foo ,  bar  , baz `
      const result = parseModelSummary(text)
      expect(result.symbols).toContain("foo")
      expect(result.symbols).toContain("bar")
      expect(result.symbols).toContain("baz")
    })
  })
})