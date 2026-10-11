# Summarizers

## Overview

workspace-map provides three summarization strategies, each with different trade-offs between cost, accuracy, and speed.

## Outline Summarizer (Default)

**Cost:** Zero model tokens  
**Speed:** Fast (~1-2ms/file)  
**Accuracy:** Good for structure, limited semantic understanding

### How It Works

1. **Language Detection** - By file extension
2. **Regex Parsing** - Language-specific patterns for:
   - Functions, classes, interfaces, types
   - Imports/exports
   - JSDoc/TSDoc comments
3. **Structured Output** - Purpose, exports, dependencies, todos

### Supported Languages

| Language | Extensions | Symbol Kinds |
|----------|------------|--------------|
| TypeScript | .ts, .tsx | functions, classes, interfaces, types, enums |
| JavaScript | .js, .jsx, .mjs, .cjs | functions, classes, const/let/var |
| Python | .py | functions, classes, imports |
| Go | .go | functions, types, imports |
| Rust | .rs | functions, structs, enums, traits |
| Java/Kotlin | .java, .kt | classes, methods, interfaces |
| C/C++ | .c, .cc, .cpp, .h | functions, structs, includes |
| C# | .cs | classes, methods, properties |
| Ruby | .rb | classes, modules, methods |
| PHP | .php | functions, classes, traits |
| Swift | .swift | functions, structs, classes |
| Dart | .dart | functions, classes, mixins |
| Lua | .lua | functions, tables |
| Shell | .sh, .bash, .zsh | functions, variables |
| SQL | .sql | tables, views, procedures |

### Output Format

```markdown
## File notes
- src/components/Button.tsx: React component · exports: Button, ButtonProps · imports: react, ./hooks
- src/lib/utils.ts: Utility functions · exports: cn, formatDate, clamp · imports: none
```

### Configuration

```json
{
  "summarizer": "outline",
  "summarySections": {
    "includePurpose": true,
    "includeKeyExports": true,
    "includeDependencies": true,
    "includeTodos": true,
    "maxPurposeLength": 120,
    "maxExports": 12,
    "maxDependencies": 15,
    "maxTodos": 8
  }
}
```

## Model Summarizer

**Cost:** Model tokens (tracked)  
**Speed:** Slow (~100-500ms/file)  
**Accuracy:** High - understands intent and relationships

### How It Works

1. Sends file content to LLM via `ctx.generate.text`
2. Prompt requests: purpose, key exports, dependencies
3. Parses structured response
4. Tracks token usage and estimated cost

### Prompt Template

```
You are indexing a code repository. In approximately 80 words describe this file's purpose,
its key exports, and which other modules it likely interacts with. Then on a new
line beginning "Symbols:" list up to 12 key exported symbols.

File: src/components/Button.tsx

```tsx
export interface ButtonProps { ... }
export function Button({ variant, children, ... }: ButtonProps) { ... }
```
```

### Output

```markdown
- src/components/Button.tsx: A reusable button component with variant support...
  Symbols: Button, ButtonProps, default
```

### Configuration

```json
{
  "summarizer": "model",
  "summaryModel": {
    "providerID": "openai",
    "id": "gpt-4o-mini",
    "variant": "mini"
  },
  "summaryLength": "medium",
  "summaryLengthByExt": {
    "ts": 500,
    "py": 500,
    "md": 2000
  }
}
```

### Cost Estimation

| Model | Input Price | Output Price | Typical Cost/File |
|-------|-------------|--------------|-------------------|
| gpt-4o-mini | $0.15/1M | $0.60/1M | ~$0.0001 |
| gpt-4o | $2.50/1M | $10.00/1M | ~$0.001 |
| claude-3-haiku | $0.25/1M | $1.25/1M | ~$0.0002 |

## LSP Summarizer

**Cost:** Zero model tokens  
**Speed:** Medium (~50-200ms/file)  
**Accuracy:** Very High - exact symbols from language server

### How It Works

1. Checks if LSP is available via `ctx.lsp`
2. Requests `documentSymbols` for the file
3. Extracts exported symbols (functions, classes, interfaces, etc.)
4. Falls back to outline if LSP unavailable

### Supported Languages

| Language | LSP Support |
|----------|-------------|
| TypeScript | Full (tsserver) |
| JavaScript | Full |
| Python | Full (pyright/pylsp) |
| Go | Full (gopls) |
| Rust | Full (rust-analyzer) |
| Java | Full (jdt.ls) |
| C/C++ | Full (clangd) |
| C# | Full (csharp-ls) |
| Ruby | Full (ruby-lsp) |
| PHP | Full (intelephense) |

### Output

```markdown
- src/components/Button.tsx: tsx file · 45 lines · exports: Button, ButtonProps, default · imports: react, ./hooks, ./types
```

### Configuration

```json
{
  "summarizer": "lsp",
  "lspTimeoutMs": 10000,
  "lspMaxSymbols": 500
}
```

## Fallback Chain

When a summarizer fails, it falls back to the next in chain:

```json
{
  "summarizerPreference": {
    "fallbackChain": ["lsp", "outline", "model"],
    "lspFallbackOnTimeout": true,
    "lspFallbackOnError": true
  }
}
```

### Example Scenarios

1. **LSP timeout** → Falls back to outline
2. **LSP error** → Falls back to outline  
3. **Model unavailable** → Falls back to outline
3. **All fail** → Outline (always succeeds)

## Per-Language Preferences

```json
{
  "summarizerPreference": {
    "preferLspFor": ["ts", "tsx", "py", "go", "rs"],
    "fallbackChain": ["lsp", "outline", "model"],
    "perLanguage": {
      "md": "outline",
      "json": "outline",
      "py": "lsp",
      "ts": "lsp"
    }
  }
}
```

## Summary Comparison

| Aspect | Outline | Model | LSP |
|--------|---------|-------|-----|
| **Cost** | Free | ~$0.0001/file | Free |
| **Speed** | ~1-2ms | ~200-500ms | ~50-200ms |
| **Symbols** | Regex-based | AI-extracted | LSP-exact |
| **Purpose** | Extracted from docs | AI-generated | From signatures |
| **Imports** | Regex-parsed | AI-extracted | LSP-exact |
| **Reliability** | 100% | ~99% | ~95% (needs LSP) |
| **Best For** | Large repos, CI | Important files | Precision work |

## Recommendations

| Use Case | Recommended |
|----------|-------------|
| Large monorepos (10k+ files) | `outline` |
| CI/CD pipelines | `outline` |
| Code review assistance | `model` or `lsp` |
| Debugging/Refactoring | `lsp` |
| Learning new codebase | `model` |
| Mixed: important + bulk | `perLanguage` config |