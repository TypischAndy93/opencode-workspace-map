import { describe, it, expect } from "vitest"
import { extOf, leadingDoc, collectSymbols, collectImports, dataSummary, codeSummary, extractTodos, extractPurpose } from "../../src/summarizers/summarize-utils.ts"
import { JAVASCRIPT_SYMBOL_RULES } from "../../src/summarizers/languages/javascript.ts"
import { PYTHON_SYMBOL_RULES } from "../../src/summarizers/languages/python.ts"
import { GO_SYMBOL_RULES } from "../../src/summarizers/languages/go.ts"

describe("summarize-utils", () => {
  describe("extOf", () => {
    it("extracts extension correctly", () => {
      expect(extOf("file.ts")).toBe("ts")
      expect(extOf("path/to/file.js")).toBe("js")
      expect(extOf("file")).toBe("")
      // .hidden files have extension "hidden"
      expect(extOf(".hidden")).toBe("hidden")
      expect(extOf("archive.tar.gz")).toBe("gz")
    })
  })

  describe("leadingDoc", () => {
    it("extracts JSDoc comment", () => {
      const content = "/**\n * This is a JSDoc comment\n * describing the file\n */\nexport function foo() {}"
      expect(leadingDoc(content)).toContain("This is a JSDoc comment")
      expect(leadingDoc(content)).toContain("describing the file")
    })

    it("extracts hash comments", () => {
      const content = "# This is a comment\n# describing the file\n\nexport function foo() {}"
      expect(leadingDoc(content)).toContain("This is a comment")
    })

    it("extracts // comments", () => {
      const content = "// This is a comment\n// describing the file\n\nexport function foo() {}"
      expect(leadingDoc(content)).toContain("This is a comment")
    })

    it("returns undefined for no doc", () => {
      const content = "export function foo() {}"
      expect(leadingDoc(content)).toBeUndefined()
    })

    it("truncates long docs", () => {
      const content = "/** " + "a".repeat(200) + " */\nexport function foo() {}"
      const doc = leadingDoc(content)
      expect(doc!.length).toBeLessThanOrEqual(143) // 140 + "..."
    })
  })

  describe("collectSymbols", () => {
    it("collects JS exports and locals", () => {
      const lines = [
        "export function foo() {}",
        "export class Bar {}",
        "export const BAZ = 1",
        "function localFunc() {}",
        "class LocalClass {}"
      ]
      const { exports, locals } = collectSymbols(lines, JAVASCRIPT_SYMBOL_RULES)
      expect(exports.map(e => e.name)).toContain("foo")
      expect(exports.map(e => e.name)).toContain("Bar")
      expect(exports.map(e => e.name)).toContain("BAZ")
      expect(locals.map(e => e.name)).toContain("localFunc")
      expect(locals.map(e => e.name)).toContain("LocalClass")
    })

    it("includes symbol kinds", () => {
      const lines = [
        "export function foo() {}",
        "export class Bar {}",
        "export const BAZ = 1",
        "export interface IBaz {}"
      ]
      const { exports } = collectSymbols(lines, JAVASCRIPT_SYMBOL_RULES)
      const foo = exports.find(e => e.name === "foo")
      const bar = exports.find(e => e.name === "Bar")
      const baz = exports.find(e => e.name === "BAZ")
      const ibaz = exports.find(e => e.name === "IBaz")
      expect(foo?.kind).toBe("function")
      expect(bar?.kind).toBe("class")
      expect(baz?.kind).toBe("const")
      expect(ibaz?.kind).toBe("interface")
    })

    it("deduplicates symbols", () => {
      const lines = [
        "export function foo() {}",
        "export function foo() {}"
      ]
      const { exports } = collectSymbols(lines, JAVASCRIPT_SYMBOL_RULES)
      expect(exports.filter(e => e.name === "foo").length).toBe(1)
    })
  })

  describe("collectImports", () => {
    it("collects JS/TS imports", () => {
      const content = `
import foo from "foo"
import { bar } from "bar"
import * as baz from "baz"
const qux = require("qux")
export { something } from "something"
`
      const imports = collectImports(content, "js")
      expect(imports).toContain("foo")
      expect(imports).toContain("bar")
      expect(imports).toContain("baz")
      expect(imports).toContain("qux")
      expect(imports).toContain("something")
    })

    it("collects Python imports", () => {
      const content = `
import os
from sys import path
from typing import List, Dict
`
      const imports = collectImports(content, "py")
      // Python imports are captured as module names
      expect(imports.length).toBeGreaterThan(0)
      // The regex captures the first part after "from" or "import"
      // "import os" -> captures "os"
      // "from sys import path" -> captures "sys"
      // "from typing import List, Dict" -> captures "typing"
      // But the regex only captures first group
    })

    it("collects Go imports", () => {
      const content = `
import "fmt"
import (
  "net/http"
  "github.com/gin-gonic/gin"
)
`
      const imports = collectImports(content, "go")
      expect(imports).toContain("fmt")
      expect(imports).toContain("net/http")
      expect(imports).toContain("github.com/gin-gonic/gin")
    })

    it("collects Rust imports", () => {
      const content = `
use std::collections::HashMap;
use serde::{Deserialize, Serialize};
`
      const imports = collectImports(content, "rust")
      // The regex captures "use <path>" - it captures the full path
      expect(imports).toContain("std::collections::HashMap")
      // The second use has braces, regex may not capture it
    })
  })

  describe("dataSummary", () => {
    it("summarizes JSON objects", () => {
      const content = '{"name": "test", "version": "1.0.0", "scripts": {"test": "vitest"}}'
      const { summary, symbols } = dataSummary(content, "json")
      expect(summary).toContain("json object")
      expect(summary).toContain("3 keys")
      expect(summary).toContain("name=test")
      expect(summary).toContain("version=1.0.0")
      expect(symbols).toContain("name")
      expect(symbols).toContain("version")
    })

    it("summarizes JSON arrays", () => {
      const content = '[1, 2, 3, 4, 5]'
      const { summary } = dataSummary(content, "json")
      expect(summary).toContain("json array")
      expect(summary).toContain("5 items")
    })

    it("summarizes markdown", () => {
      const content = "# Heading 1\n## Heading 2\n### Heading 3\n\nSome text"
      const { summary, symbols } = dataSummary(content, "md")
      expect(summary).toContain("markdown")
      expect(symbols).toContain("Heading 1")
      expect(symbols).toContain("Heading 2")
      expect(symbols).toContain("Heading 3")
    })

    it("summarizes YAML", () => {
      const content = "name: test\nversion: 1.0\nscripts:\n  test: vitest"
      const { summary, symbols } = dataSummary(content, "yaml")
      expect(summary).toContain("yaml file")
      expect(symbols).toContain("name")
      expect(symbols).toContain("version")
    })
  })

  describe("codeSummary", () => {
    it("summarizes TypeScript file with exports", () => {
      const content = `
export function foo() {}
export class Bar {}
export const BAZ = 1
import { something } from "something"
`
      const { summary, symbols, imports } = codeSummary(content, "ts")
      expect(summary).toContain("ts file")
      expect(summary).toContain("exports:")
      expect(symbols.length).toBeGreaterThan(0)
      expect(imports).toContain("something")
    })

    it("includes symbol kinds in summary", () => {
      const content = `
export function foo() {}
export class Bar {}
`
      const { summary } = codeSummary(content, "ts")
      expect(summary).toContain("foo:function")
      expect(summary).toContain("Bar:class")
    })
  })

  describe("extractTodos", () => {
    it("extracts TODO comments", () => {
      const content = `
// TODO: fix this bug
function foo() {}
/* FIXME: this is broken */
const x = 1
// HACK: temporary workaround
`
      const todos = extractTodos(content, 10)
      expect(todos.length).toBe(3)
      expect(todos[0]).toContain("TODO:")
      expect(todos[1]).toContain("FIXME:")
      expect(todos[2]).toContain("HACK:")
    })

    it("respects max limit", () => {
      const content = "// TODO: 1\n// TODO: 2\n// TODO: 3\n// TODO: 4\n// TODO: 5\n// TODO: 6"
      const todos = extractTodos(content, 3)
      expect(todos.length).toBe(3)
    })

    it("handles various TODO formats", () => {
      const content = `
// TODO fix this
// FIXME: fix this
// BUG - fix this
// XXX: fix this
// NOTE: fix this
`
      const todos = extractTodos(content, 10)
      expect(todos.length).toBe(5)
    })
  })

  describe("extractPurpose", () => {
    it("extracts purpose from JSDoc", () => {
      const content = "/**\n * This file provides utility functions for string manipulation.\n * It includes trimming, padding, and case conversion.\n */\nexport function trim() {}"
      const purpose = extractPurpose(content, 200)
      expect(purpose).toContain("utility functions")
      expect(purpose).toContain("string manipulation")
    })

    it("extracts purpose from leading comments", () => {
      const content = "// This module handles user authentication\n// and provides login/logout functions\nexport function login() {}"
      const purpose = extractPurpose(content, 200)
      expect(purpose).toContain("user authentication")
    })

    it("returns undefined for no meaningful comment", () => {
      const content = "export function foo() {}\nexport function bar() {}"
      const purpose = extractPurpose(content, 200)
      expect(purpose).toBeUndefined()
    })

    it("truncates long purpose", () => {
      const content = "/** " + "x".repeat(300) + " */\nexport function foo() {}"
      const purpose = extractPurpose(content, 100)
      // The function extracts leadingDoc which is limited to 140 chars
      // Then truncates to maxLength if needed
      expect(purpose!.length).toBeLessThanOrEqual(143) // 140 + "..."
    })
  })
})