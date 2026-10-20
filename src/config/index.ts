import { promises as fs } from "node:fs"
import * as path from "node:path"

import type {
  SummarizerKind,
  InjectMode,
  InjectStrategy,
  WalkConcurrency,
  SummarizerPreference,
  SummarySectionConfig,
  Options,
  FileEntry,
  Stats,
  ProjectInfo,
  MonorepoPackage,
  PackageJson,
  WorkspaceMapInput,
  SymbolInfo,
  SummarySections,
  SymbolRule,
  GitignoreRule,
  StorageScanResult,
} from "./types.ts"

import {
  DEFAULT_IGNORES,
  CODE_EXT,
  DATA_EXT,
  WRITE_TOOLS,
  TOOL_NAME,
  REFRESH_CAP,
  CACHE_VERSION,
  computeCacheVersion,
  DEFAULT_OPTIONS,
} from "./types.ts"

import {
  globToRegex,
  compileGitignore,
  gitignored,
} from "../fs/gitignore.ts"

import {
  createFilterContext,
  setGitignore,
  skipDir,
  skipFile,
  ensureGitignore,
  walk,
} from "../fs/filter.ts"

import { getChangedFiles } from "../fs/vcs.ts"

import { outlineSummarize, modelSummary, lspSummarize } from "../summarizers/index.ts"

export { loadCache, migrateLegacy, saveEntry, pruneCache, scheduleBatchWrite, flushPendingWrites } from "../storage/cache.ts"

import { buildFullMapping, buildDigest, buildInjectionRev } from "../injection/builder.ts"

import { renderTree, focusFiles, mapRev } from "../injection/render.ts"

import { createWorkspaceMapTool } from "../tool/index.ts"
import { registerWatchCommand } from "../cli/index.ts"

import { enqueue, setDisposed } from "../utils/enqueue.ts"

import { hash, locKey, entryPrefix, LEGACY_PREFIX } from "../utils/hash.ts"

import { createSemaphore } from "../utils/semaphore.ts"

import { languageRuleRegistry, type LanguageRules } from "../summarizers/languages/registry.ts"
import { GENERIC_CODE_SYMBOL_RULES } from "../summarizers/languages/generic.ts"

import {
  DOT_DIR_ALLOW,
  DOT_FILE_ALLOW,
  TOP_LEVEL_IGNORES,
  LOCKFILES,
  BINARY_EXT,
  SECRET_EXT,
  SECRET_STEM,
  SECRET_STEM_EXT,
} from "../shared.ts"

import { createLogger, createNoOpLogger, type Logger, type LogLevel, generateCorrelationId } from "../utils/logger.ts"
import { extOf, isSecret, isBinary, isLockfile, isMinified } from "../utils/file.ts"

export type {
  SummarizerKind,
  InjectMode,
  InjectStrategy,
  WalkConcurrency,
  SummarizerPreference,
  SummarySectionConfig,
  Options,
  FileEntry,
  Stats,
  ProjectInfo,
  MonorepoPackage,
  PackageJson,
  WorkspaceMapInput,
  SymbolInfo,
  SummarySections,
  SymbolRule,
  GitignoreRule,
  StorageScanResult,
}

export { DEFAULT_IGNORES, CODE_EXT, DATA_EXT, WRITE_TOOLS, TOOL_NAME, REFRESH_CAP, CACHE_VERSION, computeCacheVersion } from "./types.ts"
export type { LogFn } from "./types.ts"
export { TOP_LEVEL_IGNORES, DOT_DIR_ALLOW, DOT_FILE_ALLOW, SECRET_EXT, SECRET_STEM, SECRET_STEM_EXT, LOCKFILES, BINARY_EXT } from "../shared.ts"

export { DEFAULT_OPTIONS } from "./types.ts"

export { languageRuleRegistry, type LanguageRules } from "../summarizers/languages/registry.ts"
export { GENERIC_CODE_SYMBOL_RULES } from "../summarizers/languages/generic.ts"

export { entryPrefix, LEGACY_PREFIX, locKey } from "../utils/hash.ts"

export { createLogger, createNoOpLogger, type Logger, type LogLevel, generateCorrelationId, withCorrelationId, withCorrelationIdAsync } from "../utils/logger.ts"
export { isSecret, isBinary, isLockfile, isMinified, extOf } from "../utils/file.ts"
export {
  WorkspaceMapError,
  ConfigError,
  ConfigNotFoundError,
  ConfigValidationError,
  SummarizationError,
  StorageError,
  WatchError,
  LspError,
  FileError,
  WalkError,
  InjectionError,
  InternalError,
  type ErrorCode,
  isWorkspaceMapError,
  hasErrorCode,
  getErrorCode,
} from "../utils/errors.ts"

export type {
  CancellationToken,
  createCancellationToken,
  createCancellationTokenWithTimeout,
  raceCancellation,
  withCancellation,
  createAbortSignal,
  isAbortError,
  isCancelledError,
} from "../utils/cancellation.ts"

export type { SummarizationPriority } from "../utils/priority-queue.ts"

export type { PluginContext } from "../setup.ts"
export type { Storage, VcsProvider, FileWatcher, Summarizer, LspClient, PluginApi } from "../interfaces.ts"
export { MetricsCollector, NoOpMetricsCollector, createMetricsCollector, initializeMetrics, shutdownMetrics } from "../metrics/index.ts"

export function familyOf(ext: string): "js" | "py" | "go" | "rust" | "jvm" | "code" | "data" | "other" {
  if (["ts", "tsx", "js", "jsx", "mjs", "cjs", "vue", "svelte"].includes(ext)) return "js"
  if (ext === "py") return "py"
  if (ext === "go") return "go"
  if (ext === "rs") return "rust"
  if (["java", "kt", "kts", "scala", "cs"].includes(ext)) return "jvm"
  if (CODE_EXT.has(ext)) return "code"
  if (DATA_EXT.has(ext)) return "data"
  return "other"
}

export async function detectProject(root: string): Promise<ProjectInfo> {
  const info: ProjectInfo = {
    isMonorepo: false,
    monorepoType: null,
    packages: [],
    primaryLanguage: null,
    framework: null,
    packageManager: null,
    hasTypeScript: false,
    hasTests: false,
  }

  try {
    const monorepoFiles = [
      "pnpm-workspace.yaml",
      "pnpm-workspace.yml",
      "turbo.json",
      "turbo.jsonc",
      "nx.json",
      "lerna.json",
      "rush.json",
      "workspace.json",
      ".github/workflows",
    ]
    
    for (const f of monorepoFiles) {
      try {
        await fs.stat(path.join(root, f))
        info.isMonorepo = true
        
        if (f.startsWith("pnpm-workspace")) info.monorepoType = "pnpm"
        else if (f.startsWith("turbo")) info.monorepoType = "turbo"
        else if (f === "nx.json") info.monorepoType = "nx"
        else if (f === "lerna.json") info.monorepoType = "lerna"
        else if (f === "rush.json") info.monorepoType = "rush"
        else if (f === "workspace.json") info.monorepoType = "npm"
        
        break
      } catch { /* ignore */ }
    }

    try {
      const pkgRaw = await fs.readFile(path.join(root, "package.json"), "utf8")
      const pkg = JSON.parse(pkgRaw)
      if (pkg.workspaces) {
        info.isMonorepo = true
        if (!info.monorepoType) info.monorepoType = "npm"
      }
    } catch { /* ignore */ }

    if (await fs.stat(path.join(root, "pnpm-lock.yaml")).catch(() => false)) {
      info.packageManager = "pnpm"
      if (!info.monorepoType) info.monorepoType = "pnpm"
    }
    else if (await fs.stat(path.join(root, "yarn.lock")).catch(() => false)) info.packageManager = "yarn"
    else if (await fs.stat(path.join(root, "bun.lock")).catch(() => false) ||
             await fs.stat(path.join(root, "bun.lockb")).catch(() => false)) info.packageManager = "bun"
    else if (await fs.stat(path.join(root, "package-lock.json")).catch(() => false)) {
      info.packageManager = "npm"
      if (!info.monorepoType) info.monorepoType = "npm"
    }

    const langCounts = new Map<string, number>()
    try {
      const entries = await fs.readdir(root, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isFile()) continue
        const ext = path.extname(entry.name).toLowerCase()
        if (ext) langCounts.set(ext, (langCounts.get(ext) ?? 0) + 1)
      }
    } catch { /* ignore */ }

    const extToLang: Record<string, string> = {
      ".ts": "TypeScript", ".tsx": "TypeScript", ".js": "JavaScript", ".jsx": "JavaScript",
      ".py": "Python", ".go": "Go", ".rs": "Rust", ".java": "Java", ".kt": "Kotlin",
      ".cs": "C#", ".rb": "Ruby", ".php": "PHP", ".swift": "Swift", ".dart": "Dart",
      ".cpp": "C++", ".cc": "C++", ".c": "C", ".h": "C/C++",
    }

    let maxCount = 0
    for (const [ext, count] of langCounts) {
      const lang = extToLang[ext]
      if (lang && count > maxCount) {
        maxCount = count
        info.primaryLanguage = lang
      }
    }

    try {
      await fs.stat(path.join(root, "tsconfig.json"))
      info.hasTypeScript = true
    } catch {
      try {
        const pkgRaw = await fs.readFile(path.join(root, "package.json"), "utf8")
        const pkg = JSON.parse(pkgRaw)
        if (pkg.devDependencies?.typescript || pkg.dependencies?.typescript) info.hasTypeScript = true
      } catch { /* ignore */ }
    }

    try {
      const pkgRaw = await fs.readFile(path.join(root, "package.json"), "utf8")
      const pkg = JSON.parse(pkgRaw)
      const deps = { ...pkg.dependencies, ...pkg.devDependencies }
      if (deps.next) info.framework = "Next.js"
      else if (deps.nuxt) info.framework = "Nuxt"
      else if (deps.react || deps["react-dom"]) info.framework = "React"
      else if (deps.vue) info.framework = "Vue"
      else if (deps.svelte) info.framework = "Svelte"
      else if (deps.astro) info.framework = "Astro"
      else if (deps.remix) info.framework = "Remix"
      else if (deps.express) info.framework = "Express"
      else if (deps.fastify) info.framework = "Fastify"
      else if (deps["@nestjs/core"]) info.framework = "NestJS"
      else if (deps.trpc) info.framework = "tRPC"
      else if (deps.graphql) info.framework = "GraphQL"
    } catch { /* ignore */ }

    const testFiles = ["jest.config", "vitest.config", "playwright.config", "cypress.config", "mocha.opts", ".mocharc"]
    for (const f of testFiles) {
      try { await fs.stat(path.join(root, f + ".js")); info.hasTests = true; break }
      catch { try { await fs.stat(path.join(root, f + ".ts")); info.hasTests = true; break } catch { /* ignore */ } }
    }
    try { await fs.stat(path.join(root, "__tests__")); info.hasTests = true }
    catch { try { await fs.stat(path.join(root, "tests")); info.hasTests = true } catch { /* ignore */ } }
  } catch { /* ignore all detection errors */ }

  return info
}

export async function discoverPackages(root: string, rootPkg: any, monorepoType: string | null): Promise<MonorepoPackage[]> {
  try {
    const packages: MonorepoPackage[] = []
    const workspacePatterns: string[] = []

    if (rootPkg.workspaces) {
      if (Array.isArray(rootPkg.workspaces)) {
        workspacePatterns.push(...rootPkg.workspaces)
      } else if (typeof rootPkg.workspaces === "object" && Array.isArray(rootPkg.workspaces.packages)) {
        workspacePatterns.push(...rootPkg.workspaces.packages)
      }
    }

    if (monorepoType === "pnpm" || monorepoType === null) {
      try {
        const yamlContent = await fs.readFile(path.join(root, "pnpm-workspace.yaml"), "utf8")
        const lines = yamlContent.split("\n")
        let inPackages = false
        for (const line of lines) {
          const trimmed = line.trim()
          if (trimmed === "packages:") {
            inPackages = true
            continue
          }
          if (inPackages) {
            if (trimmed.startsWith("- ")) {
              workspacePatterns.push(trimmed.slice(2).trim())
            } else if (trimmed && !trimmed.startsWith("#") && !trimmed.startsWith("-")) {
              inPackages = false
            }
          }
        }
      } catch { /* ignore */ }
    }

    if (monorepoType === "turbo") {
      try {
        const turboRaw = await fs.readFile(path.join(root, "turbo.json"), "utf8")
        const turbo = JSON.parse(turboRaw)
        if (turbo.packages) {
          workspacePatterns.push(...turbo.packages)
        }
      } catch { /* ignore */ }
    }

    if (monorepoType === "nx") {
      try {
        const nxRaw = await fs.readFile(path.join(root, "nx.json"), "utf8")
        const nx = JSON.parse(nxRaw)
        if (nx.projects) {
          for (const [name, config] of Object.entries(nx.projects as Record<string, any>)) {
            if (config.root) {
              workspacePatterns.push(config.root)
            }
          }
        }
      } catch { /* ignore */ }
    }

    if (monorepoType === "lerna") {
      try {
        const lernaRaw = await fs.readFile(path.join(root, "lerna.json"), "utf8")
        const lerna = JSON.parse(lernaRaw)
        if (lerna.packages) {
          workspacePatterns.push(...lerna.packages)
        }
      } catch { /* ignore */ }
    }

    if (monorepoType === "rush") {
      try {
        const rushRaw = await fs.readFile(path.join(root, "rush.json"), "utf8")
        const rush = JSON.parse(rushRaw)
        if (rush.projects) {
          for (const proj of rush.projects) {
            if (proj.projectFolder) workspacePatterns.push(proj.projectFolder)
          }
        }
      } catch { /* ignore */ }
    }

    const visited = new Set<string>()
    
    async function scanDir(dir: string, relPrefix: string = "") {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true })
        for (const entry of entries) {
          if (!entry.isDirectory()) continue
          const fullPath = path.join(dir, entry.name)
          const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name
          
          if (["node_modules", ".git", ".hg", ".svn", "dist", "build", "out", ".next", ".turbo"].includes(entry.name)) continue
          
          const pkgPath = path.join(fullPath, "package.json")
          try {
            const pkgRaw = await fs.readFile(pkgPath, "utf8")
            const pkg = JSON.parse(pkgRaw)
            if (pkg.name && !visited.has(pkg.name)) {
              visited.add(pkg.name)
              
              let language: string | null = null
              try {
                const pkgEntries = await fs.readdir(fullPath, { withFileTypes: true })
                const extCounts = new Map<string, number>()
                for (const e of pkgEntries) {
                  if (!e.isFile()) continue
                  const ext = path.extname(e.name).toLowerCase()
                  if (ext) extCounts.set(ext, (extCounts.get(ext) ?? 0) + 1)
                }
                const extToLang: Record<string, string> = {
                  ".ts": "TypeScript", ".tsx": "TypeScript", ".js": "JavaScript", ".jsx": "JavaScript",
                  ".py": "Python", ".go": "Go", ".rs": "Rust", ".java": "Java", ".kt": "Kotlin",
                  ".cs": "C#", ".rb": "Ruby", ".php": "PHP", ".swift": "Swift", ".dart": "Dart",
                }
                let maxCount = 0
                for (const [ext, count] of extCounts) {
                  const lang = extToLang[ext]
                  if (lang && count > maxCount) {
                    maxCount = count
                    language = lang
                  }
                }
              packages.push({
                name: pkg.name,
                path: relPath,
                packageJson: pkg,
                language,
              })
              } catch { /* ignore */ }
              
            
            await scanDir(fullPath, relPath)
          }
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

    for (const pattern of workspacePatterns) {
      if (pattern.endsWith("/*")) {
        const dir = pattern.slice(0, -2)
        await scanDir(path.join(root, dir), dir)
      } else if (pattern.includes("*")) {
        await scanDir(path.join(root, pattern), pattern)
      } else {
        await scanDir(path.join(root, pattern), pattern)
      }
    }

    const commonDirs = ["packages", "libs", "apps", "services", "tools", "modules"]
    for (const dir of commonDirs) {
      await scanDir(path.join(root, dir), dir)
    }

    return packages
  } catch { /* ignore */ }
  return []
}

export function autoTuneOptions(opts: Options, project: ProjectInfo, log: (msg: string) => void): void {
  if (!opts.autoTune) return

  if (project.isMonorepo) {
    opts.maxFiles = Math.max(opts.maxFiles, 8000)
    opts.maxTreeEntries = Math.max(opts.maxTreeEntries, 600)
    opts.maxSummaries = Math.min(opts.maxSummaries, 30)
    opts.injectStrategy = "changed"
    log(`auto-tune: monorepo detected → maxFiles=${opts.maxFiles}, maxTreeEntries=${opts.maxTreeEntries}, maxSummaries=${opts.maxSummaries}`)
  }

  if (opts.maxFiles > 5000) {
    opts.treeTtlMs = Math.max(opts.treeTtlMs, 30_000)
    opts.maxInjectedChars = Math.min(opts.maxInjectedChars, 8000)
    log(`auto-tune: large repo → treeTtlMs=${opts.treeTtlMs}, maxInjectedChars=${opts.maxInjectedChars}`)
  }

  if (project.hasTypeScript && opts.summarizer === "outline") {
    log(`auto-tune: TypeScript project → using outline summarizer`)
  }

  if (project.hasTests) {
    opts.warmupSummaries = Math.max(opts.warmupSummaries, 40)
    log(`auto-tune: tests detected → warmupSummaries=${opts.warmupSummaries}`)
  }

  if (project.framework) {
    if (["Next.js", "Nuxt", "Remix", "Astro"].includes(project.framework)) {
      opts.ignoreExtra = [...new Set([...opts.ignoreExtra, ".next", ".nuxt", ".output", "dist", "build", ".astro"])]
      log(`auto-tune: ${project.framework} → ignoring build output dirs`)
    }
    if (project.framework === "NestJS") {
      opts.ignoreExtra = [...new Set([...opts.ignoreExtra, "dist"])]
    }
  }
}

export async function loadSidecarConfig(): Promise<Partial<Options>> {
  try {
    const here: string = (import.meta as { dirname?: string }).dirname ?? path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"))
    const raw = await fs.readFile(path.join(here, "config.json"), "utf8")
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

export function mergeOptions(
  sidecar: Partial<Options>,
  pluginOpts: Partial<Options> | undefined
): Options {
  return {
    ...DEFAULT_OPTIONS,
    ...sidecar,
    ...(pluginOpts ?? {}),
    ignore: [...DEFAULT_IGNORES, ...(sidecar.ignore as string[] ?? []), ...(pluginOpts as any)?.ignore ?? []],
    ignoreExtra: [...(sidecar.ignoreExtra as string[] ?? []), ...(pluginOpts as any)?.ignoreExtra ?? []],
    include: [...(sidecar.include as string[] ?? []), ...(pluginOpts as any)?.include ?? []],
  }
}

export function validateOptions(opts: Options, log: (msg: string) => void): void {
  const validInject = ["off", "tree", "changed", "full"]
  const validStrategy = ["first", "changed", "always"]
  const validSummarizer = ["outline", "model", "lsp"]

  if (!validInject.includes(opts.inject)) {
    log(`invalid inject=${JSON.stringify(opts.inject)} (expected ${validInject.join("|")}); using "${DEFAULT_OPTIONS.inject}"`)
    opts.inject = DEFAULT_OPTIONS.inject
  }
  if (!validStrategy.includes(opts.injectStrategy)) {
    log(`invalid injectStrategy=${JSON.stringify(opts.injectStrategy)} (expected ${validStrategy.join("|")}); using "${DEFAULT_OPTIONS.injectStrategy}"`)
    opts.injectStrategy = DEFAULT_OPTIONS.injectStrategy
  }
  if (!validSummarizer.includes(opts.summarizer)) {
    log(`invalid summarizer=${JSON.stringify(opts.summarizer)} (expected ${validSummarizer.join("|")}); using "${DEFAULT_OPTIONS.summarizer}"`)
    opts.summarizer = DEFAULT_OPTIONS.summarizer
  }
  // Validate generated patterns are strings
  if (opts.generatedPatterns && !Array.isArray(opts.generatedPatterns)) {
    log(`invalid generatedPatterns (expected string[]); using default`)
    opts.generatedPatterns = DEFAULT_OPTIONS.generatedPatterns
  }
  if (typeof opts.autoDetectGenerated !== "boolean" && opts.autoDetectGenerated !== undefined) {
    log(`invalid autoDetectGenerated (expected boolean); using default`)
    opts.autoDetectGenerated = DEFAULT_OPTIONS.autoDetectGenerated
  }
}

export function resolveSummarizer(ext: string, opts: Options): SummarizerKind {
  const pref = opts.summarizerPreference ?? DEFAULT_OPTIONS.summarizerPreference!
  
  if (pref.perLanguage && pref.perLanguage[ext]) {
    return pref.perLanguage[ext]!
  }
  
  if (pref.preferLspFor?.includes(ext)) {
    const chain = pref.fallbackChain ?? ["lsp", "outline", "model"]
    return chain[0]!
  }
  
  return opts.summarizer
}

export function getFallbackChain(ext: string, opts: Options): SummarizerKind[] {
  const pref = opts.summarizerPreference ?? DEFAULT_OPTIONS.summarizerPreference!
  const primary = resolveSummarizer(ext, opts)
  const chain = pref.fallbackChain ?? ["outline", "model", "lsp"]
  // Return chain starting with primary, then remaining in fallback order
  return [primary, ...chain.filter(k => k !== primary)]
}

export async function detectOptimalWalkConcurrency(root: string, log: (msg: string) => void): Promise<number> {
  const testDir = root
  const sampleCount = 50
  const latencies: number[] = []
  
  try {
    const testFile = path.join(testDir, `.wm-bench-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    await fs.writeFile(testFile, "benchmark")
    
    for (let i = 0; i < 5; i++) {
      await fs.stat(testFile)
    }
    
    for (let i = 0; i < sampleCount; i++) {
      const start = process.hrtime.bigint()
      await fs.stat(testFile)
      const end = process.hrtime.bigint()
      latencies.push(Number(end - start) / 1_000_000)
    }
    
    await fs.unlink(testFile).catch(() => {})
    
    latencies.sort((a, b) => a - b)
    const medianLatency = latencies[Math.floor(latencies.length / 2)]
    
    let concurrency: number
    if (medianLatency < 0.1) {
      concurrency = 16
    } else if (medianLatency < 0.5) {
      concurrency = 8
    } else if (medianLatency < 2) {
      concurrency = 4
    } else if (medianLatency < 10) {
      concurrency = 2
    } else {
      concurrency = 1
    }
    
    log(`auto-tune: walk concurrency detected ${medianLatency.toFixed(2)}ms median latency → ${concurrency} workers`)
    return concurrency
  } catch (err) {
    log(`auto-tune: walk concurrency detection failed, using default: ${err}`)
    return DEFAULT_OPTIONS.walkConcurrency as number
  }
}
