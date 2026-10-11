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
  indexDotDirs?: string[]
  watchEnabled?: boolean
  watch?: {
    debounceMs?: number
    batchChanges?: boolean
    batchTimeoutMs?: number
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

export interface MonorepoPackage {
  name: string
  path: string
  packageJson: any
  language: string | null
}

export interface WorkspaceMapInput {
  path?: string
  query?: string
  refresh?: boolean
  limit?: number
  format?: "map" | "json"
  action?: "map" | "stats" | "export" | "graph" | "packages"
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
  // Watch mode configuration
  watch: {
    debounceMs: 500,
    batchChanges: true,
    batchTimeoutMs: 100,
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