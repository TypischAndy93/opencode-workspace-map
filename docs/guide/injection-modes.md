# Injection Modes

## Overview

Injection modes control how the workspace map is injected into the agent's session context.

## Injection Levels

| Mode | Description | Use Case |
|------|-------------|----------|
| `off` | No injection | Disable workspace map |
| `tree` | Directory tree only | Minimal context, zero summarization |
| `changed` | Tree + changed file notes | Default, balanced |
| `full` | Tree + all file notes | Maximum context |

## Injection Strategies

### First (`first`)
- Full map injected once per session
- Subsequent injections are digests only
- **Use case:** Stable codebases, minimize context

### Changed (`changed`) - Default
- Full map when map changes
- Digest when unchanged
- **Use case:** Active development, balanced

### Always (`always`)
- Full map every context request
- **Use case:** Debugging, maximum context

## Digest Format

When using digest (not full map):

```
Workspace map available: 247 files · 12 changed
3 changed: src/components/Button.tsx (React component · exports: Button...), src/lib/utils.ts...
Call workspace_map for the tree and per-file summaries.
```

## Injection Formats

### Markdown (Default)
Human-readable tree with file notes
```markdown
# Workspace map
Root: /project
247 files · 12 changed

src/
  components/
    Button.tsx ~
  lib/
    utils.ts

## File notes
- src/components/Button.tsx: React component · exports: Button...
```

### JSON
Structured data for programmatic use
```json
{
  "version": "0.4.2",
  "totalFiles": 247,
  "changedFiles": 12,
  "changed": ["src/components/Button.tsx", "..."],
  "tree": { ... },
  "notes": { "src/components/Button.tsx": { "summary": "...", "symbols": [...] } }
}
```

### Both
Markdown + JSON in single injection

## Configuration

```json
{
  "inject": "changed",
  "injectStrategy": "changed",
  "injectionFormat": "markdown",
  "maxInjectedChars": 12000,
  "maxSummaries": 50
}
```

| Option | Values | Default |
|--------|--------|---------|
| `inject` | `off` \| `tree` \| `changed` \| `full` | `changed` |
| `injectStrategy` | `first` \| `changed` \| `always` | `changed` |
| `injectionFormat` | `markdown` \| `json` \| `both` | `markdown` |
| `maxInjectedChars` | `number` | `12000` |
| `maxSummaries` | `number` | `50` |

## Tree Rendering

| Option | Default | Description |
|--------|---------|-------------|
| `treeDepth` | `3` | Max depth in tree |
| `maxTreeEntries` | `200` | Max entries in tree |

## Changed File Marker

Files with changes are marked with `~`:
```
src/
  components/
    Button.tsx ~
    Card.tsx
```

## Token Budget

| Component | Approximate Tokens |
|-----------|-------------------|
| Tree (200 entries) | ~1,000 |
| File note (50 files) | ~3,000 |
| Reverse deps | ~500 |
| **Total (default)** | **~4,500** |

## Tips

1. **Reduce context**: Use `inject: "tree"` for minimal context
2. **Save tokens**: `maxSummaries: 20`, `maxInjectedChars: 8000`
3. **Maximum context**: `inject: "full"`, `injectStrategy: "always"`
4. **Programmatic use**: `injectionFormat: "json"` for tool parsing