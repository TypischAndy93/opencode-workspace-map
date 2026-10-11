# Watch Mode

## Overview

Watch mode provides real-time file change detection and automatic re-summarization.

## Features

- **Real-time events** - Uses `fs.watch` with recursive option
- **Polling fallback** - 5-second interval for reliability
- **Batching** - Groups rapid changes
- **Deletion detection** - Both events and polling
- **Reverse deps cleanup** - Automatic on deletion

## Configuration

```json
{
  "watchEnabled": true,
  "watch": {
    "debounceMs": 500,
    "batchChanges": true,
    "batchTimeoutMs": 100
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `watchEnabled` | `boolean` | `true` | Enable watch mode |
| `watch.debounceMs` | `number` | `500` | Debounce before re-summarizing |
| `watch.batchChanges` | `boolean` | `true` | Batch multiple changes |
| `watch.batchTimeoutMs` | `number` | `100` | Max batch wait time |

## CLI Command

```bash
workspace-map:watch --debounceMs=500 --pattern="src/**/*.ts" --once=false
```

| Option | Description |
|--------|-------------|
| `--debounceMs` | Debounce time (ms) |
| `--pattern` | Glob pattern to watch |
| `--once` | Exit after first change |
| `--batchChanges` | Enable batching |
| `--batchTimeoutMs` | Batch timeout (ms) |

## Behavior

### File Change Detection

1. **fs.watch event** → Immediate detection
2. **Debounce/Batch** → Collect changes
3. **Summarize** → Update cache
4. **Tree update** → Incremental

### Deletion Detection

- **fs.watch** - Rename event with ENOENT check
- **Polling** - Compares file lists every 5s
- **Cleanup** - Removes from cache, reverse deps, tree

### Batching

```
File A changed ──┐
File B changed ──┼──▶ Wait 100ms ──▶ Summarize A, B
File C changed ──┘
```

## Polling Fallback

- **Interval:** 5 seconds
- **Purpose:** Reliability on network filesystems, edge cases
- **Detects:** New files, deleted files
- **Overhead:** Minimal (single directory walk)

## Configuration Examples

### High-Frequency Changes
```json
{
  "watch": {
    "debounceMs": 200,
    "batchChanges": true,
    "batchTimeoutMs": 50
  }
}
```

### Low-Frequency / Large Repo
```json
{
  "watch": {
    "debounceMs": 1000,
    "batchChanges": true,
    "batchTimeoutMs": 500
  }
}
```

### No Batching (Immediate)
```json
{
  "watch": {
    "debounceMs": 0,
    "batchChanges": false
  }
}
```

## Troubleshooting

### High CPU Usage
- Increase `debounceMs`
- Enable `batchChanges`
- Increase `batchTimeoutMs`

### Missed Changes
- Decrease `debounceMs`
- Check `pattern` filter
- Verify `watchEnabled: true`

### Missed Deletions
- Polling catches deletions missed by fs.watch
- Ensure `POLL_INTERVAL` (5s) is acceptable

## Performance

| Scenario | CPU | Memory |
|----------|-----|--------|
| Idle | ~0% | Baseline |
| Active editing | ~1-5% | +10-50MB |
| Batch of 50 files | Spike ~10% | +50MB |

## Disable Watch Mode

```json
{
  "watchEnabled": false
}
```

Or via CLI:
```bash
workspace-map:watch --once=true
```