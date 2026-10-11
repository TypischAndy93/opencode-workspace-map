# Cost Tracking Examples

## Basic Setup

```json
{
  "plugins": {
    "workspace-map": {
      "enabled": true,
      "summarizer": "model",
      "costTracking": {
        "enabled": true
      }
    }
  }
}
```

## With Custom Model

```json
{
  "plugins": {
    "workspace-map": {
      "enabled": true,
      "summarizer": "model",
      "summaryModel": {
        "providerID": "openai",
        "id": "gpt-4o-mini"
      },
      "costTracking": {
        "enabled": true,
        "inputTokenPriceUsd": 0.0000015,
        "outputTokenPriceUsd": 0.000006,
        "logIntervalMs": 60000
      }
    }
  }
}
```

## Monitoring Costs

### CLI Stats

```bash
workspace-map:stats --format=json
```

Output:
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

## Monitoring in CI/CD

```yaml
# GitHub Actions
- name: Check workspace-map costs
  run: |
    COST=$(workspace-map:stats --format=json | jq '.cost.totalCostUsd')
    echo "Cost: $COST"
    if (( $(echo "$COST > 1.00" | bc -l) )); then
      echo "Cost exceeds $1.00"
      exit 1
    fi
```