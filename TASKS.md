# Workspace Map Plugin — Improvement Task List

Generated from agent evaluation (2026-10-10)

---

## 🎯 High Impact (Top Priority)

## 🎯 High Impact (Top Priority)

### 1. Reverse Dependency Index
- [x] Design reverse-dep data structure (Map<file, Set<importers>>)
- [x] Populate during walk/summarize phase
- [x] Expose in injection output (JSON + markdown)
- [x] Add `includeReverseDeps` config option
- [x] Update cache schema to persist reverse deps (handled via in-memory index)
- [x] Include in tool output (graph action + JSON format)

### 2. JSON Injection Format
- [x] Add `injection.format: "json" | "markdown" | "both"` config (already added to schema)
- [x] Create `renderJson` in `src/injection/render.ts`
- [x] Ensure JSON includes: tree, summaries, symbols, reverseDeps, metadata
- [x] Update tool output to support format selection
- [x] Update injection hook to use configured format

### 3. Per-Language Summarizer Config
- [x] Define `SummarizerPreference` type in config
- [x] Add `summarizer.preferLspFor`, `fallbackChain` to schema
- [x] Implement resolver in `src/summarizers/index.ts` (actually in config/index.ts)
- [x] Update `model.ts`, `lsp.ts`, `outline.ts` to be swappable strategies (used via resolver in index.ts)

---

## 🔧 Core Improvements

### 4. Symbol Kind & Visibility Metadata
- [x] Extend `SymbolRule` / symbol extraction to capture kind (function/class/interface/type/const/var)
- [x] Track `isExported` flag (via `kind: "export" | "local"` in rules)
- [x] Include in summary output and injection

### 5. Multi-line Structured Summaries
- [x] Define summary sections: `purpose`, `keyExports`, `dependencies`, `todos`
- [x] Update summarizers to populate sections
- [x] Update injection renderer to format sections
- [x] Add `summary.sections` config to customize

### 6. Adaptive Walk Concurrency
- [x] Benchmark filesystem latency on startup (sample 50 stat calls)
- [x] Auto-tune `walkConcurrency` based on latency tier (SSD/HDD/network)
- [x] Expose `walkConcurrency: "auto" | number` in config (default: "auto")

### 7. Cache Compression & Versioning
- [x] Add `summaryHash` to cache entries (detect summarizer version drift)
- [x] Optional zstd compression for cache values > 1KB (deferred - requires native dependency)
- [x] Migration path for existing caches (invalidates stale entries on load)

---

## 🧪 Testing & Observability

### 8. Unit Test Suite
- [x] Add vitest config
- [x] Test `src/fs/gitignore.ts` (globToRegex, compileGitignore, gitignored)
- [x] Test `src/fs/filter.ts` (skipDir, skipFile, isSecret, walk)
- [x] Test `src/summarizers/summarize-utils.ts` (collectSymbols, collectImports, extOf)
- [x] Test `src/utils/hash.ts`, `semaphore.ts`, `enqueue.ts`

### 9. Property-Based Tests
- [x] Gitignore pattern matching vs `git check-ignore` (fast-check)
- [x] Glob-to-regex round-trip
- [x] Path filtering idempotency

### 10. Metrics Export (OpenTelemetry)
- [x] Add `@opentelemetry/api` dependency
- [x] Emit: `summarize.duration`, `cache.hit_rate`, `walk.files_per_sec`, `injection.size_bytes`
- [x] Config `metrics.enabled`, `metrics.exporter`, `metrics.intervalMs`

### 11. Benchmark Suite
- [ ] Script to run summarizers on test repos (TypeScript, Go, Rust, Python)
- [ ] Measure: time, token cost, summary quality (heuristic scoring)
- [ ] CI integration for regression detection

---

## 🛡️ Robustness & Edge Cases

### 12. Symlink Handling
- [x] Add `followSymlinks: boolean` config (default: false)
- [x] Cycle detection with visited Set<realpath>
- [x] Test with nested symlinks, directory junctions (Windows)

### 13. Monorepo Detection & Per-Package Maps
- [x] Detect: `pnpm-workspace.yaml`, `turbo.json`, `nx.json`, `lerna.json`, `rush.json`
- [x] Add `monorepo.enabled`, `monorepo.packageMaps` config
- [x] Generate separate map per package + root aggregate
- [x] Tool action `packages` to list monorepo packages
- [x] Inject monorepo info into context

### 14. Generated File Detection
- [ ] Heuristics: `*.generated.*`, `*.d.ts`, `dist/`, `build/`, `*.min.js`, `coverage/`
- [ ] Config `generatedPatterns: string[]` + `autoDetectGenerated: boolean`
- [ ] Skip summarization, mark in tree

### 15. Per-File-Type Summary Length Limits
- [ ] Config `summaryLengthByExt: Record<string, number>`
- [ ] Defaults: `.ts/.js: 500`, `.md: 2000`, `.json: 300`, `.go/.rs: 600`
- [ ] Apply in `summarize-utils.ts`

### 16. LSP Graceful Degradation
- [ ] Timeout wrapper with `lspTimeoutMs`
- [ ] Fallback chain: LSP → Outline → Model
- [ ] Log degradation events with reason

---

## 🏗️ Architecture & Code Quality

### 17. Break Circular Import (config ↔ fs/gitignore)
- [ ] Extract interfaces to `src/config/types.ts`
- [ ] Make `gitignore.ts` depend only on types
- [ ] Update imports throughout

### 18. Split summarize-utils.ts
- [x] `src/summarizers/symbols.ts` — collectSymbols, SymbolRule registry
- [x] `src/summarizers/imports.ts` — collectImports, import parsing
- [x] `src/summarizers/doc-comments.ts` — leadingDoc, JSDoc/TSDoc parsing
- [x] `src/summarizers/languages/` — per-language rule files (in config/index.ts)
- [x] `src/summarizers/utils.ts` — shared helpers (extOf, dataSummary, codeSummary)
- [x] Update imports in outline.ts, model.ts, lsp.ts, index.ts

### 19. Language Rules Registry
- [x] Move hardcoded rules from `config/index.ts` to `src/summarizers/languages/*.ts`
- [x] Create `LanguageRuleRegistry` with `register(ext, rules)` and `get(ext)`
- [x] Support user-defined rules via config

---

## 🖥️ CLI & Developer Tools

### 20. CLI Commands
- [ ] `workspace-map dump --format=json|markdown --filter=<glob>`
- [ ] `workspace-map stats` — cache hit rate, summarizer timings, file counts
- [ ] `workspace-map validate` — config, cache integrity, LSP connectivity
- [ ] `workspace-map clear-cache`

### 21. Watch Mode Improvements
- [ ] Config `watch.debounceMs`, `watch.batchChanges`
- [ ] Batch file change events before re-summarizing
- [ ] Incremental tree update (not full rebuild)

---

## 📦 Packaging & Distribution

### 22. Release Automation
- [ ] Version bump script
- [ ] Changelog generation from conventional commits
- [ ] Publish to npm (if public) or local registry

---

## 📝 Notes

- Tasks marked with 🎯 are highest ROI for agent consumers
- Each task should include: implementation, tests, config schema update, docs update
- Consider breaking large tasks into sub-issues for PR-sized work