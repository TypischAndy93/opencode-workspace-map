# workspace-map:stats

Show cache and summary statistics.

## Usage

```bash
workspace-map:stats [options]
```

## Options

| Option | Values | Default |
|--------|--------|---------|
| `--format` | `text` \| `json` | `text` |

## Output

### Text Format

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

Cost Tracking:
  Total: $0.000042 (1240 in / 890 out tokens)
  By summarizer: outline=$0.000000, model=$0.000042, lsp=$0.000000

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