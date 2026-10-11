import { describe, it, expect, vi } from "vitest"
import fc from "fast-check"
import { detectProject, discoverPackages, type MonorepoPackage, type ProjectInfo } from "../../src/config/index.js"
import { DEFAULT_OPTIONS, type Options } from "../../src/config/index.js"
import * as path from "node:path"
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"

describe("Property-based tests for VCS and Monorepo detection", () => {
  
  describe("detectProject (monorepo detection)", () => {
    let testDir: string
    let originalCwd: string

    beforeAll(async () => {
      originalCwd = process.cwd()
    })

    afterAll(async () => {
      process.chdir(originalCwd)
    })

    const createTestProject = async (files: Record<string, string>) => {
      const dir = await fs.mkdtemp(path.join(tmpdir(), "monorepo-test-"))
      for (const [relPath, content] of Object.entries(files)) {
        const fullPath = path.join(dir, relPath)
        await fs.mkdir(path.dirname(fullPath), { recursive: true })
        await fs.writeFile(fullPath, content)
      }
      return dir
    }

    it("should detect pnpm workspace", async () => {
      const dir = await createTestProject({
        "pnpm-workspace.yaml": "packages:\n  - 'packages/*'\n",
        "package.json": '{"name": "root", "private": true}',
        "packages/pkg1/package.json": '{"name": "pkg1"}',
        "packages/pkg2/package.json": '{"name": "pkg2"}',
      })
      
      const project = await detectProject(dir)
      expect(project.isMonorepo).toBe(true)
      expect(project.monorepoType).toBe("pnpm")
      // packages array is populated separately by discoverPackages()
      expect(project.packages.length).toBe(0)
    })

    it("should detect npm/yarn workspaces", async () => {
      const dir = await createTestProject({
        "package.json": JSON.stringify({
          name: "root",
          private: true,
          workspaces: ["packages/*"]
        }, null, 2),
        "packages/pkg1/package.json": '{"name": "pkg1"}',
      })
      
      const project = await detectProject(dir)
      expect(project.isMonorepo).toBe(true)
      expect(project.monorepoType).toBe("npm")
    })

    it("should detect turbo repo", async () => {
      const dir = await createTestProject({
        "turbo.json": JSON.stringify({
          pipeline: { build: { dependsOn: ["^build"] } }
        }, null, 2),
        "package.json": '{"name": "root"}',
        "apps/web/package.json": '{"name": "web"}',
        "apps/docs/package.json": '{"name": "docs"}',
      })
      
      const project = await detectProject(dir)
      expect(project.isMonorepo).toBe(true)
      expect(project.monorepoType).toBe("turbo")
    })

    it("should detect nx workspace", async () => {
      const dir = await createTestProject({
        "nx.json": JSON.stringify({ namedInputs: { default: ["{projectRoot}/**/*"] } }, null, 2),
        "package.json": '{"name": "root"}',
        "libs/ui/package.json": '{"name": "ui"}',
      })
      
      const project = await detectProject(dir)
      expect(project.isMonorepo).toBe(true)
      expect(project.monorepoType).toBe("nx")
    })

    it("should detect lerna repo", async () => {
      const dir = await createTestProject({
        "lerna.json": JSON.stringify({ packages: ["packages/*"] }, null, 2),
        "package.json": '{"name": "root"}',
        "packages/pkg1/package.json": '{"name": "pkg1"}',
      })
      
      const project = await detectProject(dir)
      expect(project.isMonorepo).toBe(true)
      expect(project.monorepoType).toBe("lerna")
    })

    it("should detect rush repo", async () => {
      const dir = await createTestProject({
        "rush.json": JSON.stringify({ projects: [{ packageName: "pkg1", projectFolder: "packages/pkg1" }] }, null, 2),
        "package.json": '{"name": "root"}',
        "packages/pkg1/package.json": '{"name": "pkg1"}',
      })
      
      const project = await detectProject(dir)
      expect(project.isMonorepo).toBe(true)
      expect(project.monorepoType).toBe("rush")
    })

    it("should NOT detect monorepo for single package", async () => {
      const dir = await createTestProject({
        "package.json": '{"name": "single-pkg"}',
        "src/index.ts": "export const x = 1;",
      })
      
      const project = await detectProject(dir)
      expect(project.isMonorepo).toBe(false)
      expect(project.monorepoType).toBeNull()
    })

    it("should detect primary language (TypeScript)", async () => {
      // Primary language detection only scans root directory files
      const dir = await createTestProject({
        "package.json": '{"name": "ts-project"}',
        "index.ts": "export const x = 1;",
        "utils.ts": "export const y = 2;",
      })
      
      const project = await detectProject(dir)
      expect(project.primaryLanguage).toBe("TypeScript")
    })

    it("should detect primary language (Python)", async () => {
      const dir = await createTestProject({
        "package.json": '{"name": "py-project"}',
        "main.py": "print('hello')",
        "utils.py": "def foo(): pass",
      })
      
      const project = await detectProject(dir)
      expect(project.primaryLanguage).toBe("Python")
    })

    it("should detect framework (Next.js)", async () => {
      const dir = await createTestProject({
        "package.json": JSON.stringify({
          name: "next-app",
          dependencies: { next: "^14.0.0", react: "^18.0.0" }
        }, null, 2),
        "pages/index.tsx": "export default function Home() { return <div>Hi</div> }",
      })
      
      const project = await detectProject(dir)
      expect(project.framework).toBe("Next.js")
    })

    it("should detect framework (React)", async () => {
      const dir = await createTestProject({
        "package.json": JSON.stringify({
          name: "react-app",
          dependencies: { react: "^18.0.0", "react-dom": "^18.0.0" }
        }, null, 2),
        "src/App.tsx": "export default function App() { return <div>Hi</div> }",
      })
      
      const project = await detectProject(dir)
      expect(project.framework).toBe("React")
    })

    it("should detect package manager from lockfile (pnpm)", async () => {
      const dir = await createTestProject({
        "package.json": '{"name": "test"}',
        "pnpm-lock.yaml": "lockfileVersion: 5.4",
      })
      
      const project = await detectProject(dir)
      expect(project.packageManager).toBe("pnpm")
    })

    it("should detect package manager from lockfile (yarn)", async () => {
      const dir = await createTestProject({
        "package.json": '{"name": "test"}',
        "yarn.lock": "# yarn lockfile",
      })
      
      const project = await detectProject(dir)
      expect(project.packageManager).toBe("yarn")
    })

    it("should detect package manager from lockfile (bun)", async () => {
      const dir = await createTestProject({
        "package.json": '{"name": "test"}',
        "bun.lock": "lockfile",
      })
      
      const project = await detectProject(dir)
      expect(project.packageManager).toBe("bun")
    })

    it("should detect package manager from lockfile (npm)", async () => {
      const dir = await createTestProject({
        "package.json": '{"name": "test"}',
        "package-lock.json": '{"lockfileVersion": 3}',
      })
      
      const project = await detectProject(dir)
      expect(project.packageManager).toBe("npm")
    })

    it("should detect hasTypeScript from tsconfig.json", async () => {
      const dir = await createTestProject({
        "package.json": '{"name": "test"}',
        "tsconfig.json": '{"compilerOptions": {}}',
      })
      
      const project = await detectProject(dir)
      expect(project.hasTypeScript).toBe(true)
    })

    it("should detect hasTypeScript from package.json devDependencies", async () => {
      const dir = await createTestProject({
        "package.json": JSON.stringify({
          name: "test",
          devDependencies: { typescript: "^5.0.0" }
        }, null, 2),
      })
      
      const project = await detectProject(dir)
      expect(project.hasTypeScript).toBe(true)
    })

    it("should detect hasTests from jest config", async () => {
      const dir = await createTestProject({
        "package.json": '{"name": "test"}',
        "jest.config.js": "module.exports = {}",
      })
      
      const project = await detectProject(dir)
      expect(project.hasTests).toBe(true)
    })

    it("should detect hasTests from vitest config", async () => {
      const dir = await createTestProject({
        "package.json": '{"name": "test"}',
        "vitest.config.ts": "export default {}",
      })
      
      const project = await detectProject(dir)
      expect(project.hasTests).toBe(true)
    })
  })

  describe("discoverPackages", () => {
    let testDir: string

    const createPackages = async (files: Record<string, string>) => {
      const dir = await fs.mkdtemp(path.join(tmpdir(), "packages-test-"))
      for (const [relPath, content] of Object.entries(files)) {
        const fullPath = path.join(dir, relPath)
        await fs.mkdir(path.dirname(fullPath), { recursive: true })
        await fs.writeFile(fullPath, content)
      }
      return dir
    }

    it("should discover packages in pnpm workspace", async () => {
      const dir = await createPackages({
        "pnpm-workspace.yaml": "packages:\n  - 'packages/*'\n",
        "package.json": '{"name": "root", "private": true}',
        "packages/pkg1/package.json": '{"name": "pkg1", "version": "1.0.0"}',
        "packages/pkg2/package.json": '{"name": "pkg2", "version": "2.0.0"}',
      })
      
      // Create a root package object similar to what the plugin uses
      const rootPkg = { name: "root", private: true, workspaces: ["packages/*"] }
      const packages = await discoverPackages(dir, rootPkg, "pnpm")
      expect(packages.length).toBe(2)
      expect(packages.map(p => p.name).sort()).toEqual(["pkg1", "pkg2"])
    })

    it("should discover packages in npm/yarn workspaces", async () => {
      const dir = await createPackages({
        "package.json": JSON.stringify({
          name: "root",
          private: true,
          workspaces: ["packages/*"]
        }, null, 2),
        "packages/pkg1/package.json": '{"name": "pkg1"}',
        "packages/pkg2/package.json": '{"name": "pkg2"}',
      })
      
      const rootPkg = { name: "root", private: true, workspaces: ["packages/*"] }
      const packages = await discoverPackages(dir, rootPkg, "npm")
      expect(packages.length).toBe(2)
    })

    it("should skip packages without package.json", async () => {
      const dir = await createPackages({
        "package.json": '{"name": "root", "workspaces": ["packages/*"]}',
        "packages/valid/package.json": '{"name": "valid"}',
        "packages/invalid/index.ts": "export const x = 1;",
      })
      
      const rootPkg = { name: "root", private: true, workspaces: ["packages/*"] }
      const packages = await discoverPackages(dir, rootPkg, "npm")
      expect(packages.length).toBe(1)
      expect(packages[0].name).toBe("valid")
    })

    it("should detect package language", async () => {
      const dir = await createPackages({
        "package.json": '{"name": "root", "workspaces": ["packages/*"]}',
        "packages/ts-pkg/package.json": '{"name": "ts-pkg"}',
        "packages/ts-pkg/index.ts": "export const x = 1;",
        "packages/py-pkg/package.json": '{"name": "py-pkg"}',
        "packages/py-pkg/main.py": "print('hello')",
      })
      
      const rootPkg = { name: "root", private: true, workspaces: ["packages/*"] }
      const packages = await discoverPackages(dir, rootPkg, "npm")
      const pkg = packages.find(p => p.name === "ts-pkg")
      expect(pkg?.language).toBe("TypeScript")
    })

    it("should handle missing or invalid package.json gracefully", async () => {
      const dir = await createPackages({
        "package.json": '{"name": "root", "workspaces": ["packages/*"]}',
        "packages/bad-json/package.json": "{ invalid json }",
        "packages/good/package.json": '{"name": "good"}',
      })
      
      const rootPkg = { name: "root", private: true, workspaces: ["packages/*"] }
      const packages = await discoverPackages(dir, rootPkg, "npm")
      expect(packages.length).toBe(1)
      expect(packages[0].name).toBe("good")
    })

    it("should discover packages in turbo repo", async () => {
      const dir = await createPackages({
        "turbo.json": JSON.stringify({
          packages: ["apps/*", "packages/*"]
        }, null, 2),
        "package.json": '{"name": "root"}',
        "apps/web/package.json": '{"name": "web"}',
        "packages/ui/package.json": '{"name": "ui"}',
      })
      
      const rootPkg = { name: "root" }
      const packages = await discoverPackages(dir, rootPkg, "turbo")
      expect(packages.length).toBe(2)
      expect(packages.map(p => p.name).sort()).toEqual(["ui", "web"])
    })

    it("should discover packages in nx workspace", async () => {
      const dir = await createPackages({
        "nx.json": JSON.stringify({
          projects: {
            "ui": { root: "libs/ui" },
            "api": { root: "apps/api" }
          }
        }, null, 2),
        "package.json": '{"name": "root"}',
        "libs/ui/package.json": '{"name": "ui"}',
        "apps/api/package.json": '{"name": "api"}',
      })
      
      const rootPkg = { name: "root" }
      const packages = await discoverPackages(dir, rootPkg, "nx")
      expect(packages.length).toBe(2)
      expect(packages.map(p => p.name).sort()).toEqual(["api", "ui"])
    })
  })
})