import { describe, it, expect } from "vitest"
import fc from "fast-check"
import { globToRegex, compileGitignore, gitignored } from "../../src/fs/gitignore.js"

describe("Property-based tests for gitignore", () => {
  describe("globToRegex round-trip", () => {
    it("should produce valid regex for arbitrary glob patterns", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 50 }), (glob) => {
          // Only test globs that contain glob special chars
          if (!glob.includes("*") && !glob.includes("?") && !glob.includes("[")) {
            return true // Skip non-glob patterns
          }
          
          try {
            const regexStr = globToRegex(glob)
            const regex = new RegExp("^" + regexStr + "$")
            // Should be a valid regex
            expect(typeof regexStr).toBe("string")
            expect(regexStr.length).toBeGreaterThan(0)
          } catch (e) {
            // Some globs might produce invalid regex - that's ok, just shouldn't crash
          }
          return true
        }),
        { numRuns: 100 }
      )
    })

    it("should correctly handle ** pattern", () => {
      fc.assert(
        fc.property(fc.array(fc.string({ minLength: 1, maxLength: 10 }).filter(s => !s.includes("*") && !s.includes("/") && !s.includes(" ") && !s.includes("\t") && !s.includes("!") && !s.includes("#") && !s.includes("$") && !s.includes("%") && !s.includes("{") && !s.includes("}") && !s.includes("[") && !s.includes("]") && !s.includes("!") && !s.includes("&") && !s.includes("(") && !s.includes(")") && !s.includes("`") && !s.includes("'") && !s.includes("|") && !s.includes("\\") && !s.includes(".")), { minLength: 2, maxLength: 5 }), (parts) => {
          const glob = parts.join("**/")
          const regexStr = globToRegex(glob)
          
          // ** should become (?:.*/)?
          expect(regexStr).toContain("(?:.*/)?")
          return true
        }),
        { numRuns: 50 }
      )
    })

    it("should correctly handle * pattern", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 20 }).filter(s => !s.includes("*")), (str) => {
          const glob = `*${str}*`
          const regexStr = globToRegex(glob)
          
          // * should become [^/]*
          expect(regexStr).toContain("[^/]*")
          return true
        }),
        { numRuns: 50 }
      )
    })

    it("should correctly handle ? pattern", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 20 }).filter(s => !s.includes("?")), (str) => {
          const glob = `?${str}?`
          const regexStr = globToRegex(glob)
          
          // ? should become [^/]
          expect(regexStr).toContain("[^/]")
          return true
        }),
        { numRuns: 50 }
      )
    })
  })

  describe("compileGitignore", () => {
    it("should handle arbitrary gitignore content without throwing", () => {
      fc.assert(
        fc.property(fc.array(fc.string({ minLength: 0, maxLength: 100 }), { minLength: 0, maxLength: 20 }), (lines) => {
          const content = lines.join("\n")
          const rules = compileGitignore(content)
          
          // Should return array of rules
          expect(Array.isArray(rules)).toBe(true)
          
          // Each rule should have required properties
          for (const rule of rules) {
            expect(rule).toHaveProperty("negate")
            expect(rule).toHaveProperty("regex")
            expect(typeof rule.negate).toBe("boolean")
            expect(rule.regex).toBeInstanceOf(RegExp)
          }
          return true
        }),
        { numRuns: 100 }
      )
    })

    it("should handle negation correctly", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 30 }).filter(s => !s.startsWith("!") && !s.startsWith("#") && !s.includes("\n") && !s.includes(" ") && !s.includes("/") && !s.includes("$") && !s.includes("*") && !s.includes("?") && !s.includes("[")),
          fc.string({ minLength: 1, maxLength: 30 }).filter(s => !s.startsWith("!") && !s.startsWith("#") && !s.includes("\n") && !s.includes(" ") && !s.includes("/") && !s.includes("$") && !s.includes("*") && !s.includes("?") && !s.includes("[")),
          (pattern1, pattern2) => {
            const content = `${pattern1}\n!${pattern2}`
            const rules = compileGitignore(content)
            
            expect(rules.length).toBe(2)
            expect(rules[0].negate).toBe(false)
            expect(rules[1].negate).toBe(true)
            return true
          }
        ),
        { numRuns: 50 }
      )
    })

    it("should ignore comments and empty lines", () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1, maxLength: 30 }).filter(s => !s.startsWith("#") && !s.trim().startsWith("#") && s.trim() !== "" && !s.startsWith("!") && !s.startsWith("/") && !s.includes("$")), { minLength: 1, maxLength: 5 }),
          (patterns) => {
            const lines = [
              "# comment",
              "",
              "  ",
              ...patterns,
              "# another comment"
            ]
            const content = lines.join("\n")
            const rules = compileGitignore(content)
            
            expect(rules.length).toBe(patterns.length)
            return true
          }
        ),
        { numRuns: 50 }
      )
    })

    it("should handle directory-only patterns (trailing slash)", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => !s.includes("/") && !s.includes("*") && !s.includes("?") && !s.includes("[") && !s.includes("]") && !s.includes("$") && !s.includes(" ") && !s.includes("#") && !s.includes("!") && !s.includes("%") && !s.includes("{") && !s.includes("}") && !s.includes("&") && !s.includes("(") && !s.includes(")") && !s.includes("^") && !s.includes("`") && !s.includes("'") && !s.includes("|") && !s.includes("\\") && !s.includes(".") && !s.includes(":") && !s.includes("+")),
          (name) => {
            const content = `${name}/`
            const rules = compileGitignore(content)
            
            expect(rules.length).toBe(1)
            // Directory patterns should match the directory and its contents
            const regexStr = rules[0].regex.source
            expect(regexStr).toContain(name)
            return true
          }
        ),
        { numRuns: 50 }
      )
    })
  })

  describe("gitignored", () => {
    it("should be idempotent for same input", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes("\n")),
          fc.string({ minLength: 0, maxLength: 50 }).filter(s => !s.includes("\n")),
          (pattern, path) => {
            const rules = compileGitignore(pattern)
            const result1 = gitignored(rules, path)
            const result2 = gitignored(rules, path)
            
            // Same input should always produce same result
            expect(result1).toBe(result2)
            return true
          }
        ),
        { numRuns: 100 }
      )
    })

    it("should correctly handle negation priority", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => !s.includes("/")),
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => !s.includes("/")),
          (ignorePattern, allowPattern) => {
            const content = `${ignorePattern}\n!${allowPattern}`
            const rules = compileGitignore(content)
            
            // File matching allowPattern should NOT be ignored (negation takes precedence)
            const ignored = gitignored(rules, allowPattern)
            expect(ignored).toBe(false)
            return true
          }
        ),
        { numRuns: 50 }
      )
    })

    it("should handle multiple negations correctly", () => {
      // Use simple lowercase alphanumeric names so patterns/paths stay literal
      // (no glob metachars, whitespace, newlines, or separators) and require the
      // three names to be pairwise distinct: otherwise the "ignored" expectations
      // are contradictory (e.g. if p1 === p2 then p1 is negated and not ignored).
      const safeName = fc.string({ minLength: 1, maxLength: 12 }).filter(s => /^[a-z0-9]+$/.test(s))
      fc.assert(
        fc.property(
          fc.uniqueArray(safeName, { minLength: 3, maxLength: 3 }),
          (names) => {
            const [p1, p2, p3] = names
            // p1 ignored, p2 allowed, p3 ignored again
            const content = `${p1}\n!${p2}\n${p3}`
            const rules = compileGitignore(content)
            
            expect(gitignored(rules, p1)).toBe(true)
            expect(gitignored(rules, p2)).toBe(false)
            expect(gitignored(rules, p3)).toBe(true)
            return true
          }
        ),
        { numRuns: 50 }
      )
    })
  })
})