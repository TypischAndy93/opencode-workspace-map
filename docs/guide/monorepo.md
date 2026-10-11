# Monorepo Support

## Overview

workspace-map automatically detects and supports monorepo configurations.

## Supported Tools

| Type | Config File | Package Discovery |
|------|-------------|-------------------|
| pnpm | `pnpm-workspace.yaml` | `packages/*` |
| npm/yarn | `package.json` workspaces | `packages/*` |
| turbo | `turbo.json` | `apps/*`, `packages/*` |
| nx | `nx.json` | `apps/*`, `libs/*` |
| lerna | `lerna.json` | `packages/*` |
| rush | `rush.json` | `projects/*` |

## Detection

```json
{
  "autoTune": true
}
```

Auto-detection runs on startup and populates:

```json
{
  "isMonorepo": true,
  "monorepoType": "pnpm",
  "packages": [
    { "name": "pkg1", "path": "packages/pkg1", "language": "typescript" },
    { "name": "pkg2", "path": "packages/pkg2", "language": "python" }
  ]
}
```

## Per-Package Maps

When `monorepo.packageMaps` is enabled:

```
Root map (aggregated)
├── packages/pkg1/ (sub-map)
├── packages/pkg2/ (sub-map)
└── apps/web/ (sub-map)
```

## Configuration

```json
{
  "monorepo": {
    "enabled": true,
    "packageMaps": true,
    "maxPackages": 50
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable monorepo detection |
| `packageMaps` | `boolean` | `true` | Generate per-package maps |
| `maxPackages` | `number` | `50` | Max packages to map |

## Package Discovery

### pnpm
```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/*'
  - 'apps/*'
```

### npm/yarn
```json
{
  "workspaces": ["packages/*", "apps/*"]
}
```

### turbo
```json
{
  "packages": ["apps/*", "packages/*"]
}
```

### nx
```json
{
  "projects": {
    "ui": { "root": "libs/ui" },
    "api": { "root": "apps/api" }
  }
}
```

### lerna
```json
{
  "packages": ["packages/*"]
}
```

### rush
```json
{
  "projects": [
    { "packageName": "pkg1", "projectFolder": "projects/pkg1" }
  ]
}
```

## CLI Tool

```bash
workspace-map:packages
```

Output:
```
Monorepo: pnpm (3 packages)
packages/pkg1 (typescript)
packages/pkg2 (python)
apps/web (typescript)
```

## Per-Package Injection

Each package gets its own map section in injection:

```
# Workspace map
Root: /project
247 files · 12 changed
Monorepo: pnpm (3 packages)
Packages: pkg1, pkg2, web

## Package: pkg1
Root: /project/packages/pkg1
12 files
src/
  index.ts
  utils.ts

## Package: pkg2
Root: /project/packages/pkg2
8 files
src/
  main.py
```

## Configuration Per Package

```json
{
  "summarizerPreference": {
    "perLanguage": {
      "ts": "lsp",
      "py": "model",
      "md": "outline"
    }
  }
}
```

## Best Practices

1. **Enable autoTune** - Auto-detects monorepo type
2. **Use packageMaps** - Better context for large monorepos
3. **Set maxPackages** - Limit for very large monorepos
5. **Per-language summarizer** - Different strategies per package