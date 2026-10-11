# Monorepo Setup

## pnpm Workspace

### Configuration

```json
{
  "plugins": {
    "workspace-map": {
      "enabled": true,
      "monorepo": {
        "enabled": true,
        "packageMaps": true,
        "maxPackages": 50
      }
    }
  }
}
```

### pnpm-workspace.yaml

```yaml
packages:
  - 'packages/*'
  - 'apps/*'
```

### Result

- Root map with aggregate view
- Per-package maps in `packages/*` and `apps/*`
- CLI: `workspace-map:packages` lists all packages

## Turborepo

```json
{
  "plugins": {
    "workspace-map": {
      "enabled": true,
      "monorepo": {
        "enabled": true,
        "packageMaps": true
      },
      "summarizerPreference": {
        "perLanguage": {
          "ts": "lsp",
          "tsx": "lsp"
        }
      }
    }
  }
}
```

### turbo.json

```json
{
  "packages": ["apps/*", "packages/*"]
}
```

## Nx Workspace

```json
{
  "plugins": {
    "workspace-map": {
      "enabled": true,
      "monorepo": {
        "enabled": true,
        "packageMaps": true
      }
    }
  }
}
```

### nx.json

```json
{
  "projects": {
    "ui": { "root": "libs/ui" },
    "api": { "root": "apps/api" }
  }
}
```

## npm/yarn Workspaces

```json
{
  "plugins": {
    "workspace-map": {
      "enabled": true,
      "monorepo": {
        "enabled": true,
        "packageMaps": true
      }
    }
  }
}
```

### package.json

```json
{
  "name": "root",
  "private": true,
  "workspaces": ["packages/*", "apps/*"]
}
```

## Lerna

```json
{
  "plugins": {
    "workspace-map": {
      "enabled": true,
      "monorepo": {
        "enabled": true,
        "packageMaps": true
      }
    }
  }
}
```

### lerna.json

```json
{
  "packages": ["packages/*"]
}
```

## Rush

```json
{
  "plugins": {
    "workspace-map": {
      "enabled": true,
      "monorepo": {
        "enabled": true,
        "packageMaps": true
      }
    }
  }
}
```

### rush.json

```json
{
  "projects": [
    { "packageName": "pkg1", "projectFolder": "projects/pkg1" }
  ]
}
```

## Per-Package Summarizer

```json
{
  "plugins": {
    "workspace-map": {
      "enabled": true,
      "monorepo": {
        "enabled": true,
        "packageMaps": true
      },
      "summarizerPreference": {
        "perLanguage": {
          "ts": "lsp",
          "tsx": "lsp",
          "py": "model",
          "go": "lsp",
          "rs": "lsp",
          "md": "outline",
          "json": "outline"
        }
      }
    }
  }
}
```

## CLI Usage

```bash
# List packages
workspace-map:packages

# Output:
# Monorepo: pnpm (3 packages)
# packages/pkg1 (typescript)
# packages/pkg2 (python)
# apps/web (typescript)
```

## Per-Package Injection

Each package gets its own section in the injected map:

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
```

## CI/CD Integration

### GitHub Actions

```yaml
- name: Generate workspace map
  run: |
    npm run build
    workspace-map:export --output=workspace-map.json
    
- name: Upload workspace map
  uses: actions/upload-artifact@v4
  with:
    name: workspace-map
    path: workspace-map.json
```

### Share Between Agents

```bash
# Agent 1 exports
workspace-map:export --output=shared-map.json

# Agent 2 imports
workspace-map:import --input=shared-map.json --merge=true
```

## Large Monorepo Optimization

```json
{
  "plugins": {
    "workspace-map": {
      "enabled": true,
      "monorepo": {
        "enabled": true,
        "packageMaps": true,
        "maxPackages": 20
      },
      "maxFiles": 500,
      "maxInjectedChars": 8000,
      "maxSummaries": 15
    }
  }
}
```