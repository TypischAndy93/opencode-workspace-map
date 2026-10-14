# workspace-map

[![CI](https://github.com/TypischAndy93/opencode-workspace-map/workflows/CI/badge.svg)](https://github.com/TypischAndy93/opencode-workspace-map/actions/workflows/ci.yml)
[![Release](https://github.com/TypischAndy93/opencode-workspace-map/workflows/Release/badge.svg)](https://github.com/TypischAndy93/opencode-workspace-map/actions/workflows/release.yml)
[![npm version](https://badge.fury.io/js/opencode-workspace-map.svg)](https://www.npmjs.com/package/opencode-workspace-map)

An OpenCode plugin that keeps a live, cached map of the workspace — a directory
tree plus per-file summaries — so the agent has structural awareness of
multi-file repositories.

## How it works

```mermaid
flowchart TD
    subgraph "Editor / User Actions"
        A[Write/Edit Tools] --> B[tool.execute.before Hook]
        A --> C[tool.execute.after Hook]
    end

    subgraph "Edit Tracking"
        B --> D[Mark Files Dirty]
        D --> E[Debounce (debounceMs)]
        E --> F[Batch Dirty Files]
        F --> G[summarizeMany]
        C --> H[Record Recent Files]
        H --> I[Per-Session & Global Recency]
    end

    subgraph "Summarization Pipeline"
        G --> J{Summarizer Mode}
        J -->|outline| K[Outline Summarizer<br/>Zero model cost]
        J -->|model| L[Model Summarizer<br/>ctx.generate.text<br/>Background, non-blocking]
        J -->|lsp| M[LSP Summarizer<br/>ctx.lsp<br/>Graceful fallback to outline]
        K --> N[Extract: Symbols, Imports, Keys]
        L --> N
        M --> N
    end

    subgraph "Storage & Cache"
        N --> O[FileEntry Cache (Map)]
        O --> P[Plugin Storage<br/>Scoped per location]
        P --> Q[Persistence Across Restarts]
    end

    subgraph "Injection to Session Context"
        R[session.context Hook] --> S{injectStrategy}
        S -->|first| T[Full map once per session]
        S -->|changed| U{Map Changed?}
        S -->|always| V[Full map every request]
        U -->|Yes| V
        U -->|No| W[Short Digest<br/>Names changed files]
        V --> X[Build Full Mapping]
        W --> Y[Build Digest]
        X --> Z[Inject into System Prompt]
        Y --> Z
    end

    subgraph "On-Demand Tool Access"
        AA[workspace_map Tool] --> AB{Action}
        AB -->|map| AC[Render Tree + Notes]
        AB -->|json| AD[Structured Data + changed[]]
        AB -->|stats| AE[Live Counters & Metadata]
        AB -->|export| AF[Streaming JSONL Export]
        AB -->|graph| AG[Dependency Graph]
    end

    classDef hook fill:#e1f5fe,stroke:#01579b;
    classDef cache fill:#f3e5f5,stroke:#4a148c;
    classDef inject fill:#e8f5e9,stroke:#1b5e20;
    classDef tool fill:#fff3e0,stroke:#e65100;
    class B,C,R,AA hook;
    class O,P,Q cache;
    class X,Y,Z inject;
    class AB,AC,AD,AE,AF,AG tool;
```

1. **Track edits.** Hooks `tool.execute.before` / `tool.execute.after` for the
   write/edit tools. Touched files are marked dirty, debounced, and re-summarized
   in the background. Unchanged files (same size + mtime) are never re-read.
2. **Summarize.** By default a deterministic, language-aware *outline* is
   produced with zero model cost: exported symbols, imports, and structured keys
   for JSON/YAML/TOML/INI/Markdown. Set `summarizer` to `"model"` to have a model
   write a short prose summary instead.
3. **Persist.** Summaries are stored in plugin storage, **scoped per location**,
   so different projects never collide or prune each other. Cache survives
   restarts.
4. **Inject.** The `session.context` hook appends a map to the model request. By
   default it sends the full map only when it changed, and a one-line digest
   otherwise, keeping per-turn overhead low. VCS-changed files are marked with
   `~` in the tree, and digests name the files that changed.
5. **Drill down.** A `workspace_map` tool returns the full tree and per-file
   summaries on demand, so deep detail doesn't cost context tokens every turn.

## Safety

Crawling is conservative by default:

- Dot-directories are skipped except an allowlist (`.github`, `.opencode`,
  `.vscode`, `.devcontainer`, `.gitlab`).
- Secret-like files are skipped (`.env*`, `*.pem`, `*.key`, `id_rsa*`,
  `credentials*.json`, `secrets*`, ...), and model summaries never run on them.
- Lockfiles (`package-lock.json`, `yarn.lock`, `go.sum`, ...), minified files,
  and known binary extensions are skipped.
- `.gitignore` is honored (root-level; `respectGitignore: false` to disable).
- Generic names like `bin`, `tmp`, `temp`, `cache` are only skipped at the
  repository root, so nested source subtrees (`src/bin`, `app/cache`) stay
  indexed. Everything else in the built-in list is skipped at any depth.
- Broad roots (your home directory or a filesystem root) disable warmup and
  injection automatically; use the tool on demand instead. Override with
  `allowBroadRoot: true`.

## Configuration

Options are read from `config.json` beside this plugin, then overridden by the
object form of the `plugins` entry in `opencode.json` (if present):

```jsonc
{
  "plugins": [
    { "package": "./plugins/workspace-map", "options": { "inject": "full" } }
  ]
}
```

| Option | Default | Description |
| --- | --- | --- |
| `enabled` | `true` | Master switch. |
| `inject` | `"changed"` | `"off"` \| `"tree"` \| `"changed"` \| `"full"` — how much to inject. |
| `injectStrategy` | `"changed"` | `"first"` (once per session) \| `"changed"` (full when the map changes, else digest) \| `"always"` (full every request). |
| `summarizer` | `"outline"` | `"outline"` (no model) or `"model"` (uses `ctx.generate.text`). |
| `summaryModel` | unset | Model ref `{ providerID, id }` for `"model"`; defaults to the session default model. |
| `registerTool` | `true` | Register the on-demand `workspace_map` tool. |
| `refreshOnWrite` | `true` | Re-summarize files changed by write/edit tools. |
| `respectGitignore` | `true` | Honor the root `.gitignore`. |
| `allowBroadRoot` | `false` | Allow warmup/injection even for home/filesystem roots. |
| `debounceMs` | `50` | Debounce before re-summarizing after an edit. |
| `treeTtlMs` | `10000` | How long a directory scan is cached. |
| `treeDepth` | `3` | Max depth rendered in the tree. |
| `maxTreeEntries` | `200` | Max entries rendered in the tree. |
| `maxInjectedChars` | `12000` | Hard cap on injected characters. |
| `maxSummaries` | `50` | Max file notes included/returned. |
| `maxFiles` | `3000` | Max files walked before stopping. |
| `maxFileBytes` | `500000` | Files larger than this are listed but not summarized. |
| `maxFileBytesByExt` | `{}` | Per-extension overrides (e.g., `{".min.js": 2097152}` for larger generated files). |
| `warmupSummaries` | `20` | Files summarized in the background at startup. |
| `ignore` | common dirs | Extra directory/file names or glob patterns to skip at any depth (appended to built-in). |
| `ignoreExtra` | `[]` | Additional directory/file names or glob patterns to skip at any depth. |
| `include` | `[]` | Glob patterns to force-include files that would otherwise be skipped. |
| `walkConcurrency` | `"auto"` | Max concurrent directory walks (`"auto"` = derived from CPU count, or a number). |
| `summarizeConcurrency` | `4` | Max concurrent file summarizations. |
| `summaryLength` | `"medium"` | Model summary length: `"short"` (1 sentence), `"medium"` (2-3), `"long"` (4-5). |
| `autoTune` | `true` | Auto-detect project type (monorepo, language, framework) and tune options. |
| `exportJsonl` | `false` | Enable JSONL export of summaries via `workspace_map` tool (`action: "export"`). |
| `exportJsonlPath` | `.opencode/workspace-map.jsonl` | Output path for JSONL export (relative to workspace root). |
| `lspTimeoutMs` | `10000` | LSP request timeout in milliseconds. |
| `lspMaxSymbols` | `500` | Max symbols to fetch from LSP per file. |
| `indexDotDirs` | `[".github", ".opencode", ".vscode", ".devcontainer", ".gitlab"]` | Dot-directories to index (override allowlist). |
| `watchEnabled` | `true` | Enable fs.watch-based real-time updates (complements `refreshOnWrite`). |
| `debug` | `false` | Log to stderr. |

## Cost notes

- `summarizer: "outline"` costs nothing but disk reads.
- `summarizer: "model"` issues one `generate.text` call per changed file, run in
  the background after an edit — it never blocks the request hook (the injected
  map may briefly show "(indexing…)" for model-summarized files). Set
  `inject: "tree"` to skip summarization entirely at zero model cost. Point
  `summaryModel` at a small/cheap model.
- `summarizer: "lsp"` uses the Language Server Protocol via `ctx.lsp` for
  accurate symbols and imports — zero model cost, but requires an LSP server
  to be running. Set `lspTimeoutMs` and `lspMaxSymbols` to tune.
- `injectStrategy: "changed"` (default) resends the full map only when files
  change; otherwise it emits a short digest that names the changed files. Lower
  `maxInjectedChars` / `maxSummaries`, or set `inject: "tree"` /
  `injectStrategy: "first"`, to trim further.
- In git repositories, injection re-walks the tree only on real change signals
  (VCS status or tracked edits), so steady-state turns skip the directory scan
  entirely. Non-git roots re-scan at most every `treeTtlMs`.
- Invalid values for `inject`, `injectStrategy`, or `summarizer` are rejected at
  startup: a warning is logged (with `debug: true`) and the default is used, so
  a typo can't silently change behavior.

## Tool

`workspace_map` accepts:

- `path` — limit to a file or directory (relative to the workspace root).
- `query` — only files whose path, summary, or **symbols** contain this text.
- `refresh` — force a fresh scan and re-summarize all matches.
- `limit` — cap the number of matching files returned (and summarized on
  `refresh`).
- `format` — `"map"` (default, markdown) or `"json"` (structured tree + notes).
- `action` — `"map"` (default), `"stats"` (version, scope, and live counters:
  `cachedEntries`, `summaries`, `outlineSummaries`, `modelSummaries`,
  `skippedSummaries`, `skippedByRule`, `walks`, `lastWalkMs`, `dirtyFlushes`,
  `sessions`, `files`, `fullInjections`, `digestInjections`), `"export"` (write
  JSONL summaries to file), or `"graph"` (dependency graph as JSON).
- `format: "json"` output includes `changed` (VCS-changed files) and per-note
  `updatedAt`.

`action: "graph"` returns a JSON object with:
- `nodes` — array of `{ id, imports[], importedBy[] }` for each file
- `edges` — array of `{ from, to }` representing import relationships

## CLI Commands

The plugin registers the following CLI commands (available via `opencode` command palette or slash commands):

- **`workspace-map:dump`** — Output the full workspace map (tree + summaries) to stdout.
  - `--format tree|json` — Output format (default: tree)
  - `--limit N` — Maximum number of files to include
  - `--query STRING` — Filter files by query string

```bash
opencode workspace-map:dump --format json --limit 20
opencode workspace-map:dump --query "src/"
```

- **`workspace-map:stats`** — Show workspace map cache and summary statistics.
  - `--format text|json` — Output format (default: text)

```bash
opencode workspace-map:stats
opencode workspace-map:stats --format json
```

- **`workspace-map:validate`** — Validate workspace map configuration and environment.
  - `--verbose` — Show detailed validation info

```bash
opencode workspace-map:validate
opencode workspace-map:validate --verbose
```

- **`workspace-map:clear-cache`** — Clear the workspace map cache (forces full re-index on next injection).
  - `--confirm=true` — Required confirmation flag

```bash
opencode workspace-map:clear-cache --confirm=true
```

- **`workspace-map:watch`** — Watch workspace for file changes and update summaries in real-time. Runs until interrupted with Ctrl+C.

```bash
opencode workspace-map:watch --debounce-ms 500 --pattern "src/**/*.ts" --once
```

This command uses `fs.watch` to monitor the workspace root for file changes and automatically re-summarizes modified files.

Editor validation: the options schema lives in `config.schema.json` next to the
plugin.

## Changelog

### 0.4.0

- **Model summarizer never blocks the request hook.** Note refresh is awaited
  only in `outline` mode; `"model"` summaries are enqueued in the background.
  `inject: "tree"` never summarizes at all (zero model cost).
- **Change-aware output:** VCS-changed files are marked with `~` in the injected
  tree, and digests name the files that changed (with short summaries when
  cached).
- **Option validation:** typos in `inject` / `injectStrategy` / `summarizer`
  log a warning and fall back to the default instead of silently degrading.
  Invalid values now fall back to `"changed"` (was `"first"` for injectStrategy).
- **Defaults changed:** `injectStrategy` now defaults to `"changed"` (was
  `"first"`), and `inject` defaults to `"changed"` (was `"tree"`). This means
  the full map with file notes is shown on changes, with a digest when unchanged.
- **CLI Commands:** Added `workspace-map:dump`, `workspace-map:stats`,
  `workspace-map:validate`, and `workspace-map:clear-cache` commands
  (in addition to existing `workspace-map:watch`).
- **Circular dependency fix:** Extracted shared constants to `shared.ts`,
  breaking the config ↔ fs/gitignore import cycle.
- **Module resolution:** All imports use `.ts` extensions; tsconfig updated to
  `NodeNext` with `allowImportingTsExtensions`.
- **Fixed:** the lazy-walk optimization no longer produces a bogus rev on the
  first injection after startup/edits (a redundant second full map is avoided).
- **Honest truncation:** depth-limited trees render `… (tree depth limited)` and
  `treeDepth` defaults to `5`; vanished files are pruned from the cache on
  non-forced walks too, so `cachedEntries` tracks reality.
- **Binary files** that slip past the extension list now get a `binary content`
  marker instead of showing "(not indexed yet)".
- **Observability:** stats add `outlineSummaries`, `modelSummaries`,
  `skippedSummaries`, and `lastWalkMs`; `format: "json"` adds `changed` and
  per-note `updatedAt`; the tool description documents `limit`/`format`/
  `refresh`/`action`.
- **Tests:** suite grown to 34 assertions covering all of the above
  (model-hook, rev guard, option fallback, markers, digests, depth truncation,
  opportunistic prune, binary marker, JSON enrichment).

### 0.3.0

- **Reliable edit tracking:** multi-file edits (`input.files` / `edits` arrays,
  `apply_patch` diffs) all get marked dirty; injected notes are refreshed
  synchronously so the map never shows "(indexing…)" after a change.
- **Cheaper steady-state injection:** git repos skip the directory re-walk when
  VCS status and the dirty set show no change; default scan TTL raised to 15s.
- **Quality:** deterministic (sorted) file ordering → stable revs; per-family
  symbol rules for shell/SQL/C-family/PHP/Ruby/Swift/Dart/Lua; generic `bin`/
  `tmp`/`temp`/`cache` are skipped only at the root.
- **Observability:** stats now include `walks`, `skippedByRule`, `dirtyFlushes`,
  `sessions`, and `files`; session/injection state is capped; cache entries are
  validated on load.
- **Tool:** `limit` parameter, `format: "json"`, and `refresh: true` summarizes
  all matches (capped at 2000).
- **Committed test suite:** `bun test` runs 24 assertions against the real SDK
  with a mocked context and throwaway fixture workspace.

### 0.2.0

- **Scoped storage per location**; legacy unscoped entries are migrated away.
  Fixes cross-project cache collisions and mutual pruning.
- **Safe default crawling:** dot-dir allowlist, secret-file detection, lockfile
  and minified-file skipping, optional `.gitignore` support, broad-root guard.
- **Richer summaries:** exported symbols, imports, and structured keys for
  JSON/YAML/TOML/INI/Markdown. Exports separated from local definitions.
- **Cheaper injection:** `injectStrategy` (`first`/`changed`/`always`); full map
  only when it changes, otherwise a short digest. Per-session edit tracking.
- **Reliability:** fixed dirty-flush dropping all but the last edited file;
  removed the shared-`pending` race; cached model ref and VCS status.
- **Observability:** `workspace_map action:"stats"` and a version string.

### 0.1.0

- Initial release.
