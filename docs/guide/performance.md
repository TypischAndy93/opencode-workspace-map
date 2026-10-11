# Performance Tuning

## Overview

Tips for optimizing workspace-map performance in large repositories.

## Quick Wins

### Reduce Injection Size
```json
{
  "maxInjectedChars": 8000,
  "maxSummaries": 20,
  "maxTreeEntries": 100
}
```

### Limit Files
```json
{
  "maxFiles": 1000,
  "maxFileBytes": 100000
}
```

### Disable Features
```json
{
  "watchEnabled": false,
  "includeReverseDeps": false,
  "autoDetectGenerated": true
}
```

## Concurrency

```json
{
  "walkConcurrency": "auto",
  "summarizeConcurrency": 4
}
```

| Repo Size | walkConcurrency | summarizeConcurrency |
|-----------|----------------|---------------------|
| Small (<1k) | 4 | 2 |
| Medium (1-10k) | 8 | 4 |
| Large (10k+) | 16 | 8 |

## Summarizer Selection

| Repo Size | Recommended |
|-----------|-------------|
| < 100 files | `model` or `lsp` |
| 100-1000 | `lsp` or `outline` |
| 1000+ | `outline` |

## File Size Limits

```json
{
  "maxFileBytesByExt": {
    "ts": 100000,
    "js": 100000,
    "py": 100000,
    "md": 50000,
    "json": 50000
  }
}
```

## Tree Settings

```json
{
  "treeDepth": 2,
  "maxTreeEntries": 100,
  "maxInjectedChars": 8000,
  "maxSummaries": 20
}
```

## Cache Settings

```json
{
  "treeTtlMs": 30000,
  "debounceMs": 100
}
```

## Generated Files

Ensure `autoDetectGenerated: true` to skip build outputs.

## Monitoring

```bash
# Check stats
workspace-map:stats --format=json

# Key metrics
- walks: number of directory walks
- lastWalkMs: time for last walk
- summaries: total summaries
- modelSummaries: model summarizer usage
```

## Benchmarking

```bash
npm run benchmark
```

Output:
```
Overall:
  Avg Time: 0.80ms
  Avg Quality: 90.8/100
```

## Common Issues

### Slow Initial Walk
- Increase `walkConcurrency`
- Add `ignore` patterns for large dirs
- Check `maxFiles` limit

### Slow Summarization
- Switch to `outline` summarizer
- Reduce `summarizeConcurrency`
- Enable `autoDetectGenerated`

### High Memory
- Reduce `maxFiles`
- Reduce `maxFileBytes`
- Lower `maxSummaries`

### Slow Injection
- Reduce `maxInjectedChars`
- Reduce `maxSummaries`
- Use `injectionFormat: "json"`

## Benchmarking

```bash
npm run benchmark
```

Output includes per-language timing and quality scores.

## Profiling

Enable debug logging:
```json
{
  "debug": true
}
```

Outputs:
```
[workspace-map] walk completed: 247 files in 45ms
[workspace-map] summarize: src/file.ts in 2ms (outline)
[workspace-map] injection: 12.3KB in 3ms
```