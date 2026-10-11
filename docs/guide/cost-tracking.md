# Cost Tracking

## Overview

Cost tracking monitors token usage and estimated costs for model summarization.

## Configuration

```json
{
  "costTracking": {
    "enabled": false,
    "inputTokenPriceUsd": 0.0000015,
    "outputTokenPriceUsd": 0.000006,
    "logIntervalMs": 60000
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `false` | Enable cost tracking |
| `inputTokenPriceUsd` | `number` | `0.0000015` | $1.50 per 1M input tokens |
| `outputTokenPriceUsd` | `number` | `0.000006` | $6.00 per 1M output tokens |
| `logIntervalMs` | `number` | `60000` | Log interval (ms) |

## Token Estimation

The model summarizer estimates tokens:

```
promptTokens ≈ (promptLength + templateLength) / 4
responseTokens ≈ responseLength / 4
```

*Approximation: 1 token ≈ 4 characters for English*

## Cost Calculation

```
cost = inputTokens × inputPrice + outputTokens × outputPrice
```

### Default Prices (as of 2024)

| Model | Input | Output |
|-------|-------|--------|
| GPT-4o-mini | $0.15/1M | $0.60/1M |
| GPT-4o | $2.50/1M | $10.00/1M |
| Claude 3 Haiku | $0.25/1M | $1.25/1M |

Default prices approximate GPT-4o-mini.

## Logging

Periodic logging (default every 60s):

```
Cost summary: $0.000042 (1,240 in / 890 out tokens)
  By summarizer: outline=$0.000000, model=$0.000042, lsp=$0.000000
```

## CLI Stats

```bash
workspace-map:stats --format=json
```

```json
{
  "cost": {
    "totalInputTokens": 1240,
    "totalOutputTokens": 890,
    "totalCostUsd": 0.000042,
    "bySummarizer": {
      "outline": { "inputTokens": 0, "outputTokens": 0, "costUsd": 0 },
      "model": { "inputTokens": 1240, "outputTokens": 890, "costUsd": 0.000042 },
      "lsp": { "inputTokens": 0, "outputTokens": 0, "costUsd": 0 }
    }
  }
}
```

## Text Output

```
Cost Tracking:
  Total: $0.000042 (1240 in / 890 out tokens)
  By summarizer: outline=$0.000000, model=$0.000042, lsp=$0.000000
```

## Budget Management

### Setting Budgets

```json
{
  "costTracking": {
    "enabled": true,
    "inputTokenPriceUsd": 0.0000025,
    "outputTokenPriceUsd": 0.00001,
    "logIntervalMs": 30000
  }
}
```

### Monitoring

```bash
# Watch costs in real-time
watch -n 10 'workspace-map:stats --format=json | jq .cost'
```

## Per-Summarizer Breakdown

| Summarizer | Tokens | Cost | Notes |
|------------|--------|------|-------|
| outline | 0 | $0 | Zero cost |
| model | Variable | Variable | Tracked |
| lsp | 0 | $0 | Zero cost |

## Recommendations

1. **Enable in production** - Monitor actual costs
2. **Adjust prices** - Match your model provider
3. **Set alerts** - Monitor for unexpected spikes
4. **Use outline default** - Zero cost for most files
4. **Reserve model** - For complex files only

## Disclaimer

Costs are **estimates** based on:
- Token approximation (1 token ≈ 4 chars)
- Configured prices (may not match actual provider)
- Model summarizer only (outline/LSP are free)

Actual provider billing may differ.