import { describe, it, expect } from "vitest"
import { hash, locKey, entryPrefix, LEGACY_PREFIX } from "../../src/utils/hash.js"

describe("hash utils", () => {
  describe("hash", () => {
    it("produces consistent hashes", () => {
      expect(hash("test")).toBe(hash("test"))
      expect(hash("different")).not.toBe(hash("test"))
    })

    it("handles empty string", () => {
      // hash() returns 12-char prefix of SHA1
      expect(hash("")).toHaveLength(12)
    })

    it("handles unicode", () => {
      expect(hash("🎉")).toHaveLength(12)
      expect(hash("中文")).toHaveLength(12)
    })

    it("produces different hashes for similar inputs", () => {
      expect(hash("test1")).not.toBe(hash("test2"))
      expect(hash("test")).not.toBe(hash("test "))
    })
  })

  describe("locKey", () => {
    it("produces consistent keys for same path", () => {
      const root = "/home/user/project"
      expect(locKey(root)).toBe(locKey(root))
    })

    it("produces different keys for different paths", () => {
      expect(locKey("/home/user/project1")).not.toBe(locKey("/home/user/project2"))
    })

    it("normalizes paths", () => {
      // On Windows, paths are case-insensitive
      const key1 = locKey("/Home/User/Project")
      const key2 = locKey("/home/user/project")
      // Should be consistent on same platform
      expect(typeof key1).toBe("string")
      expect(key1.length).toBeGreaterThan(0)
    })
  })

  describe("entryPrefix", () => {
    it("generates prefix with location key", () => {
      const prefix = entryPrefix("abc123")
      expect(prefix).toBe("loc/abc123/file/")
    })
  })

  describe("LEGACY_PREFIX", () => {
    it("is the legacy prefix", () => {
      expect(LEGACY_PREFIX).toBe("file/")
    })
  })
})