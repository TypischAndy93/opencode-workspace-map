# CLI Commands Reference

## workspace-map:dump

Output the full workspace map to stdout.

```bash
workspace-map:dump --format=tree --limit=100 --query="src"
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--format` | `tree` \| `json` | `tree` | Output format |
| `--limit` | `number` | - | Max files to include |
| `--query` | `string` | - | Filter files by query |

### Examples

```bash
# Tree format (default)
workspace-map:dump

# JSON format
workspace-map:dump --format=json

# Limit results
workspace-map:dump --limit=50

# Filter by query
workspace-map:dump --query="src/components"

# Force refresh
workspace-map:dump --refresh=true
```

### Output

**Tree format:**
```
src/
  components/
    Button.tsx ~
  lib/
    utils.ts
```

**JSON format:**
```json
{
  "version": "0.4.2",
  "totalFiles": 247,
  "changedFiles": 12,
  "tree": { ... },
  "notes": { ... }
}
```

## workspace-map:stats

Show cache and summary statistics.

```bash
workspace-map:stats --format=json
```

### Options

| Option | Values | Default |
|--------|--------|---------|
| `--format` | `text` \| `json` | `text` |

### Output (Text)

```
Workspace Map Statistics (v0.4.2)
=================================
Cache:
  Entries: 247
  Size: 2.3 MB

Files:
  Total discovered: 247
  Summarized: 235
  Skipped: 12

Summaries by type:
  Outline: 180
  Model: 45
  LSP: 10

Operations:
  Directory walks: 5
  Full injections: 12
  Digest injections: 48
  Dirty flushes: 3
  Warmups: 1
  Sessions: 2

Timing:
  Last walk: 45 ms
  Last injection: 12000 chars at 2024-01-15T10:30:00.000Z

Reverse Dependencies:
  Unique imports tracked: 156
  Total references: 423
```

### JSON Output

```json
{
  "version": "0.4.2",
  "cache": {
    "entries": 247,
    "sizeBytes": 2400000,
    "sizeMB": 2.29
  },
  "files": {
    "total": 247,
    "summarized": 235,
    "skipped": 12
  },
  "summaries": {
    "total": 235,
    "outline": 180,
    "model": 45,
    "lsp": 10
  },
  "operations": {
    "walks": 5,
    "fullInjections": 12,
    "digestInjections": 48,
    "dirtyFlushes": 3,
    "warmups": 1,
    "sessions": 2
  },
  "timing": {
    "lastWalkMs": 45,
    "lastInjectionChars": 12000,
    "lastInjectionAt": "2024-01-15T10:30:00.000Z"
  },
  "reverseDeps": {
    "uniqueImports": 156,
    "totalReferences": 423
  },
  "cost": {
    "totalInputTokens": 1240,
    "totalOutputTokens": 890,
    "totalCostUsd": 0.000042,
    "bySummarizer": {
      "outline": { "inputTokens": 0, "outputTokens": 0, "costUsd": 0 },
      "model": { "inputTokens": 1240, "outputTokens": 890, "costUsd": 0.000042 },
      "lsp": { "inputTokens": 0, "outputTokens": 0, "costUsd": 0 }
    }
  }
}
```

## workspace-map:validate

Validate configuration and environment.

```bash
workspace-map:validate --verbose
```

### Options

| Option | Type | Default |
|--------|------|---------|
| `--verbose` | `boolean` | `false` |

### Output

```
✅ Configuration valid
  ℹ Root directory exists: /project
  ℹ .gitignore found
  ℹ Storage backend accessible
  ℹ Project type: Monorepo (pnpm)
  ℹ Primary language: TypeScript
  ℹ Framework: Next.js
  ℹ Package manager: pnpm
  ℹ TypeScript: Yes
  ℹ Tests: Yes
  ⚠ maxFiles (3000) is very low
```

## workspace-map:clear-cache

Clear the workspace map cache.

```bash
workspace-map:clear-cache --confirm=true
```

### Required

| Option | Required | Description |
|--------|----------|-------------|
| `--confirm` | `true` | Confirm cache clearing |

### Output

```
✅ Cache cleared (247 entries removed). Next injection will trigger full re-index.
```

## workspace-map:watch

Watch workspace for file changes.

```bash
workspace-map:watch --debounceMs=500 --pattern="src/**/*.ts" --batchChanges=true
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--debounceMs` | `number` | plugin default | Debounce time (ms) |
| `--pattern` | `string` | - | Glob pattern filter |
| `--once` | `boolean` | `false` | Exit after first change |
| `--batchChanges` | `boolean` | `true` | Batch changes |
| `--batchTimeoutMs` | `number` | `100` | Batch timeout (ms) |

### Output

```
watching /project for changes (batched) + polling
batch summarizing 3 files: src/components/Button.tsx, src/lib/utils.ts, src/types/index.ts
```

## workspace-map:export

Export workspace map to JSON file.

```bash
workspace-map:export --output=./my-map.json --overwrite=true
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--output` | `string` | `.opencode/workspace-map.json` | Output path |
| `--format` | `json` | `json` | Output format |
| `--overwrite` | `boolean` | `false` | Overwrite existing |

### Output

```
✅ Workspace map exported to ./my-map.json (247 files)
```

### File Format

```json
{
  "version": "0.4.2",
  "root": "",
  "broadRoot": false,
  "totalFiles": 247,
  "changedFiles": 12,
  "changed": [...],
  "tree": { ... },
  "notes": { ... },
  "reverseDeps": { ... }
}
```

## workspace-map:import

Import workspace map from JSON file.

```bash
workspace-map:import --input=./backup-map.json --merge=true
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--input` | `string` | `.opencode/workspace-map.json` | Input path |
| `--merge` | `boolean` | `false` | Merge with existing cache |

### Output

```
✅ Workspace map imported from ./backup-map.json (247 files, 235 summaries)
```

## Tool: workspace_map

The `workspace_map` tool is registered for agent use.

### Actions

| Action | Description |
|--------|-------------|
| `map` | Get workspace map (tree + summaries) |
| `stats` | Show statistics |
| `export` | Export to JSONL |
| `graph` | Show dependency graph |
| `packages` | List monorepo packages |

### Examples

```json
{
  "action": "map",
  "format": "json",
  "limit": 50,
  "query": "src/components"
}
```

```json
{
  "action": "stats",
  "format": "json"
}
```

```json
{
  "action": "export"
}
```

```json
{
  "action": "graph",
  "format": "json"
}
```

```json
{
  "action": "packages"
}
```