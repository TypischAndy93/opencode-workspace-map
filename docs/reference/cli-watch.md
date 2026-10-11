# workspace-map:watch

Watch workspace for file changes and update summaries in real-time.

## Usage

```bash
workspace-map:watch [options]
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--debounceMs` | `number` | plugin default | Debounce time (ms) |
| `--pattern` | `string` | - | Glob pattern filter |
| `--once` | `boolean` | `false` | Exit after first change |
| `--batchChanges` | `boolean` | `true` | Batch changes |
| `--batchTimeoutMs` | `number` | `100` | Batch timeout (ms) |

## Examples

```bash
# Watch with defaults
workspace-map:watch

# Watch with custom pattern
workspace-map:watch --pattern="src/**/*.ts"

# Watch once and exit
workspace-map:watch --once=true

# Watch without batching
workspace-map:watch --batchChanges=false --debounceMs=500

# Custom batch timeout
workspace-map:watch --batchTimeoutMs=50
```

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
- **Purpose:** Reliability on network filesystems
- **Detects:** New files, deleted files
- **Overhead:** Minimal (single directory walk)

## Output

```
watching /project for changes (batched) + polling
batch summarizing 3 files: src/components/Button.tsx, src/lib/utils.ts, src/types/index.ts
new file detected via polling: src/new-file.ts
deleted file detected via polling: src/old-file.ts
```

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