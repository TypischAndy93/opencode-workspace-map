import { describe, it, expect } from "vitest"
import { autoTuneOptions, DEFAULT_OPTIONS, type Options, type ProjectInfo } from "../../src/config/index.js"

function createOpts(overrides: Partial<Options> = {}): Options {
  return { ...DEFAULT_OPTIONS, ...overrides }
}

function createProject(overrides: Partial<ProjectInfo> = {}): ProjectInfo {
  return {
    isMonorepo: false,
    monorepoType: null,
    packages: [],
    primaryLanguage: null,
    framework: null,
    packageManager: null,
    hasTypeScript: false,
    hasTests: false,
    ...overrides,
  }
}

describe("autoTuneOptions", () => {
  it("does nothing when autoTune is false", () => {
    const opts = createOpts({ autoTune: false })
    const project = createProject({ isMonorepo: true, hasTests: true })
    const logMsgs: string[] = []
    autoTuneOptions(opts, project, (msg) => logMsgs.push(msg))
    expect(opts.maxFiles).toBe(DEFAULT_OPTIONS.maxFiles)
    expect(opts.warmupSummaries).toBe(DEFAULT_OPTIONS.warmupSummaries)
    expect(logMsgs.length).toBe(0)
  })

  it("tunes for monorepo", () => {
    const opts = createOpts()
    const project = createProject({ isMonorepo: true, monorepoType: "pnpm" })
    const logMsgs: string[] = []
    autoTuneOptions(opts, project, (msg) => logMsgs.push(msg))
    expect(opts.maxFiles).toBe(Math.max(DEFAULT_OPTIONS.maxFiles, 8000))
    expect(opts.maxTreeEntries).toBe(Math.max(DEFAULT_OPTIONS.maxTreeEntries, 600))
    expect(opts.maxSummaries).toBe(Math.min(DEFAULT_OPTIONS.maxSummaries, 30))
    expect(opts.injectStrategy).toBe("changed")
    expect(logMsgs.some((m) => m.includes("monorepo detected"))).toBe(true)
  })

  it("tunes for large repo (maxFiles > 5000)", () => {
    const opts = createOpts({ maxFiles: 10000 })
    const project = createProject()
    const logMsgs: string[] = []
    autoTuneOptions(opts, project, (msg) => logMsgs.push(msg))
    expect(opts.treeTtlMs).toBe(Math.max(DEFAULT_OPTIONS.treeTtlMs, 30_000))
    expect(opts.maxInjectedChars).toBe(Math.min(DEFAULT_OPTIONS.maxInjectedChars, 8000))
    expect(logMsgs.some((m) => m.includes("large repo"))).toBe(true)
  })

  it("logs TypeScript project when using outline summarizer", () => {
    const opts = createOpts({ summarizer: "outline" })
    const project = createProject({ hasTypeScript: true })
    const logMsgs: string[] = []
    autoTuneOptions(opts, project, (msg) => logMsgs.push(msg))
    expect(logMsgs.some((m) => m.includes("TypeScript project"))).toBe(true)
  })

  it("increases warmupSummaries when tests detected", () => {
    const opts = createOpts({ warmupSummaries: 20 })
    const project = createProject({ hasTests: true })
    const logMsgs: string[] = []
    autoTuneOptions(opts, project, (msg) => logMsgs.push(msg))
    expect(opts.warmupSummaries).toBe(Math.max(DEFAULT_OPTIONS.warmupSummaries, 40))
    expect(logMsgs.some((m) => m.includes("tests detected"))).toBe(true)
  })

  it("adds framework-specific ignore patterns", () => {
    const opts = createOpts()
    const project = createProject({ framework: "Next.js" })
    const logMsgs: string[] = []
    autoTuneOptions(opts, project, (msg) => logMsgs.push(msg))
    expect(opts.ignoreExtra).toContain(".next")
    expect(opts.ignoreExtra).toContain("dist")
    expect(logMsgs.some((m) => m.includes("Next.js"))).toBe(true)
  })

  it("adds NestJS-specific ignore patterns", () => {
    const opts = createOpts()
    const project = createProject({ framework: "NestJS" })
    autoTuneOptions(opts, project, () => {})
    expect(opts.ignoreExtra).toContain("dist")
  })

  it("does not duplicate ignore patterns", () => {
    const opts = createOpts({ ignoreExtra: [".next"] })
    const project = createProject({ framework: "Next.js" })
    autoTuneOptions(opts, project, () => {})
    const nextCount = opts.ignoreExtra.filter((p) => p === ".next").length
    expect(nextCount).toBe(1)
  })

  it("does not tune maxFiles below existing for monorepo", () => {
    const opts = createOpts({ maxFiles: 20000 })
    const project = createProject({ isMonorepo: true })
    autoTuneOptions(opts, project, () => {})
    expect(opts.maxFiles).toBe(20000) // Math.max keeps existing higher value
  })

  it("does not tune warmupSummaries below existing when tests detected", () => {
    const opts = createOpts({ warmupSummaries: 100 })
    const project = createProject({ hasTests: true })
    autoTuneOptions(opts, project, () => {})
    expect(opts.warmupSummaries).toBe(100) // Math.max keeps existing higher value
  })
})
