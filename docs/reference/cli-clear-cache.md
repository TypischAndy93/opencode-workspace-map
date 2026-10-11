# workspace-map:clear-cache

Clear the workspace map cache (forces full re-index on next injection).

## Usage

```bash
workspace-map:clear-cache --confirm=true
```

## Required

| Option | Required | Description |
|--------|----------|-------------|
| `--confirm` | `true` | Confirm cache clearing (required) |

## Output

```
✅ Cache cleared (247 entries removed). Next injection will trigger full re-index.
```

## What Gets Cleared

- File entry cache
- Reverse dependency index
- File cache timestamps
- VCS cache

## When to Use

- After major refactoring
- After switching branches with major changes
- When cache seems corrupted
- Before major releases