import { describe, it, expect } from "vitest"
import { globToRegex, compileGitignore, gitignored, type GitignoreRule } from "../../src/fs/gitignore.js"

describe("gitignore", () => {
  describe("globToRegex", () => {
    it("converts simple glob to regex", () => {
      // globToRegex converts * to [^/]* (match anything except path separator)
      expect(globToRegex("*.js")).toBe("[^/]*\\.js")
      // ** followed by / becomes (?:.*/)? (optional path prefix)
      expect(globToRegex("src/**/*.ts")).toBe("src/(?:.*/)?[^/]*\\.ts")
      // trailing slash for directories is kept
      expect(globToRegex("dist/")).toBe("dist/")
    })

    it("handles special characters", () => {
      expect(globToRegex("file[1].txt")).toBe("file\\[1\\]\\.txt")
      expect(globToRegex("file(1).txt")).toBe("file\\(1\\)\\.txt")
      expect(globToRegex("file+1.txt")).toBe("file\\+1\\.txt")
    })

    it("handles question mark", () => {
      // ? becomes [^/] (single char except separator)
      expect(globToRegex("file?.js")).toBe("file[^/]\\.js")
    })
  })

  describe("compileGitignore", () => {
    it("parses simple patterns", () => {
      const input = "node_modules\n*.log\ndist/"
      const rules = compileGitignore(input)
      expect(rules.length).toBe(3)
    })

    it("handles negation", () => {
      const input = "*.log\n!important.log"
      const rules = compileGitignore(input)
      expect(rules.length).toBe(2)
      expect(rules[0].negate).toBe(false)
      expect(rules[1].negate).toBe(true)
    })

    it("ignores comments and empty lines", () => {
      const input = "# comment\n\n*.log\n# another comment\n"
      const rules = compileGitignore(input)
      expect(rules.length).toBe(1)
    })

    it("handles directory-only patterns", () => {
      const input = "build/\ndist/"
      const rules = compileGitignore(input)
      expect(rules.length).toBe(2)
      // Directory patterns get regex like (?:^|.*\/)build(?:\/.*)?$
      expect(rules[0].regex.source).toContain("build")
    })
  })

  describe("gitignored", () => {
    it("matches basic patterns", () => {
      const rules = compileGitignore("*.log\nbuild/")
      expect(gitignored(rules, "debug.log")).toBe(true)
      expect(gitignored(rules, "build/output.js")).toBe(true)
      expect(gitignored(rules, "src/main.ts")).toBe(false)
    })

    it("handles negation correctly", () => {
      const rules = compileGitignore("*.log\n!important.log")
      expect(gitignored(rules, "debug.log")).toBe(true)
      expect(gitignored(rules, "important.log")).toBe(false)
    })

    it("later rules override earlier", () => {
      const rules = compileGitignore("*.log\n!*.log")
      expect(gitignored(rules, "test.log")).toBe(false)
    })

    it("handles subdirectory patterns", () => {
      const rules = compileGitignore("node_modules/")
      // node_modules/ matches anywhere in path
      expect(gitignored(rules, "node_modules/lodash/index.js")).toBe(true)
      // src/node_modules is also matched (gitignore behavior)
      expect(gitignored(rules, "src/node_modules/test.js")).toBe(true)
    })
  })
})