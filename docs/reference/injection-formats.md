# Injection Formats

## Markdown (Default)

Human-readable tree with file notes.

```
# Workspace map
Root: /project
247 files · 12 changed

src/
  components/
    Button.tsx ~
  lib/
    utils.ts

## File notes
- src/components/Button.tsx: React component · exports: Button, ButtonProps · imports: react, ./hooks
```

### Configuration

```json
{
  "injectionFormat": "markdown"
}
```

## JSON

Structured data for programmatic use.

```json
{
  "version": "0.4.2",
  "root": "",
  "broadRoot": false,
  "totalFiles": 247,
  "changedFiles": 12,
  "changed": ["src/components/Button.tsx", "src/lib/utils.ts"],
  "tree": { ... },
  "notes": { ... },
  "reverseDeps": { ... }
}
```

### Configuration

```json
{
  "injectionFormat": "json"
}
```

## Both

Markdown + JSON in single injection.

```json
{
  "injectionFormat": "both"
}
```

### Output

```markdown
# Workspace map
...

---

## JSON Output

```json
{ ... }
```
```

### Configuration

```json
{
  "injectionFormat": "both"
}
```

## Comparison

| Format | Size | Readability | Parsing |
|--------|------|-------------|---------|
| markdown | ~12KB | Human-readable | Manual |
| json | ~15KB | Machine-readable | Easy (JSON.parse) |
| both | ~27KB | Both | Both |

## Configuration

```json
{
  "injectionFormat": "markdown" | "json" | "both"
}
```

## Use Cases

| Format | Use Case |
|--------|----------|
| markdown | Human reading, context injection |
| json | Tool parsing, programmatic access |
| both | Both human and machine consumption |