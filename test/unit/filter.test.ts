import { describe, it, expect, vi } from "vitest"
import { skipDir, skipFile, isSecret, extOf, createFilterContext } from "../../src/fs/filter.js"
import { DEFAULT_OPTIONS, DEFAULT_IGNORES, type Options, type Stats } from "../../src/config/index.js"

function createTestContext(overrides: Partial<Options> = {}): { ctx: any; stats: Stats } {
  const stats: Stats = {
    summaries: 0, skippedByRule: 0, walks: 0, fullInjections: 0, digestInjections: 0,
    dirtyFlushes: 0, warmups: 0, sessions: 0, files: 0, outlineSummaries: 0,
    modelSummaries: 0, skippedSummaries: 0, lastWalkMs: 0, lastInjectionChars: 0, lastInjectionAt: 0
  }
  // Include DEFAULT_IGNORES in ignore list like the real plugin does
  const opts = { 
    ...DEFAULT_OPTIONS, 
    ...overrides,
    ignore: [...DEFAULT_IGNORES, ...(overrides.ignore ?? [])],
    ignoreExtra: [...(overrides.ignoreExtra ?? [])],
    include: [...(overrides.include ?? [])],
  }
  const ctx = createFilterContext(opts, stats, "/test-root", 1000, vi.fn())
  return { ctx, stats }
}

describe("filter", () => {
  describe("extOf", () => {
    it("extracts extension", () => {
      expect(extOf("file.ts")).toBe("ts")
      expect(extOf("path/to/file.js")).toBe("js")
      expect(extOf("file")).toBe("")
      expect(extOf(".hidden")).toBe("")
      expect(extOf("archive.tar.gz")).toBe("gz")
    })
  })

  describe("isSecret", () => {
    it("detects .env files", () => {
      const { ctx } = createTestContext()
      expect(isSecret(ctx, ".env")).toBe(true)
      expect(isSecret(ctx, ".env.local")).toBe(true)
      expect(isSecret(ctx, ".env-production")).toBe(true)
    })

    it("detects secret extensions", () => {
      const { ctx } = createTestContext()
      expect(isSecret(ctx, "key.pem")).toBe(true)
      expect(isSecret(ctx, "cert.key")).toBe(true)
      expect(isSecret(ctx, "store.p12")).toBe(true)
    })

    it("detects secret stem names", () => {
      const { ctx } = createTestContext()
      expect(isSecret(ctx, "id_rsa")).toBe(true)
      expect(isSecret(ctx, "credentials")).toBe(true)
      expect(isSecret(ctx, "secrets.json")).toBe(true)
      expect(isSecret(ctx, "password.txt")).toBe(true)
      expect(isSecret(ctx, "api_key.yaml")).toBe(true)
    })

    it("allows normal files", () => {
      const { ctx } = createTestContext()
      expect(isSecret(ctx, "config.json")).toBe(false)
      expect(isSecret(ctx, "main.ts")).toBe(false)
      expect(isSecret(ctx, "README.md")).toBe(false)
    })

    it("allows .env with code extension", () => {
      const { ctx } = createTestContext()
      expect(isSecret(ctx, "config.env.ts")).toBe(false)
    })
  })

  describe("skipDir", () => {
    it("skips ignored directories", () => {
      const { ctx } = createTestContext()
      // isTopLevel=true for top-level directories
      expect(skipDir(ctx, "node_modules", true)).toBe(true)
      expect(skipDir(ctx, ".git", true)).toBe(true)
      expect(skipDir(ctx, "dist", true)).toBe(true)
      expect(skipDir(ctx, "build", true)).toBe(true)
    })

    it("skips dot directories not in allowlist", () => {
      const { ctx } = createTestContext()
      expect(skipDir(ctx, ".cache", false)).toBe(true)
      expect(skipDir(ctx, ".idea", false)).toBe(true)
    })

    it("allows allowlisted dot directories", () => {
      const { ctx } = createTestContext()
      expect(skipDir(ctx, ".github", false)).toBe(false)
      expect(skipDir(ctx, ".vscode", false)).toBe(false)
      expect(skipDir(ctx, ".devcontainer", false)).toBe(false)
    })

    it("allows top-level only ignores for subdirectories", () => {
      const { ctx } = createTestContext()
      expect(skipDir(ctx, "bin", true)).toBe(true)  // top-level
      expect(skipDir(ctx, "src/bin", false)).toBe(false)  // subdirectory
    })

    it("respects include globs", () => {
      // Use a glob pattern with * to match includeGlobs logic
      const { ctx } = createTestContext({ include: ["node_modules*"] })
      expect(skipDir(ctx, "node_modules", false)).toBe(false)
    })
  })

  describe("skipFile", () => {
    it("skips dotfiles not in allowlist", () => {
      const { ctx } = createTestContext()
      expect(skipFile(ctx, ".hidden")).toBe(true)
      expect(skipFile(ctx, ".env")).toBe(true)
    })

    it("allows allowlisted dotfiles", () => {
      const { ctx } = createTestContext()
      expect(skipFile(ctx, ".gitignore")).toBe(false)
      expect(skipFile(ctx, ".editorconfig")).toBe(false)
      expect(skipFile(ctx, ".dockerignore")).toBe(false)
    })

    it("skips lockfiles", () => {
      const { ctx } = createTestContext()
      expect(skipFile(ctx, "package-lock.json")).toBe(true)
      expect(skipFile(ctx, "yarn.lock")).toBe(true)
      expect(skipFile(ctx, "Cargo.lock")).toBe(true)
    })

    it("skips minified files", () => {
      const { ctx } = createTestContext()
      expect(skipFile(ctx, "app.min.js")).toBe(true)
      expect(skipFile(ctx, "style.min.css")).toBe(true)
    })

    it("skips binary extensions", () => {
      const { ctx } = createTestContext()
      expect(skipFile(ctx, "image.png")).toBe(true)
      expect(skipFile(ctx, "binary.exe")).toBe(true)
      expect(skipFile(ctx, "lib.so")).toBe(true)
    })

    it("respects include globs", () => {
      const { ctx } = createTestContext({ include: ["**/*.min.js"] })
      expect(skipFile(ctx, "app.min.js")).toBe(false)
    })

    it("allows code files", () => {
      const { ctx } = createTestContext()
      expect(skipFile(ctx, "main.ts")).toBe(false)
      expect(skipFile(ctx, "component.jsx")).toBe(false)
      expect(skipFile(ctx, "script.py")).toBe(false)
    })
  })
})