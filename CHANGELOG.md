# Changelog

## [0.5.0] - 2026-10-20

### ✨ Features
  - feat: P4 health check and profiling (9e8877e)
  - feat: P4 daemon watch mode (d20450a)
  - feat: P4 language summarizers (C#, Dart enhancements) (f83ffeb)
  - feat: P3 dependency graph (f08dbba)
  - feat: P3 symbol navigation (4781147)
  - feat: add adaptive walk concurrency (Task 9) (9cab33b)
  - feat: add generated file heuristics (Task 10) (bd26d9a)
  - feat: add LSP response caching and batch storage writes (Tasks 7, 8) (15825f0)
  - feat: add PriorityQueue for summarization (Task 6) (9b5d7a6)
  - feat: add workspace-map:init interactive configuration wizard (3f05f91)
  - feat: add structured JSON logging with logFormat option (8d8994a)
  - feat: enhance watch mode with polling fallback and file deletion detection (a6d3a48)
  - feat: add workspace-map:export and workspace-map:import CLI commands (1f070ba)
  - feat: cost tracking for model summarization (21233bc)
  - feat: incremental tree updates for watch mode (113dab9)

### 🐛 Fixes
  - fix: separate modelSummaries and lspSummaries counters in Stats (f1aaed4)

### ♻️ Refactoring
  - refactor: complete P0-P2 modularization and performance work (26746bc)
  - refactor: implement PluginContext for parameter drilling (Task 5) (fdcd784)
  - refactor: split index.ts into modular components (9c6d410)

### 📚 Documentation
  - docs: mark Task 16 (daemon watch mode) as complete (6d473f5)
  - docs: mark Task 15 (language summarizers) as complete (5d00132)
  - docs: mark Task 14 (dependency graph) as complete (2a60330)
  - docs: mark Task 12 (integration tests) as complete (17a60ad)
  - docs: mark Task 11 (unit test suite) as complete (a2e7f3a)
  - docs: update TASKS.md - mark Task 5 complete (6e985fd)
  - docs: update TASKS.md with completed tasks (a280a69)
  - docs: add VitePress documentation site (83b4677)

### ✅ Tests
  - test: add P3 integration test for watch mode (ccf13fa)
  - test: complete P3 unit test suite (d1c5cd4)
  - test: add unit tests for injection builder and render modules (Task 11) (ca568ee)
  - test: fix flaky isSecret property test (75122e9)
  - test: add 26 property-based tests for VCS and monorepo detection (1a85c95)
  - test: add 38 property-based tests for summarizers (f431339)

### 🔧 Chores
  - chore: remove dead VCS integration wiring (542ff13)
  - P3: single-source the version, remove debug noise, fix docs and CI (fea8817)
  - P2: fix ignore-list wiring, dirtyFlushes, and batched cache staleness (1434d2d)
  - Unify workspace watching into a single WatchManager (c960c92)
  - chore: stop tracking node_modules, lockfiles, and .cortexkit (4c5bf01)
  - chore: sync workspace changes before refactoring (231de0a)
  - chore: release v0.4.2 (2de3012)
  - ci: add GitHub Actions CI/CD pipeline (289ec2c)
  - benchmarks: add fixtures for 5 more languages (Java, C#, PHP, Ruby, Swift, Dart) (561d5c4)
  - chore: release v0.4.1 (8061957)
  - chore: initial commit - workspace-map v0.4.0 (de06603)


## [0.4.2] - 2026-10-11

### ✨ Features
  - feat: enhance watch mode with polling fallback and file deletion detection (a6d3a48)
  - feat: add workspace-map:export and workspace-map:import CLI commands (1f070ba)
  - feat: cost tracking for model summarization (21233bc)
  - feat: incremental tree updates for watch mode (113dab9)

### ✅ Tests
  - test: fix flaky isSecret property test (75122e9)
  - test: add 26 property-based tests for VCS and monorepo detection (1a85c95)
  - test: add 38 property-based tests for summarizers (f431339)

### 🔧 Chores
  - benchmarks: add fixtures for 5 more languages (Java, C#, PHP, Ruby, Swift, Dart) (561d5c4)
  - chore: release v0.4.1 (8061957)
  - chore: initial commit - workspace-map v0.4.0 (de06603)


## [0.4.1] - 2026-10-11

### 🔧 Chores
  - chore: initial commit - workspace-map v0.4.0 (de06603)


All notable changes to this project will be documented in this file.

