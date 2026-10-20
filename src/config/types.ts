export interface GitignoreRule {
  negate: boolean
  regex: RegExp
}

export interface SymbolRule {
  re: RegExp
  group: number
  kind: "export" | "local"
  symbolKind?: "function" | "class" | "interface" | "type" | "enum" | "const" | "var" | "method" | "property" | "namespace" | "module"
}

export interface SymbolInfo {
  name: string
  kind?: "function" | "class" | "interface" | "type" | "enum" | "const" | "var" | "method" | "property" | "namespace" | "module"
  line?: number
  character?: number
}

export interface SummarySections {
  purpose?: string
  keyExports?: SymbolInfo[]
  dependencies?: string[]
  todos?: string[]
}

export interface SummarySectionConfig {
  includePurpose?: boolean
  includeKeyExports?: boolean
  includeDependencies?: boolean
  includeTodos?: boolean
  maxPurposeLength?: number
  maxExports?: number
  maxDependencies?: number
  maxTodos?: number
}

export interface SummarizerPreference {
  preferLspFor?: string[]
  fallbackChain?: SummarizerKind[]
  perLanguage?: Record<string, SummarizerKind>
  // LSP graceful degradation
  lspFallbackOnTimeout?: boolean
  lspFallbackOnError?: boolean
}

export type SummarizerKind = "outline" | "model" | "lsp"
export type InjectMode = "off" | "tree" | "changed" | "full"
export type InjectStrategy = "first" | "changed" | "always"
export type WalkConcurrency = number | "auto"

export type LogLevel = "debug" | "info" | "warn" | "error"

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void
  info(message: string, context?: Record<string, unknown>): void
  warn(message: string, context?: Record<string, unknown>): void
  error(message: string, context?: Record<string, unknown>, error?: Error): void
  child(context: Record<string, unknown>): Logger
  setLevel(level: LogLevel): void
  getLevel(): LogLevel
}

export type LogFn = (...args: unknown[]) => void

export interface FileEntry {
  rel: string
  size: number
  mtimeMs: number
  summary: string
  symbols: SymbolInfo[]
  imports: string[]
  kind: SummarizerKind | "skipped" | "generated"
  updatedAt: number
  sections?: SummarySections
  cacheVersion?: number
  compressed?: boolean
}

export interface Stats {
  summaries: number
  skippedByRule: number
  walks: number
  fullInjections: number
  digestInjections: number
  dirtyFlushes: number
  warmups: number
  sessions: number
  files: number
  outlineSummaries: number
  modelSummaries: number
  lspSummaries: number
  skippedSummaries: number
  lastWalkMs: number
  lastInjectionChars: number
  lastInjectionAt: number
  // Cost tracking
  totalInputTokens: number
  totalOutputTokens: number
  totalCostUsd: number
  costBySummarizer: Record<SummarizerKind, { inputTokens: number; outputTokens: number; costUsd: number }>
}

export interface Options {
  enabled: boolean
  inject: InjectMode
  injectStrategy: InjectStrategy
  summarizer: SummarizerKind
  summaryModel?: { providerID: string; id: string; variant?: string }
  registerTool: boolean
  refreshOnWrite: boolean
  respectGitignore: boolean
  allowBroadRoot: boolean
  debounceMs: number
  treeTtlMs: number
  forceWalkOnNewSession?: boolean
  injectAllFiles?: boolean
  summaryPriority?: string[]
  treeDepth: number
  maxTreeEntries: number
  maxInjectedChars: number
  maxSummaries: number
  maxFiles: number
  maxFileBytes: number
  maxFileBytesByExt?: Record<string, number>
  summaryLengthByExt?: Record<string, number>
  warmupSummaries: number
  ignore: string[]
  ignoreExtra: string[]
  include: string[]
  debug: boolean
  logFormat?: "text" | "json"
  walkConcurrency: WalkConcurrency
  summarizeConcurrency: number
  summaryLength?: "short" | "medium" | "long"
  autoTune?: boolean
  exportJsonl?: boolean
  exportJsonlPath?: string
  lspTimeoutMs: number
  lspMaxSymbols: number
  lspCacheTtlMs?: number
  indexDotDirs?: string[]
  watchEnabled?: boolean
  watchPattern?: string
  watch?: {
    debounceMs?: number
    batchChanges?: boolean
    batchTimeoutMs?: number
    smartDebounce?: boolean
    minDebounceMs?: number
    maxDebounceMs?: number
    debounceStrategy?: "fixed" | "adaptive" | "coalesce"
    coalesceWindowMs?: number
  }
  includeReverseDeps?: boolean
  injectionFormat?: "markdown" | "json" | "both"
  summarizerPreference?: SummarizerPreference
  summarySections?: SummarySectionConfig
  monorepo?: {
    enabled?: boolean
    packageMaps?: boolean
    maxPackages?: number
  }
  followSymlinks?: boolean
  metrics?: {
    enabled?: boolean
    exporter?: "console" | "otlp"
    intervalMs?: number
  }
  // Logging configuration
  logging?: {
    level?: LogLevel
    format?: "text" | "json"
    includeCorrelationId?: boolean
  }
  // Generated file detection
  autoDetectGenerated?: boolean
  generatedPatterns?: string[]
  // Cost tracking
  costTracking?: {
    enabled?: boolean
    inputTokenPriceUsd?: number
    outputTokenPriceUsd?: number
    logIntervalMs?: number
  }
  // Batch storage writes
  cacheFlushIntervalMs?: number
  // Adaptive walk concurrency
  adaptiveWalkConcurrency?: boolean
  adaptiveWalkMinConcurrency?: number
  adaptiveWalkMaxConcurrency?: number
  adaptiveWalkTargetLatencyMs?: number
  adaptiveWalkAdjustmentInterval?: number
}

export interface ProjectInfo {
  isMonorepo: boolean
  monorepoType: "pnpm" | "npm" | "yarn" | "turbo" | "nx" | "lerna" | "rush" | "generic" | null
  packages: MonorepoPackage[]
  primaryLanguage: string | null
  framework: string | null
  packageManager: "npm" | "yarn" | "pnpm" | "bun" | null
  hasTypeScript: boolean
  hasTests: boolean
}

/**
 * Minimal package.json structure for monorepo package detection.
 * Extend as needed for additional fields.
 */
export interface PackageJson {
  name?: string
  version?: string
  private?: boolean
  workspaces?: string[] | { packages: string[] }
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  scripts?: Record<string, string>
  main?: string
  module?: string
  types?: string
  exports?: Record<string, unknown>
  [key: string]: unknown
}

export interface MonorepoPackage {
  name: string
  path: string
  packageJson: PackageJson
  language: string | null
}

export interface WorkspaceMapInput {
  path?: string
  query?: string
  refresh?: boolean
  limit?: number
  format?: "map" | "json"
  action?: "map" | "stats" | "export" | "graph" | "packages" | "symbols" | "definition" | "references" | "health"
  symbol?: string
}

export const DEFAULT_IGNORES = [
  "node_modules",
  ".git",
  ".hg",
  ".svn",
  "dist",
  "build",
  "out",
  "coverage",
  ".next",
  ".nuxt",
  ".output",
  ".cache",
  ".turbo",
  ".parcel-cache",
  ".venv",
  "venv",
  "__pycache__",
  ".mypy_cache",
  ".pytest_cache",
  ".idea",
  "target",
  "obj",
  ".terraform",
  ".android",
  ".gradle",
  ".m2",
  ".npm",
  ".ssh",
  ".aws",
  ".azure",
  ".gnupg",
  ".kube",
  ".docker",
  ".config",
  "vendor",
]

export const CODE_EXT = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs", "vue", "svelte", "py", "go", "rs",
  "java", "kt", "kts", "scala", "cs", "c", "cc", "cpp", "cxx", "h", "hpp", "hh",
  "rb", "php", "swift", "dart", "lua", "sh", "bash", "zsh", "ps1", "sql",
])

export const DATA_EXT = new Set(["json", "jsonc", "yaml", "yml", "toml", "ini", "cfg", "conf", "properties", "md", "mdx"])

export const WRITE_TOOLS = new Set([
  "write", "edit", "multiedit", "multi_edit", "apply_patch", "patch", "create",
  "write_file", "str_replace_editor", "notebookedit",
])

export const TOOL_NAME = "workspace_map"
export const REFRESH_CAP = 2000

export const CACHE_VERSION = 2

export function computeCacheVersion(entry: FileEntry): number {
  let hash = 0
  const str = entry.summary + entry.symbols.map(s => s.name).join(",") + entry.imports.join(",")
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return hash
}

export const DEFAULT_OPTIONS: Options = {
  enabled: true,
  inject: "changed",
  injectStrategy: "changed",
  summarizer: "outline",
  registerTool: true,
  refreshOnWrite: true,
  respectGitignore: true,
  allowBroadRoot: false,
  debounceMs: 50,
  treeTtlMs: 10_000,
  forceWalkOnNewSession: true,
  injectAllFiles: false,
  summaryPriority: [],
  treeDepth: 3,
  maxTreeEntries: 200,
  maxInjectedChars: 12_000,
  maxSummaries: 50,
  maxFiles: 3000,
  maxFileBytes: 500_000,
  maxFileBytesByExt: {},
  summaryLengthByExt: {
    ts: 500, tsx: 500, js: 500, jsx: 500,
    py: 500, go: 600, rs: 600, java: 600, kt: 600, cs: 600,
    c: 500, cpp: 500, h: 300, hpp: 300,
    rb: 500, php: 500, swift: 500, dart: 500, lua: 400,
    sh: 400, bash: 400, zsh: 400, ps1: 400,
    sql: 400, md: 2000, mdx: 2000, json: 300, yaml: 300, yml: 300, toml: 300,
  },
  warmupSummaries: 20,
  ignore: [],
  ignoreExtra: [],
  include: [],
  debug: false,
  logFormat: "text",
  walkConcurrency: "auto",
  summarizeConcurrency: 4,
  summaryLength: "medium",
  autoTune: true,
  exportJsonl: false,
  lspTimeoutMs: 10_000,
  lspMaxSymbols: 500,
  lspCacheTtlMs: 300_000,
  watchEnabled: true,
  includeReverseDeps: true,
  injectionFormat: "markdown",
  summarizerPreference: {
    fallbackChain: ["outline", "model", "lsp"],
    lspFallbackOnTimeout: true,
    lspFallbackOnError: true,
  },
  summarySections: {
    includePurpose: true,
    includeKeyExports: true,
    includeDependencies: true,
    includeTodos: true,
    maxPurposeLength: 120,
    maxExports: 12,
    maxDependencies: 15,
    maxTodos: 8,
  },
  monorepo: {
    enabled: true,
    packageMaps: true,
    maxPackages: 50,
  },
  followSymlinks: false,
  metrics: {
    enabled: false,
    exporter: "console",
    intervalMs: 30_000,
  },
  // Logging configuration
  logging: {
    level: "info",
    format: "text",
    includeCorrelationId: true,
  },
  // Batch storage writes
  cacheFlushIntervalMs: 5000,
  // Adaptive walk concurrency
  adaptiveWalkConcurrency: true,
  adaptiveWalkMinConcurrency: 1,
  adaptiveWalkMaxConcurrency: 16,
  adaptiveWalkTargetLatencyMs: 5,
  adaptiveWalkAdjustmentInterval: 10,
  // Watch mode configuration
  watch: {
    debounceMs: 500,
    batchChanges: true,
    batchTimeoutMs: 100,
    smartDebounce: false,
    minDebounceMs: 50,
    maxDebounceMs: 2000,
    debounceStrategy: "fixed",
    coalesceWindowMs: 300,
  },
  // Generated file detection
  autoDetectGenerated: true,
  generatedPatterns: [
    "*.generated.*",
    "*.d.ts",
    "dist",
    "dist/**/*",
    "build",
    "build/**/*",
    "out",
    "out/**/*",
    "*.min.js",
    "*.min.css",
    "coverage",
    "coverage/**/*",
    ".next",
    ".next/**/*",
    ".nuxt",
    ".nuxt/**/*",
    ".output",
    ".output/**/*",
    "target",
    "target/**/*",
    "obj",
    "obj/**/*",
    "*.g.dart",
    "GeneratedPluginRegistrant.*",
    "*.pb.go",
    "*.pb.ts",
    "*.pb.js",
    "*_generated.*",
    "generated_*.*",
    "*.designer.*",
    "*.autogenerated.*",
  ],
  // Cost tracking
  costTracking: {
    enabled: false,
    inputTokenPriceUsd: 0.0000015,  // $1.50 per 1M tokens (approximate)
    outputTokenPriceUsd: 0.000006,  // $6.00 per 1M tokens (approximate)
    logIntervalMs: 60_000,
  },
}

export interface StorageScanEntry {
  key: string
  value: unknown
}

export interface StorageScanResult {
  readonly entries: ReadonlyArray<StorageScanEntry>
  next?: string
}