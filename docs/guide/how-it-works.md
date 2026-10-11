# How It Works

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        OpenCode Session                           │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌──────────────────┐    ┌────────────────┐  │
│  │ Write/Edit  │───▶│  Mark Dirty      │───▶│  Debounce &    │  │
│  │    Tools    │    │   Files          │    │  Batch Changes │  │
│  └─────────────┘    └──────────────────┘    └───────┬────────┘  │
│                                                     │           │
│  ┌─────────────┐    ┌──────────────────┐          ▼           │
│  │   Session   │◀───│  Summarization   │◀───┬────────────────┐  │
│  │   Context   │    │   Pipeline       │    │                │  │
│  └─────────────┘    └──────────────────┘    │                │  │
│                        ▲                    │                │  │
│                        │                    ▼                │  │
│  ┌─────────────────────┴────────────────────────────────────┐  │
│  │              Summarization Pipeline                        │  │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────┐   │  │
│  │  │ Outline │  │ Model   │  │ LSP     │  │ Fallback    │   │  │
│  │  │ (fast)  │  │ (AI)    │  │ (exact) │  │ Chain       │   │  │
│  │  └────┬────┘  └────┬────┘  └────┬────┘  └──────┬──────┘   │  │
│  │       │            │            │            │            │  │
│  │       ▼            ▼            ▼            ▼            │  │
│  │  ┌─────────────────────────────────────────────────────┐   │  │
│  │  │          FileEntry Cache (Map)                      │   │  │
│  │  │  - Summary                                          │   │  │
│  │  │  - Symbols (exports, classes, functions)           │   │  │
│  │  │  - Imports                                          │   │  │
│  │  │  - Sections (purpose, exports, deps, todos)        │   │  │
│  │  │  - Metadata (size, mtime, kind, tokens)            │   │  │
│  │  └─────────────────────────────────────────────────────┘   │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │              Injection System                               │  │
│  │  • Strategies: first, changed, always                      │  │
│  │  • Formats: Markdown, JSON, both                            │  │
│  │  • Tree + File Notes + Reverse Dependencies                │  │
│  └────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## File Discovery

1. **Walk** - Recursive directory walk with filtering
2. **Filter** - Skip ignored, hidden, binary, secret, generated files
3. **Sort** - Deterministic ordering for reproducible results
4. **Cache** - Store in Plugin Storage (scoped per workspace)

## Summarization Pipeline

### 1. Outline Summarizer (Default, Zero Cost)
- Regex-based symbol extraction per language
- Import/dependency parsing
- JSDoc/TSDoc leading comment extraction
- Structured sections: purpose, exports, dependencies, todos
- **Cost: Zero model tokens**

### 2. Model Summarizer (AI-Powered)
- Sends file content to LLM via `ctx.generate.text`
- Configurable length: short/medium/long
- Extracts purpose, key exports, dependencies
- **Cost: Model tokens (tracked if enabled)**

### 3. LSP Summarizer (Precise)
- Uses `ctx.lsp` for document symbols
- Exact symbol positions and kinds
- Language server protocol integration
- **Cost: Zero model tokens**

### Fallback Chain
```
Preferred → Next → Next → Outline (always succeeds)
```

## Caching

### FileEntry Cache
```typescript
interface FileEntry {
  rel: string
  size: number
  mtimeMs: number
  summary: string
  symbols: SymbolInfo[]
  imports: string[]
  kind: "outline" | "model" | "lsp" | "skipped" | "generated"
  updatedAt: number
  sections?: SummarySections
}
```

### Storage
- **Plugin Storage** - Scoped per workspace location
- **Compression** - zstd for large entries
- **Versioning** - Cache version with migration
- **Pruning** - Removes entries for deleted files

## Injection System

### Strategies

| Strategy | Behavior |
|----------|----------|
| `first` | Full map once per session, then digests |
| `changed` | Full map when map changes, else digest |
| `always` | Full map every context request |

### Formats

| Format | Description |
|--------|-------------|
| `markdown` | Human-readable tree + file notes |
| `json` | Structured data for programmatic use |
| `both` | Markdown + JSON in single injection |

### Injection Content

```
# Workspace map
Root: /project
247 files · 12 changed

src/
  components/
    Button.tsx ~
    Card.tsx
  lib/
    utils.ts

## File notes
- src/components/Button.tsx: React component · exports: Button, ButtonProps · imports: react
- src/lib/utils.ts: Utility functions · exports: cn, formatDate
```

## Watch Mode

- **fs.watch** - Native file system events (real-time)
- **Polling fallback** - 5s interval for reliability
- **Batching** - Collect changes, summarize in batches
- **Deletion detection** - Both events + polling detect deletions
- **Reverse deps cleanup** - Automatic on file deletion

## Cost Tracking

- Tracks input/output tokens per summarizer
- Estimates USD cost from configurable prices
- Periodic logging (default 60s)
- Available in stats command and CLI

## Generated File Detection

Auto-skips 28 patterns:
- Build outputs: `dist/`, `build/`, `out/`, `target/`
- TypeScript: `*.d.ts`, `*.g.dart`
- Minified: `*.min.js`, `*.min.css`
- Framework: `.next/`, `.nuxt/`, `.output/`
- Generated: `*.generated.*`, `*_generated.*`, `generated_*.*`
- Protobuf: `*.pb.go`, `*.pb.ts`, `*.pb.js`
- IDE: `*.designer.*`, `*.autogenerated.*`, `GeneratedPluginRegistrant.*`

## Monorepo Detection

| Type | Config File | Package Discovery |
|------|-------------|-------------------|
| pnpm | `pnpm-workspace.yaml` | `packages/*` |
| npm/yarn | `package.json` workspaces | `packages/*` |
| turbo | `turbo.json` | `apps/*`, `packages/*` |
| nx | `nx.json` | `apps/*`, `libs/*` |
| lerna | `lerna.json` | `packages/*` |
| rush | `rush.json` | `projects/*` |

Per-package maps generated with aggregate root map.

## Performance

| Metric | Target |
|--------|--------|
| Initial walk | < 2s for 10k files |
| Incremental update | < 10ms per file |
| Summarization (outline) | < 2ms/file |
| Injection size | < 12KB default |
| Memory | < 100MB for 10k files |

## Incremental Updates

1. **File change** → Mark dirty
2. **Debounce** → Batch changes
3. **Summarize** → Update cache entry
4. **Tree update** → Incremental tree modification
5. **Next injection** → Uses cached tree