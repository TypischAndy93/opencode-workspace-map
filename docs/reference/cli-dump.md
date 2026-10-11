# workspace-map:dump

Output the full workspace map to stdout.

## Usage

```bash
workspace-map:dump [options]
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--format` | `tree` \| `json` | `tree` | Output format |
| `--limit` | `number` | - | Maximum number of files to include |
| `--query` | `string` | - | Filter files by query string |

## Examples

```bash
# Tree format (default)
workspace-map:dump

# JSON format
workspace-map:dump --format=json

# Limit results
workspace-map:dump --limit=50

# Filter by query
workspace-map:dump --query="src/components"
```

## Output

### Tree Format (Default)

```
src/
  components/
    Button.tsx ~
  lib/
    utils.ts
```

### JSON Format

```json
{
  "version": "0.4.2",
  "totalFiles": 247,
  "changedFiles": 12,
  "tree": { ... },
  "notes": { ... },
  "reverseDeps": { ... }
}
```