# workspace-map:export

Export the workspace map to a JSON file.

## Usage

```bash
workspace-map:export [options]
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--output` | `string` | `.opencode/workspace-map.json` | Output file path |
| `--format` | `json` | `json` | Output format |
| `--overwrite` | `boolean` | `false` | Overwrite existing file |

## Examples

```bash
# Export to default location
workspace-map:export

# Export to custom location
workspace-map:export --output=./my-map.json

# Export with overwrite
workspace-map:export --output=./backup.json --overwrite=true
```

## Output

```
✅ Workspace map exported to .opencode/workspace-map.json (247 files)
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

## Use Cases

- **Backup** - Save current workspace map
- **Share** - Share with team members
- **CI/CD** - Export in CI, import in deployment
- **Debugging** - Analyze workspace structure offline