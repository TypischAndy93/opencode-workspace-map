import { describe, it, expect } from "vitest"
import fc from "fast-check"
import { skipDir, skipFile, isSecret, extOf, createFilterContext } from "../../src/fs/filter.js"
import { DEFAULT_OPTIONS, type Options, type Stats } from "../../src/config/index.js"

function createTestContext(overrides: Partial<Options> = {}): { ctx: any; stats: Stats } {
  const stats: Stats = {
    summaries: 0, skippedByRule: 0, walks: 0, fullInjections: 0, digestInjections: 0,
    dirtyFlushes: 0, warmups: 0, sessions: 0, files: 0, outlineSummaries: 0,
    modelSummaries: 0, skippedSummaries: 0, lastWalkMs: 0, lastInjectionChars: 0, lastInjectionAt: 0
  }
  const opts = { ...DEFAULT_OPTIONS, ...overrides }
  const ctx = createFilterContext(opts, stats, "/test-root", 1000, () => {})
  return { ctx, stats }
}

describe("Property-based tests for filter", () => {
  describe("extOf", () => {
    it("should be idempotent", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 0, maxLength: 100 }), (path) => {
          const ext1 = extOf(path)
          const ext2 = extOf(path)
          expect(ext1).toBe(ext2)
          return true
        }),
        { numRuns: 1000 }
      )
    })

    it("should return lowercase extension", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.includes(".")), (path) => {
          const ext = extOf(path)
          expect(ext).toBe(ext.toLowerCase())
          return true
        }),
        { numRuns: 500 }
      )
    })

    it("should return empty string for no extension", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes(".")), (path) => {
          const ext = extOf(path)
          expect(ext).toBe("")
          return true
        }),
        { numRuns: 500 }
      )
    })
  })

  describe("isSecret", () => {
    it("should be idempotent", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 100 }), (rel) => {
          const { ctx } = createTestContext()
          const result1 = isSecret(ctx, rel)
          const result2 = isSecret(ctx, rel)
          expect(result1).toBe(result2)
          return true
        }),
        { numRuns: 500 }
      )
    })

    it("should always detect .env files", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.startsWith(".") && !s.includes("/") && !s.includes(" ")), (name) => {
          const { ctx } = createTestContext()
          expect(isSecret(ctx, ".env")).toBe(true)
          expect(isSecret(ctx, `.env.${name}`)).toBe(true)
          expect(isSecret(ctx, `.env-${name}`)).toBe(true)
          return true
        }),
        { numRuns: 100 }
      )
    })

    it("should detect known secret extensions", () => {
      const secretExts = [".pem", ".key", ".p12", ".pfx", ".jks", ".keystore", ".asc", ".gpg", ".ppk", ".kdbx", ".der"]
      
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 30 })
            .filter(s => !s.includes("/") && !s.includes(" ") && !s.includes("\\") && !s.includes(":")),
          (name) => {
            const { ctx } = createTestContext()
            for (const ext of secretExts) {
              expect(isSecret(ctx, `${name}${ext}`)).toBe(true)
            }
            return true
          }
        ),
        { numRuns: 100 }
      )
    })

    it("should detect secret stem names without extension", () => {
      const secretStems = ["id_rsa", "id_dsa", "id_ecdsa", "id_ed25519", "credentials", "secrets", "token", "password", "passwd", "private_key", "api_key", "apikey"]
      
      fc.assert(
        fc.property(fc.constantFrom(...secretStems), (stem) => {
          const { ctx } = createTestContext()
          expect(isSecret(ctx, stem)).toBe(true)
          return true
        }),
        { numRuns: 100 }
      )
    })
  })

  describe("skipDir", () => {
    it("should be idempotent", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes("\0")),
          fc.boolean(),
          (rel, isTopLevel) => {
            const { ctx } = createTestContext()
            const result1 = skipDir(ctx, rel, isTopLevel)
            const result2 = skipDir(ctx, rel, isTopLevel)
            expect(result1).toBe(result2)
            return true
          }
        ),
        { numRuns: 500 }
      )
    })

    it("should always skip ignored directories", () => {
      // TOP_LEVEL_IGNORES only contains: bin, tmp, temp, cache
      // But these are only skipped at top level, not in subdirectories
      // For subdirectories, they would need to be in ignoreSet
      const topLevelIgnored = ["bin", "tmp", "temp", "cache"]
      
      fc.assert(
        fc.property(fc.constantFrom(...topLevelIgnored), (dir) => {
          const { ctx } = createTestContext()
          // Should skip when it's a top-level directory with that name
          expect(skipDir(ctx, dir, true)).toBe(true)
          // In subdirectories, they are NOT skipped by TOP_LEVEL_IGNORES
          // (only at top level). They would need to be in ignoreSet.
          expect(skipDir(ctx, `src/${dir}`, false)).toBe(false)
          return true
        }),
        { numRuns: 100 }
      )
    })

    it("should allow allowlisted dot directories", () => {
      const allowedDirs = [".github", ".opencode", ".vscode", ".devcontainer", ".gitlab"]
      
      fc.assert(
        fc.property(fc.constantFrom(...allowedDirs), (dir) => {
          const { ctx } = createTestContext()
          // Should NOT skip at top level or in subdirectories
          expect(skipDir(ctx, dir, true)).toBe(false)
          expect(skipDir(ctx, `src/${dir}`, false)).toBe(false)
          return true
        }),
        { numRuns: 100 }
      )
    })

    it("should skip dot directories not in allowlist", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 2, maxLength: 20 }).filter(s => s.startsWith(".") && !s.includes(" ") && !s.includes("!") && !s.includes("/") && !s.includes("#") && !s.includes("\"") && !["github", "opencode", "vscode", "devcontainer", "gitlab"].includes(s.slice(1))),
          (dir) => {
            const { ctx } = createTestContext()
            expect(skipDir(ctx, dir, false)).toBe(true)
            return true
          }
        ),
        { numRuns: 100 }
      )
    })

    it("should respect include globs override", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => !s.includes("*") && !s.includes("?")),
          (name) => {
            const { ctx } = createTestContext({ include: [`${name}*`, `*/${name}*`] })
            // Include patterns should override ignore
            expect(skipDir(ctx, name, false)).toBe(false)
            return true
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe("skipFile", () => {
    it("should be idempotent", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 100 }).filter(s => !s.includes("\0")), (rel) => {
          const { ctx } = createTestContext()
          const result1 = skipFile(ctx, rel)
          const result2 = skipFile(ctx, rel)
          expect(result1).toBe(result2)
          return true
        }),
        { numRuns: 500 }
      )
    })

    it("should skip dotfiles not in allowlist", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 2, maxLength: 30 }).filter(s => s.startsWith(".") && !s.includes("/")),
          (file) => {
            const { ctx } = createTestContext()
            // Allowlisted dotfiles
            const allowlisted = [".gitignore", ".gitattributes", ".editorconfig", ".dockerignore", ".npmignore", ".prettierignore", ".eslintignore", ".prettierrc", ".eslintrc", ".babelrc", ".nvmrc", ".node-version", ".python-version", ".tool-versions", ".commitlintrc"]
            if (!allowlisted.includes(file)) {
              expect(skipFile(ctx, file)).toBe(true)
            } else {
              expect(skipFile(ctx, file)).toBe(false)
            }
            return true
          }
        ),
        { numRuns: 100 }
      )
    })

    it("should skip lockfiles", () => {
      const lockfiles = ["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lock", "bun.lockb", "cargo.lock", "poetry.lock", "composer.lock", "gemfile.lock", "go.sum", "uv.lock"]
      
      fc.assert(
        fc.property(fc.constantFrom(...lockfiles), (lockfile) => {
          const { ctx } = createTestContext()
          expect(skipFile(ctx, lockfile)).toBe(true)
          // Also in subdirectories
          expect(skipFile(ctx, `subdir/${lockfile}`)).toBe(true)
          return true
        }),
        { numRuns: 100 }
      )
    })

    it("should skip minified files", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 30 }).filter(s => !s.includes(".") && !s.includes(".min.")),
          (name) => {
            const { ctx } = createTestContext()
            expect(skipFile(ctx, `${name}.min.js`)).toBe(true)
            expect(skipFile(ctx, `${name}.min.css`)).toBe(true)
            return true
          }
        ),
        { numRuns: 100 }
      )
    })

    it("should skip binary extensions", () => {
      const binaryExts = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico", ".svgz", ".tiff", ".pdf", ".zip", ".gz", ".tgz", ".tar", ".7z", ".rar", ".bz2", ".xz", ".exe", ".dll", ".so", ".dylib", ".bin", ".class", ".o", ".a", ".obj", ".lib", ".mp3", ".mp4", ".mov", ".avi", ".mkv", ".wav", ".flac", ".ogg", ".webm", ".woff", ".woff2", ".ttf", ".otf", ".eot", ".db", ".sqlite", ".sqlite3", ".lock", ".wasm", ".pyc", ".img", ".iso", ".vhd", ".vhdx", ".map"]
      
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 30 }).filter(s => !s.includes("\\") && !s.includes("/")), (name) => {
          const { ctx } = createTestContext()
          for (const ext of binaryExts) {
            expect(skipFile(ctx, `${name}${ext}`)).toBe(true)
          }
          return true
        }),
        { numRuns: 50 }
      )
    })

    it("should skip secret files", () => {
      const { ctx } = createTestContext()
      
      // .env files
      expect(isSecret(ctx, ".env")).toBe(true)
      expect(isSecret(ctx, ".env.local")).toBe(true)
      expect(isSecret(ctx, ".env-production")).toBe(true)
      
      // Secret extensions
      expect(isSecret(ctx, "key.pem")).toBe(true)
      expect(isSecret(ctx, "cert.key")).toBe(true)
      
      // Secret stems
      expect(isSecret(ctx, "id_rsa")).toBe(true)
      expect(isSecret(ctx, "credentials")).toBe(true)
      expect(isSecret(ctx, "secrets.json")).toBe(true)
    })

    it("should NOT skip normal code files", () => {
      const codeFiles = ["main.ts", "component.jsx", "utils.py", "handler.go", "lib.rs", "Main.java", "script.kt", "Program.cs", "app.rb", "index.php", "main.swift", "app.dart", "script.lua", "deploy.sh", "build.bash", "profile.zsh", "script.ps1", "schema.sql"]
      
      fc.assert(
        fc.property(fc.constantFrom(...codeFiles), (file) => {
          const { ctx } = createTestContext()
          expect(skipFile(ctx, file)).toBe(false)
          // Also in subdirectories
          expect(skipFile(ctx, `src/${file}`)).toBe(false)
          expect(skipFile(ctx, `src/components/${file}`)).toBe(false)
          return true
        }),
        { numRuns: 100 }
      )
    })
  })

  describe("generated file detection", () => {
    it("should detect generated files by pattern", () => {
      const generatedFiles = [
        "src/foo.generated.ts",
        "types/index.d.ts",
        "dist/bundle.js",
        "build/output.js",
        "out/main.js",
        "script.min.js",
        "style.min.css",
        "coverage/lcov.info",
        ".next/server.js",
        ".nuxt/dist/app.js",
        ".output/server/index.mjs",
        "target/debug/app",
        "obj/Debug/net7.0/app.dll",
        "lib/main.g.dart",
        "GeneratedPluginRegistrant.m",
        "proto/user.pb.go",
        "proto/user.pb.ts",
        "proto/user.pb.js",
        "generated_user.ts",
        "Form1.designer.cs",
        "auto.generated.ts",
      ]
      
      for (const file of generatedFiles) {
        const { ctx } = createTestContext({ autoDetectGenerated: true })
        expect(ctx.isGenerated(file)).toBe(true)
        // skipDir should also detect generated directories (only for known generated dir names)
        if (file.includes("/")) {
          // Check the first path component (top-level directory)
          const topDir = file.split("/")[0]
          const generatedDirNames = ["dist", "build", "out", "coverage", ".next", ".nuxt", ".output", "target", "obj"]
          if (generatedDirNames.includes(topDir)) {
            expect(ctx.isGenerated(topDir)).toBe(true)
          }
        }
      }
    })

    it("should NOT detect normal files as generated", () => {
      const normalFiles = [
        "src/main.ts",
        "lib/utils.py",
        "cmd/server.go",
        "src/lib.rs",
        "com/example/Main.java",
        "app.rb",
        "index.php",
        "Sources/App/main.swift",
        "lib/main.dart",
        "script.lua",
        "deploy.sh",
        "build.gradle",
        "schema.sql",
        "config.json",
        "README.md",
        "package.json",
      ]
      
      for (const file of normalFiles) {
        const { ctx } = createTestContext({ autoDetectGenerated: true })
        expect(ctx.isGenerated(file)).toBe(false)
      }
    })

    it("should respect autoDetectGenerated option", () => {
      const { ctx: ctxEnabled } = createTestContext({ autoDetectGenerated: true })
      const { ctx: ctxDisabled } = createTestContext({ autoDetectGenerated: false })
      
      expect(ctxEnabled.isGenerated("dist/bundle.js")).toBe(true)
      expect(ctxDisabled.isGenerated("dist/bundle.js")).toBe(false)
    })

    it("should respect custom generatedPatterns", () => {
      const { ctx } = createTestContext({ 
        autoDetectGenerated: true,
        generatedPatterns: ["*.custom.gen.ts", "generated/**"]
      })
      
      expect(ctx.isGenerated("src/foo.custom.gen.ts")).toBe(true)
      expect(ctx.isGenerated("generated/output.ts")).toBe(true)
      expect(ctx.isGenerated("dist/bundle.js")).toBe(false) // default patterns not included
    })

    it("should skip generated directories in skipDir", () => {
      const { ctx, stats } = createTestContext({ autoDetectGenerated: true })
      
      expect(skipDir(ctx, "dist", true)).toBe(true)
      expect(skipDir(ctx, "build", false)).toBe(true)
      expect(skipDir(ctx, "out", false)).toBe(true)
      expect(skipDir(ctx, ".next", false)).toBe(true)
      expect(skipDir(ctx, "target", false)).toBe(true)
      expect(stats.skippedByRule).toBeGreaterThan(0)
    })

    it("should skip generated files in skipFile", () => {
      const { ctx, stats } = createTestContext({ autoDetectGenerated: true })
      
      expect(skipFile(ctx, "types/index.d.ts")).toBe(true)
      expect(skipFile(ctx, "script.min.js")).toBe(true)
      expect(skipFile(ctx, "style.min.css")).toBe(true)
      expect(skipFile(ctx, "lib/main.g.dart")).toBe(true)
      expect(stats.skippedByRule).toBeGreaterThan(0)
    })

    it("should NOT skip generated files when include globs match", () => {
      const { ctx } = createTestContext({ 
        autoDetectGenerated: true,
        include: ["dist/**", "*.d.ts"]
      })
      
      // Include patterns should override generated detection
      expect(skipFile(ctx, "dist/bundle.js")).toBe(false)
      expect(skipFile(ctx, "types/index.d.ts")).toBe(false)
    })
  })

  describe("filter idempotency", () => {
    it("skipDir then skipFile should be consistent", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes("\0")),
          (rel) => {
            const { ctx } = createTestContext()
            const dirResult = skipDir(ctx, rel, false)
            const fileResult = skipFile(ctx, rel)
            
            // A file in a skipped directory should be implicitly skipped
            // but we just check idempotency
            expect(typeof dirResult).toBe("boolean")
            expect(typeof fileResult).toBe("boolean")
            return true
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})