# Summarizer Model

## Overview

AI-powered summarization using LLM via `ctx.generate.text`.

## API

```typescript
export async function modelSummary(
  rel: string,
  content: string,
  api: Context,
  opts: Options,
  log: (...args: unknown[]) => void
): Promise<{
  summary: string
  symbols: string[]
  inputTokens?: number
  outputTokens?: number
} | undefined>
```

## Behavior

1. Checks model availability via `ctx.model.default()`
2. Truncates content to 12KB
3. Builds prompt with length guide
4. Calls `api.generate.text()`
5. Parses response for summary and symbols
5. Returns structured result with token estimates

## Prompt Template

```
You are indexing a code repository. In approximately 80 words describe this file's purpose,
its key exports, and which other modules it likely interacts with. Then on a new
line beginning "Symbols:" list up to 12 key exported symbols.

File: src/components/Button.tsx

```
export interface ButtonProps { ... }
export function Button({ variant, children, ... }: ButtonProps) { ... }
```
```

## Output

```json
{
  "summary": "A reusable button component with variant support...",
  "symbols": ["Button", "ButtonProps", "default"],
  "inputTokens": 1240,
  "outputTokens": 890
}
```

## Configuration

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

## Length Guide

| Setting | Description | Approximate Tokens |
|---------|-------------|-------------------|
| `short` | 1 sentence | ~50 |
| `medium` | 2-3 sentences | ~150 |
| `long` | 4-5 sentences | ~300 |

## Cost Tracking

Returns `inputTokens` and `outputTokens` estimates for cost tracking.

```typescript
trackCost("model", result.inputTokens, result.outputTokens)
```

## Error Handling

Returns `undefined` on failure (model unavailable, timeout, etc.)

Falls back to outline summarizer in fallback chain.