# workspace-map:validate

Validate configuration and environment.

## Usage

```bash
workspace-map:validate [options]
```

## Options

| Option | Type | Default |
|--------|------|---------|
| `--verbose` | `boolean` | `false` |

## Output

```
✅ Configuration valid
  ℹ Root directory exists: /project
  ℹ .gitignore found
  ℹ Storage backend accessible
  ℹ Project type: Monorepo (pnpm)
  ℹ Primary language: TypeScript
  ℹ Framework: Next.js
  ℹ Package manager: pnpm
  ℹ TypeScript: Yes
  ℹ Tests: Yes
  ⚠ maxFiles (3000) is very low
```

### JSON Output (with --format=json)

```json
{
  "valid": true,
  "issues": [],
  "warnings": ["maxFiles (3000) is very low"],
  "info": [
    "Root directory exists: /project",
    ".gitignore found",
    "Storage backend accessible",
    "Project type: Monorepo (pnpm)",
    "Primary language: TypeScript",
    "Framework: Next.js",
    "Package manager: pnpm",
    "TypeScript: Yes",
    "Tests: Yes"
  ]
}
```