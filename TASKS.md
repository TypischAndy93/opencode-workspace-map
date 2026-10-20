# Workspace Map Plugin - Implementation Task List

## Priority Matrix
| Priority | Effort | Impact | Description |
|----------|--------|--------|-------------|
| **P0** | Low | High | Quick wins with high value |
| **P1** | Medium | High | Core architectural improvements |
| **P2** | Medium | Medium | Performance & reliability |
| **P3** | High | High | Testing & comprehensive features |
| **P4** | High | Medium | Nice-to-have enhancements |

---

## ✅ P0 - Quick Wins (Start Here)

### 1. Fix modelSummaries Conflation
- [x] Separate `modelSummaries` and `lspSummaries` counters in `Stats` type
- [x] Update all increment sites in `index.ts` and `cli/index.ts`
- [x] Update cost tracking to distinguish model vs LSP

### 2. Structured JSON Logging
- [x] Add `logFormat` option (text/json)
- [x] Replace `console.error` calls with structured logging when `opts.debug`
- [x] Add `logFormat` to config

### 3. Config Wizard CLI Command
- [x] Add `workspace-map:init` command
- [x] Interactive prompts for key options
- [x] Write `.opencode/workspace-map.json` sidecar config

---

## 🏗️ P1 - Core Architecture (High Impact)

### 4. Split index.ts into Modules
- [x] `src/setup.ts` - Plugin initialization, option merging, validation
- [x] `src/injection-engine.ts` - `getInjection`, `listFiles`, tree caching
- [x] `src/summarization-engine.ts` - `summarize`, `summarizeMany`, fallback chains
- [x] `src/session-manager.ts` - Session tracking, recent files, injection state
- [x] `src/vcs-integration.ts` - Changed files, git detection
- [x] `src/hooks.ts` - Tool hooks (`refreshOnWrite`, `session.context`)
- [x] Update `index.ts` to compose modules

### 5. PluginContext for Parameter Drilling
- [x] Define `PluginContext` interface with all shared state
- [x] Refactor `createWorkspaceMapTool` to accept `ctx: PluginContext`
- [x] Remove 10+ parameter lists

### 6. Priority Queue for Summarization
- [x] Create `PriorityQueue` class with priority levels (changed > recent > warmup > background)
- [x] Integrate into `summarizeMany`
- [x] Add `priority` field to summarization jobs

---

## ⚡ P2 - Performance & Reliability

### 7. LSP Response Caching
- [x] Add `lspCache: Map<string, { symbols, imports, at }>` in summarization engine
- [x] Cache key: file path + mtime + size
- [x] TTL configurable via `opts.lspCacheTtlMs`

### 8. Batch Storage Writes
- [x] Accumulate pending cache writes in memory
- [x] Flush interval via `opts.cacheFlushIntervalMs` (default 5s)
- [x] Flush on shutdown

### 9. Adaptive Walk Concurrency
- [x] Monitor walk duration vs file count
- [x] Increase/decrease `walkConcurrency` dynamically
- [x] Expose metrics for tuning

### 10. Generated File Heuristics
- [x] Detect minified files (single line > 500 chars)
- [x] Detect license headers (SPDX, MIT, Apache)
- [x] Detect build outputs via `package.json` `outDir`/`dist`

---

## 🧪 P3 - Testing & Comprehensive Features

### 11. Unit Test Suite
- [x] `globToRegex`, `compileGitignore`, `detectProject`, `autoTuneOptions`
- [x] `buildInjectionRev`, `renderTree`, `renderJson`
- [x] Cache invalidation, tree mutations, reverse deps consistency

### 12. Integration Tests
- [x] Full walk → summarize → inject cycle
- [x] Monorepo with multiple packages
- [x] Watch mode file changes

### 13. Symbol Navigation
- [x] `action: "symbols"` - list all symbols matching query
- [x] `action: "definition"` - find definition (requires LSP)
- [x] `action: "references"` - find references (requires LSP)

### 14. Dependency Graph Enhancements
- [x] Circular dependency detection
- [x] Fan-in/fan-out metrics per file
- [x] Architectural layers (group by directory depth)

---

## 🎯 P4 - Nice to Have

### 15. More Language Summarizers
- [x] Dart/Flutter (via swift-dart.ts with Dart-specific rules)
- [x] C# (Roslyn) (csharp.ts)
- [x] Swift (SwiftSyntax) (via swift-dart.ts)
- [x] Rust (syn) (rust.ts, already registered)

### 16. Daemon Watch Mode
- [x] `--daemon` flag for `workspace-map:watch`
- [x] `--pid-file` for process management
- [x] Pause during agent execution

### 17. Health Check & Profiling
- [ ] `action: "health"` tool endpoint
- [ ] `workspace-map:profile` command (CPU/memory)
- [ ] OpenTelemetry metrics export config

---

## 📋 Current Sprint (Start with these)

| # | Task | Estimate | Status |
|---|------|----------|--------|
| 1 | Fix modelSummaries conflation | 30 min | ✅ Done |
| 2 | Structured JSON logging | 1 hour | ✅ Done |
| 3 | Config wizard CLI | 1.5 hours | ✅ Done |
| 4 | Split index.ts modules | 3 hours | ✅ Done |
| 5 | PluginContext for parameter drilling | 2 hours | ✅ Done |
| 6 | Priority queue for summarization | 2 hours | ✅ Done |

**Total estimated: ~10 hours**

---

## Notes
- Tasks are ordered by dependencies (e.g., split modules before PluginContext)
- Each task should be committed separately with clear messages
- Run `npm run build` (or equivalent) after each task to verify
- Update this file as tasks are completed