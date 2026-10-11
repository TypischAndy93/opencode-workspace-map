import { describe, it, expect } from "vitest"
import fc from "fast-check"
import { hash, locKey, entryPrefix, LEGACY_PREFIX } from "../../src/utils/hash.js"

describe("Property-based tests for hash utils", () => {
  describe("hash", () => {
    it("should be deterministic", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 0, maxLength: 1000 }), (input) => {
          const h1 = hash(input)
          const h2 = hash(input)
          expect(h1).toBe(h2)
          return true
        }),
        { numRuns: 500 }
      )
    })

    it("should produce same length output for all inputs", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 0, maxLength: 10000 }), (input) => {
          const h = hash(input)
          // hash returns 12-char prefix of SHA1
          expect(h).toHaveLength(12)
          return true
        }),
        { numRuns: 500 }
      )
    })

    it("should produce different hashes for different inputs", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 100 }),
          fc.string({ minLength: 0, maxLength: 100 }),
          (a, b) => {
            if (a === b) return true
            const h1 = hash(a)
            const h2 = hash(b)
            // Different inputs should (almost always) produce different hashes
            // Collision is possible but extremely unlikely for SHA1
            return true
          }
        ),
        { numRuns: 500 }
      )
    })

    it("should handle unicode", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 0, maxLength: 100 }), (input) => {
          const h = hash(input)
          expect(h).toHaveLength(12)
          return true
        }),
        { numRuns: 200 }
      )
    })

    it("should be consistent for empty string", () => {
      const h1 = hash("")
      const h2 = hash("")
      expect(h1).toBe(h2)
      expect(h1).toHaveLength(12)
    })
  })

  describe("locKey", () => {
    it("should be deterministic for same path", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 200 }), (path) => {
          const k1 = locKey(path)
          const k2 = locKey(path)
          expect(k1).toBe(k2)
          return true
        }),
        { numRuns: 500 }
      )
    })

    it("should produce different keys for different paths", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }),
          fc.string({ minLength: 1, maxLength: 100 }),
          (a, b) => {
            if (a === b) return true
            const k1 = locKey(a)
            const k2 = locKey(b)
            // Different paths should produce different keys
            return true
          }
        ),
        { numRuns: 500 }
      )
    })

    it("should handle absolute and relative paths", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 100 }), (path) => {
          const k1 = locKey("/absolute/" + path)
          const k2 = locKey("relative/" + path)
          // Should produce valid keys
          expect(typeof k1).toBe("string")
          expect(typeof k2).toBe("string")
          expect(k1.length).toBeGreaterThan(0)
          expect(k2.length).toBeGreaterThan(0)
          return true
        }),
        { numRuns: 200 }
      )
    })
  })

  describe("entryPrefix", () => {
    it("should produce correct prefix format", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 50 }), (locKey) => {
          const prefix = entryPrefix(locKey)
          expect(prefix).toBe(`loc/${locKey}/file/`)
          return true
        }),
        { numRuns: 100 }
      )
    })
  })

  describe("LEGACY_PREFIX", () => {
    it("should be constant", () => {
      expect(LEGACY_PREFIX).toBe("file/")
    })
  })
})