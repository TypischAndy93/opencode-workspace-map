# API Reference

## Overview

workspace-map exposes several internal APIs for advanced usage.

## Plugin Entry Point

```typescript
// index.ts
export default Plugin.define({
  id: "workspace-map",
  async setup(ctx: Context): Promise<Cleanup> {
    // Main plugin setup
  }
})
```

## Configuration Types

```typescript
// config/types.ts
export interface Options {
  enabled: boolean
  inject: InjectMode
  injectStrategy: InjectStrategy
  summarizer: SummarizerKind
  // ... all options
}

export interface Stats {
  summaries: number
  skippedByRule: number
  walks: number
  // ... cost tracking fields
  totalInputTokens: number
  totalOutputTokens: number
  totalCostUsd: number
  costBySummarizer: Record<SummarizerKind, {
    inputTokens: number
    outputTokens: number
    costUsd: number
  }>
}

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
}

export interface SummarySections {
  purpose?: string
  keyExports?: SymbolInfo[]
  dependencies?: string[]
  todos?: string[]
}
```

## Summarizer Interface

```typescript
// summarizers/index.ts
export interface Summarizer {
  kind: "outline" | "model" | "lsp"
  summarize(
    rel: string,
    content: string,
    api: Context,
    opts: Options,
    stats: Stats,
    log: (...args: unknown[]) => void
  ): Promise<{
    summary: string
    symbols: string[]
    imports: string[]
  }>
}

export { outlineSummarize } from "./outline.ts"
export { modelSummary } from "./model.ts"
export { lspSummarize } from "./lsp.ts"
```

## Filter System

```typescript
// fs/filter.ts
export interface FilterContext {
  opts: Options
  stats: Stats
  root: string
  effectiveMaxFiles: number
  ignoreSet: Set<string>
  includeGlobs: RegExp[]
  ignoreGlobs: RegExp[]
  generatedGlobs: RegExp[]
  gitignore: GitignoreRule[] | undefined
  log: (...args: unknown[]) => void
  // ...
  isGenerated: (rel: string) => boolean
}

export function createFilterContext(
  opts: Options,
  stats: Stats,
  root: string,
  effectiveMaxFiles: number,
  log: (...args: unknown[]) => void
): FilterContext

export function skipDir(ctx: FilterContext, rel: string, isTopLevel: boolean): boolean
export function skipFile(ctx: FilterContext, rel: string): boolean
export function isSecret(ctx: FilterContext, rel: string): boolean
export function extOf(rel: string): string
export async function ensureGitignore(ctx: FilterContext): Promise<void>
export async function walk(ctx: FilterContext, dir: string, relDir: string, out: string[]): Promise<void>
```

## Injection System

```typescript
// injection/render.ts
export interface TreeNode {
  name: string
  rel: string
  file: boolean
  generated?: boolean
  children: TreeNode[]
}

export function buildTree(files: string[], isGenerated?: (rel: string) => boolean): TreeNode
export function renderTree(
  files: string[],
  opts: Options,
  broadRoot: boolean,
  changedSet?: Set<string>,
  isGenerated?: (rel: string) => boolean
): string

export function renderJson(
  files: string[],
  changed: string[],
  cache: Map<string, FileEntry>,
  reverseDeps: Map<string, Set<string>>,
  opts: Options,
  broadRoot: boolean,
  stats?: { summaries: number; walks: number; files: number },
  isGenerated?: (rel: string) => boolean
): string

export function focusFiles(
  files: string[],
  changed: string[],
  sessionID: string | undefined,
  recentBySession: Map<string, Map<string, number>>,
  recentGlobal: Map<string, number>
): string[]

export function mapRev(
  files: string[],
  changed: string[],
  cache: Map<string, FileEntry>
): string

export function renderReverseDeps(
  reverseDeps: Map<string, Set<string>>,
  files: string[],
  maxEntries?: number
): string
```

## Builder

```typescript
// injection/builder.ts
export async function buildFullMapping(
  api: Context,
  opts: Options,
  stats: Stats,
  cache: Map<string, FileEntry>,
  reverseDeps: Map<string, Set<string>>,
  root: string,
  broadRoot: boolean,
  sessionID: string | undefined,
  listFiles: (force: boolean) => Promise<string[]>,
  getChangedFiles: () => Promise<string[]>,
  summarizeMany: (rels: string[], force: boolean) => Promise<void>,
  recentBySession: Map<string, Map<string, number>>,
  recentGlobal: Map<string, number>,
  project: ProjectInfo,
  isGenerated?: (rel: string) => boolean
): Promise<string>

export function buildDigest(
  files: string[],
  changed: string[],
  cache: Map<string, FileEntry>,
  broadRoot: boolean
): string

export function buildInjectionRev(
  files: string[],
  changed: string[],
  cache: Map<string, FileEntry>
): string
```

## Summarizer Utilities

```typescript
// summarizers/utils.ts
export function dataSummary(content: string, ext: string): { summary: string; symbols: string[] }
export function codeSummary(
  content: string,
  ext: string,
  sectionConfig?: SummarySectionConfig,
  maxLength?: number
): { summary: string; symbols: Array<{ name: string; kind?: string }>; imports: string[]; sections?: SummarySections }

export function parseModelSummary(text: string): { summary: string; symbols: string[] }
export function leadingDoc(content: string): string | undefined
export function extractTodos(content: string, maxTodos?: number): string[]
export function extractPurpose(content: string, maxLength?: number): string | undefined
export function collectSymbols(lines: string[], rules: SymbolRule[]): { exports: SymbolInfo[]; locals: SymbolInfo[] }
export function collectImports(content: string, family: string): string[]
```

## Filter Utilities

```typescript
// summarizers/imports.ts
export function collectImports(content: string, family: string): string[]
export function collectImportsForFile(content: string, ext: string): string[]

// summarizers/symbols.ts
export function collectSymbols(lines: string[], rules: SymbolRule[]): { exports: SymbolInfo[]; locals: SymbolInfo[] }
export function getSymbolRules(ext: string): SymbolRule[]
export function collectSymbolsForFile(lines: string[], ext: string): { exports: SymbolInfo[]; locals: SymbolInfo[] }

// summarizers/doc-comments.ts
export function leadingDoc(content: string): string | undefined
export function extractTodos(content: string, maxTodos?: number): string[]
export function extractPurpose(content: string, maxLength?: number): string | undefined

// summarizers/utils.ts (re-exports)
export { extOf, familyOf, leadingDoc, collectSymbols, collectImports, dataSummary, codeSummary, parseModelSummary, extractTodos, extractPurpose }
```

## Language Registry

```typescript
// summarizers/languages/registry.ts
export interface LanguageRules {
  extensions: string[]
  symbolRules: SymbolRule[]
  importPatterns: ImportPattern[]
}

export class LanguageRuleRegistry {
  register(ext: string, rules: LanguageRules): void
  get(ext: string): LanguageRules
  getFamily(ext: string): string
}

export const languageRuleRegistry: LanguageRuleRegistry
```

## Metrics

```typescript
// metrics/index.ts
export interface MetricsCollector {
  recordWalk(fileCount: number, durationMs: number): void
  recordSummarize(durationMs: number, kind: SummarizerKind): void
  recordInjection(size: number, type: "full" | "digest"): void
  recordCacheHit(): void
  recordCacheMiss(): void
  recordError(type: string): void
  setCacheSize(size: number): void
}

export async function initializeMetrics(opts: Options): Promise<MetricsCollector | null>
export function getMetricsCollector(): MetricsCollector | null
export async function shutdownMetrics(): Promise<void>
```