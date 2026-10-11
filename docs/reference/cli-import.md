# workspace-map:import

Import a workspace map from a JSON file (populates cache, does not re-summarize).

## Usage

```bash
workspace-map:import [options]
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--input` | `string` | `.opencode/workspace-map.json` | Input file path |
| `--merge` | `boolean` | `false` | Merge with existing cache |

## Examples

```bash
# Import from default location (replaces cache)
workspace-map:import

# Import from custom path (replaces cache)
workspace-map:import --input=./backup-map.json

# Import and merge with existing cache
workspace-map:import --input=./backup-map.json --merge=true
```

## Output

```
✅ Workspace map imported from .opencode/workspace-map.json (247 files, 235 summaries)
```

## File Format

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

## Behavior

### Replace Mode (Default)

- Clears existing cache
- Populates cache from file
- Rebuilds tree cache on next `listFiles()`

### Merge Mode (`--merge=true`)

- Keeps existing cache entries
- Adds/updates entries from file
- Rebuilds tree cache on next `listFiles()`

## Use Cases

- **Restore** - Restore from backup
- **Share** - Share map between team members
- **CI/CD** - Export in CI, import in deployment
- **Debugging** - Analyze workspace structure offline

## File Format

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

## Notes

- Import does NOT re-summarize files
- Summaries are loaded from the imported file
- Tree cache is rebuilt on next `listFiles()` call
- Reverse dependencies are restored from `importedBy` field