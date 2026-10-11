# Summarizer LSP

## Overview

LSP-backed summarizer using Language Server Protocol for precise symbols.

## API

```typescript
export async function lspSummarize(
  rel: string,
  content: string,
  api: Context,
  opts: Options,
  stats: Stats,
  log: (...args: unknown[]) => void
): Promise<{
  summary: string
  symbols: Array<{ name: string; kind?: string }>
  imports: string[]
  sections?: SummarySections
} | undefined>
```

## Behavior

1. Checks LSP availability via `ctx.lsp`
2. Requests `documentSymbols` for file
3. Extracts exported symbols (functions, classes, interfaces, etc.)
4. Falls back to outline if LSP unavailable

## Supported Languages

| Language | LSP Server |
|----------|------------|
| TypeScript | tsserver |
| JavaScript | tsserver |
| Python | pyright, pylsp |
| Go | gopls |
| Rust | rust-analyzer |
| Java | jdt.ls |
| C/C++ | clangd |
| C# | csharp-ls |
| Ruby | ruby-lsp |
| PHP | intelephense |

## Output

```markdown
- src/components/Button.tsx: tsx file · 45 lines · exports: Button, ButtonProps, default · imports: react, ./hooks, ./types
```

## Configuration

```json
{
  "summarizer": "lsp",
  "lspTimeoutMs": 10000,
  "lspMaxSymbols": 500
}
```

## Fallback Behavior

```json
{
  "summarizerPreference": {
    "fallbackChain": ["lsp", "outline", "model"],
    "lspFallbackOnTimeout": true,
    "lspFallbackOnError": true
  }
}
```

### Fallback Scenarios

1. **LSP timeout** → Falls back to outline
2. **LSP error** → Falls back to outline
3. **LSP unavailable** → Falls back to outline
3. **All fail** → Outline (always succeeds)