import { describe, it, expect, vi, afterEach } from "vitest"
import { detectProject, type ProjectInfo } from "../../src/config/index.js"
import * as fs from "node:fs"

// We test detectProject by pointing it at real temp directories
import * as os from "node:os"
import * as path from "node:path"
import { promises as fsp } from "node:fs"

describe("detectProject", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("returns defaults for empty root", async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "wm-detect-empty-"))
    try {
      const result = await detectProject(dir)
      expect(result.isMonorepo).toBe(false)
      expect(result.monorepoType).toBeNull()
      expect(result.packages).toEqual([])
      expect(result.primaryLanguage).toBeNull()
      expect(result.framework).toBeNull()
      expect(result.packageManager).toBeNull()
      expect(result.hasTypeScript).toBe(false)
      expect(result.hasTests).toBe(false)
    } finally {
      await fsp.rm(dir, { recursive: true, force: true })
    }
  })

  it("detects pnpm monorepo", async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "wm-detect-pnpm-"))
    try {
      await fsp.writeFile(path.join(dir, "pnpm-workspace.yaml"), "packages:\n  - packages/*")
      await fsp.writeFile(path.join(dir, "pnpm-lock.yaml"), "lockfileVersion: 9")
      await fsp.mkdir(path.join(dir, "packages"), { recursive: true })
      const result = await detectProject(dir)
      expect(result.isMonorepo).toBe(true)
      expect(result.monorepoType).toBe("pnpm")
      expect(result.packageManager).toBe("pnpm")
    } finally {
      await fsp.rm(dir, { recursive: true, force: true })
    }
  })

  it("detects turbo monorepo", async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "wm-detect-turbo-"))
    try {
      await fsp.writeFile(path.join(dir, "turbo.json"), '{"pipeline":{}}')
      const result = await detectProject(dir)
      expect(result.isMonorepo).toBe(true)
      expect(result.monorepoType).toBe("turbo")
    } finally {
      await fsp.rm(dir, { recursive: true, force: true })
    }
  })

  it("detects npm workspaces monorepo via package.json", async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "wm-detect-npm-"))
    try {
      await fsp.writeFile(path.join(dir, "package.json"), '{"name":"root","workspaces":["packages/*"]}')
      await fsp.writeFile(path.join(dir, "package-lock.json"), "{}")
      const result = await detectProject(dir)
      expect(result.isMonorepo).toBe(true)
      expect(result.monorepoType).toBe("npm")
      expect(result.packageManager).toBe("npm")
    } finally {
      await fsp.rm(dir, { recursive: true, force: true })
    }
  })

  it("detects package manager from lockfile", async () => {
    // npm
    let dir = await fsp.mkdtemp(path.join(os.tmpdir(), "wm-detect-lock-"))
    try {
      await fsp.writeFile(path.join(dir, "package-lock.json"), "{}")
      const result = await detectProject(dir)
      expect(result.packageManager).toBe("npm")
    } finally {
      await fsp.rm(dir, { recursive: true, force: true })
    }

    // yarn
    dir = await fsp.mkdtemp(path.join(os.tmpdir(), "wm-detect-lock-"))
    try {
      await fsp.writeFile(path.join(dir, "yarn.lock"), "")
      const result = await detectProject(dir)
      expect(result.packageManager).toBe("yarn")
    } finally {
      await fsp.rm(dir, { recursive: true, force: true })
    }

    // pnpm
    dir = await fsp.mkdtemp(path.join(os.tmpdir(), "wm-detect-lock-"))
    try {
      await fsp.writeFile(path.join(dir, "pnpm-lock.yaml"), "lockfileVersion: 9")
      const result = await detectProject(dir)
      expect(result.packageManager).toBe("pnpm")
    } finally {
      await fsp.rm(dir, { recursive: true, force: true })
    }

    // bun
    dir = await fsp.mkdtemp(path.join(os.tmpdir(), "wm-detect-lock-"))
    try {
      await fsp.writeFile(path.join(dir, "bun.lockb"), "")
      const result = await detectProject(dir)
      expect(result.packageManager).toBe("bun")
    } finally {
      await fsp.rm(dir, { recursive: true, force: true })
    }
  })

  it("detects primary language from file extensions", async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "wm-detect-lang-"))
    try {
      await fsp.writeFile(path.join(dir, "a.ts"), "")
      await fsp.writeFile(path.join(dir, "b.ts"), "")
      await fsp.writeFile(path.join(dir, "c.ts"), "")
      await fsp.writeFile(path.join(dir, "d.py"), "")
      await fsp.writeFile(path.join(dir, "e.js"), "")
      const result = await detectProject(dir)
      expect(result.primaryLanguage).toBe("TypeScript")
    } finally {
      await fsp.rm(dir, { recursive: true, force: true })
    }
  })

  it("detects TypeScript from tsconfig.json", async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "wm-detect-ts-"))
    try {
      await fsp.writeFile(path.join(dir, "tsconfig.json"), "{}")
      const result = await detectProject(dir)
      expect(result.hasTypeScript).toBe(true)
    } finally {
      await fsp.rm(dir, { recursive: true, force: true })
    }
  })

  it("detects TypeScript from package.json devDependencies", async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "wm-detect-ts-"))
    try {
      await fsp.writeFile(path.join(dir, "package.json"), '{"devDependencies":{"typescript":"^5.0.0"}}')
      const result = await detectProject(dir)
      expect(result.hasTypeScript).toBe(true)
    } finally {
      await fsp.rm(dir, { recursive: true, force: true })
    }
  })

  it("detects framework from dependencies", async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "wm-detect-fw-"))
    try {
      await fsp.writeFile(path.join(dir, "package.json"), '{"dependencies":{"next":"^14.0.0"}}')
      const result = await detectProject(dir)
      expect(result.framework).toBe("Next.js")
    } finally {
      await fsp.rm(dir, { recursive: true, force: true })
    }
  })

  it("detects React framework", async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "wm-detect-fw-"))
    try {
      await fsp.writeFile(path.join(dir, "package.json"), '{"dependencies":{"react":"^18.0.0"}}')
      const result = await detectProject(dir)
      expect(result.framework).toBe("React")
    } finally {
      await fsp.rm(dir, { recursive: true, force: true })
    }
  })

  it("detects tests from config files", async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "wm-detect-test-"))
    try {
      await fsp.writeFile(path.join(dir, "vitest.config.ts"), "")
      const result = await detectProject(dir)
      expect(result.hasTests).toBe(true)
    } finally {
      await fsp.rm(dir, { recursive: true, force: true })
    }
  })

  it("detects tests from __tests__ directory", async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "wm-detect-test-"))
    try {
      await fsp.mkdir(path.join(dir, "__tests__"), { recursive: true })
      const result = await detectProject(dir)
      expect(result.hasTests).toBe(true)
    } finally {
      await fsp.rm(dir, { recursive: true, force: true })
    }
  })
})
