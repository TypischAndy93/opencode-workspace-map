# Workspace Map Plugin — Next 100 Steps

**Project:** `opencode-workspace-map` v0.4.2  
**Branch:** `master`  
**Goal:** Complete remaining P3/P4 work from `TASKS.md` and prepare for release.

---

## Current State (as of this plan)

| Phase | Status |
|-------|--------|
| P0 — Quick Wins (Tasks 1–3) | ✅ Complete |
| P1 — Core Architecture (Tasks 4–6) | ✅ Complete |
| P2 — Performance & Reliability (Tasks 7–10) | ✅ Complete |
| P3 — Testing & Comprehensive Features (Tasks 11–14) | ⚠️ Partially started |
| P4 — Nice to Have (Tasks 15–17) | ❌ Not started |

**Uncommitted changes:** 21 modified files + 8 untracked files (all need to be committed before new work).

---

## Phase 1: Commit Current State & Verify Build (Steps 1–12)

1. Review `git diff` on all 21 modified files to confirm no unintended changes
2. Review the 8 untracked utility files (`src/interfaces.ts`, `src/utils/cancellation.ts`, `src/utils/errors.ts`, `src/utils/file.ts`, `src/utils/logger.ts`, `src/utils/retry.ts`, etc.) for correctness
3. Run `npm run build` (`tsc --noEmit`) to verify TypeScript compiles cleanly
4. Run `npm run typecheck` (`tsc --noEmit --strict`) for strict type checking
5. Run `npm test` (`bun test/run-tests.mjs`) to confirm existing unit test suite passes
6. Fix any typecheck/test failures found in steps 3–5
7. Run `npm run benchmark` to establish a performance baseline before further changes
8. `git add` all modified and untracked source files
9. Commit: `refactor: complete P0-P2 modularization and performance work`
10. Update `TASKS.md` current sprint table (confirm tasks 1–6 marked Done)
11. `git tag v0.4.3` to mark the committed baseline
12. Verify `git status` is clean

---

## Phase 2: P3 — Complete Unit Test Suite (Steps 13–32)

13. Add unit tests for `globToRegex` and `compileGitignore` in `test/unit/gitignore.test.ts` (negation rules, wildcard matching, anchor behavior)
14. Add unit tests for `detectProject` in new `test/unit/detect-project.test.ts` (monorepo vs single package, language detection, framework detection)
15. Add unit tests for `autoTuneOptions` in new `test/unit/auto-tune.test.ts` (option adjustments per project type)
16. Add unit tests for `buildInjectionRev` in `test/unit/injection-builder.test.ts` (rev changes when files/changed/cache change; stable when nothing changes)
17. Add unit tests for `renderTree` in `test/unit/injection-builder.test.ts` (tree rendering, depth truncation marker, changed-file annotation)
18. Add unit tests for `renderJson` in `test/unit/injection-builder.test.ts` (JSON structure, changed list, notes with updatedAt)
19. Add unit tests for cache invalidation (mtime/size change triggers re-summarize; unchanged file is cache hit)
20. Add unit tests for tree mutations (`addPathToMutableNode`, `removePathFromMutableNode`, `updateGeneratedStatusInMutableNode`)
21. Add unit tests for reverse deps consistency (adding imports updates reverse map; removing file cleans up reverse deps)
22. Add fast-check property-based test for `globToRegex` round-trip (pattern → regex → matches)
23. Add fast-check property-based test for `compileGitignore` (ignore/include precedence)
24. Add fast-check property-based test for summary length caps per extension
25. Add unit test for `PriorityQueue` priority ordering (changed > recent > warmup > background)
26. Add unit test for `PriorityQueue` concurrency limit (max N concurrent jobs)
27. Add unit test for `scheduleBatchWrite` / `flushPendingWrites` (accumulates, flushes on interval, flushes on shutdown)
28. Add unit test for LSP cache TTL (expired entries re-fetch; fresh entries hit cache)
29. Add unit test for `createFilterContext` (secret detection, generated detection, gitignore interaction)
30. Run full unit test suite; fix failures
31. `git add test/unit/*.test.ts` and commit: `test: complete P3 unit test suite`
32. Update `TASKS.md` Task 11 to Done

---

## Phase 3: P3 — Integration Tests (Steps 33–44)

33. Expand `test/integration.mjs` with a full walk → summarize → inject cycle test (fixture workspace, verify injection output contains tree + file notes)
34. Add integration test for monorepo with multiple packages (verify package-scoped storage keys don't collide)
35. Add integration test for watch mode file changes (modify a file, verify it gets re-summarized via watcher)
36. Add integration test for `refresh: true` picking up newly created files
37. Add integration test for digest vs full injection (first call full; second call digest when unchanged)
38. Add integration test for VCS-changed files annotated with `~` in injected tree
39. Add integration test for broad root guard (home directory disables injection but keeps tool)
40. Add integration test for `format: json` returning structured data with notes
41. Add integration test for `action: stats` returning version, locationKey, counters
42. Add integration test for binary/NUL-byte files getting binary marker
43. Run `npm run test:integration`; fix failures
44. Commit: `test: add P3 integration tests for walk/summarize/inject cycle`

---

## Phase 4: P3 — Symbol Navigation (Steps 45–59)

45. Add `action: "symbols"` to `WorkspaceMapInput` enum in `src/config/types.ts`
46. Implement `action: "symbols"` in `src/tool/index.ts` — scan cache symbols matching query, return list with file + kind
47. Add `action: "definition"` to `WorkspaceMapInput` enum
48. Implement `action: "definition"` — find symbol definition (requires LSP; fall back to outline symbol location; return "LSP required" hint if unavailable)
49. Add `action: "references"` to `WorkspaceMapInput` enum
50. Implement `action: "references"` — find files importing/referencing a symbol using reverseDeps + symbols index (requires LSP for precise refs; fall back to import-based)
51. Wire all three actions through `createWorkspaceMapTool` execute() with proper error handling
52. Add `lspSummarize` symbol metadata enrichment (store definition location per symbol) in `src/summarizers/lsp.ts`
53. Add symbol index in `src/injection-engine.ts` or `src/session-manager.ts` for fast symbol lookup across files
54. Add unit test for `action: "symbols"` filtering by name/kind
55. Add unit test for `action: "definition"` returning file:line for known symbols
56. Add unit test for `action: "references"` returning importer files
57. Add integration test exercising symbols → definition → references round-trip
58. Run unit + integration tests; fix failures
59. Commit: `feat: P3 symbol navigation (symbols/definition/references actions)`

---

## Phase 5: P3 — Dependency Graph Enhancements (Steps 60–74)

60. Add circular dependency detection using reverseDeps + imports (DFS cycle detection) in `src/injection/builder.ts` or new `src/dependency-graph.ts`
61. Add fan-in/fan-out metrics per file (number of importers, number of imports)
62. Add architectural layers grouping by directory depth in dependency graph output
63. Extend existing `action: "graph"` output in `src/tool/index.ts` with cycles, fan-in/fan-out, layers
64. Add `circularDependencies` field to graph output
65. Add `fanIn`/`fanOut` fields to graph nodes
66. Add `layer` field to graph nodes based on directory depth
67. Add unit test for circular dependency detection (A→B→C→A detected)
68. Add unit test for fan-in/fan-out calculation
69. Add unit test for layer assignment by directory depth
70. Add integration test for `action: "graph"` returning cycles + layers
71. Add CLI command `workspace-map:graph` to output dependency graph
72. Run unit + integration tests; fix failures
73. Commit: `feat: P3 dependency graph (cycles, fan-in/fan-out, layers)`
74. Update `TASKS.md` Tasks 12–14 to Done

---

## Phase 6: P4 — More Language Summarizers (Steps 75–81)

75. Add Dart/Flutter summarizer in `src/summarizers/languages/dart.ts` (classes, methods, imports, exports)
76. Add C# (Roslyn-style) summarizer in `src/summarizers/languages/csharp.ts` (classes, methods, namespaces, using directives)
77. Add Swift (SwiftSyntax-style) summarizer in `src/summarizers/languages/swift.ts` (structs, classes, funcs, imports)
78. Verify/register Rust summarizer in `src/summarizers/languages/registry.ts` (check `rust.ts` is complete and registered)
79. Register all new summarizers in `src/summarizers/languages/registry.ts` by extension
80. Add unit tests for each new language summarizer (symbol extraction, import parsing)
81. Run tests; commit: `feat: P4 language summarizers (Dart, C#, Swift, Rust registration)`

---

## Phase 7: P4 — Daemon Watch Mode (Steps 82–89)

82. Add `--daemon` flag to `workspace-map:watch` CLI command (daemonizes the watcher)
83. Add `--pid-file` option for process management (write PID, handle stale PID)
84. Implement daemonization (detach from parent, write pid file, handle signals)
85. Add "pause during agent execution" — integrate with session context hook to pause watcher while agent is actively working
86. Add resume logic after agent execution completes
87. Add unit tests for daemon start/stop, pid file lifecycle
88. Add integration test for pause/resume during agent execution
89. Commit: `feat: P4 daemon watch mode (--daemon, --pid-file, pause during agent execution)`

---

## Phase 8: P4 — Health Check & Profiling (Steps 90–96)

90. Add `action: "health"` to `WorkspaceMapInput` enum
91. Implement `action: "health"` — reports cache health, LSP status, walk duration, error rates, memory usage
92. Add `workspace-map:profile` CLI command (CPU/memory profiling of walk + summarize)
93. Add OpenTelemetry metrics export configuration (wire up exporter selection from existing config)
94. Add health check thresholds (cache hit rate, walk duration, error count) with warning/critical status
95. Add unit tests for health action output structure
96. Commit: `feat: P4 health check & profiling (action: health, workspace-map:profile, OTel export)`

---

## Phase 9: Release Prep & Docs (Steps 97–100)

97. Update `README.md` with new actions (symbols, definition, references, health), new CLI commands, and daemon options
98. Run `npm run release:dry-run` then `npm run release:minor` to bump version
99. Update `CHANGELOG.md` with all P3/P4 changes
100. Final `npm run build`, `npm test`, and `git status` clean check; announce completion

---

## Execution Notes

- Each step should be committed separately with a clear message per the `TASKS.md` convention.
- Run `npm run build` (or `npm test`) after each task to verify.
- Steps are ordered by dependencies (e.g., unit tests before integration tests; dependency graph needs reverse deps already wired; symbol navigation needs symbol index).
- If a step fails, fix it before proceeding to the next dependent step.