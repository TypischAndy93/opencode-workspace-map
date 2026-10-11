# Basic Setup

## Minimal Configuration

```json
{
  "plugins": {
    "workspace-map": {
      "enabled": true
    }
  }
}
```

## Recommended Configuration

```json
{
  "plugins": {
    "workspace-map": {
      "enabled": true,
      "inject": "changed",
      "summarizer": "outline",
      "watchEnabled": true,
      "autoDetectGenerated": true
    }
  }
}
```

## With Model Summarizer

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
        "enabled": true
      }
    }
  }
}
```

## With LSP Summarizer

```json
{
  "plugins": {
    "workspace-map": {
      "enabled": true,
      "summarizer": "lsp",
      "summarizerPreference": {
        "preferLspFor": ["ts", "tsx", "py", "go", "rs"],
        "fallbackChain": ["lsp", "outline"]
      }
    }
  }
}
```

## Monorepo (pnpm)

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

## Large Repository

```json
{
  "plugins": {
    "workspace-map": {
      "enabled": true,
      "summarizer": "outline",
      "maxFiles": 1000,
      "maxFileBytes": 100000,
      "maxInjectedChars": 8000,
      "maxSummaries": 20,
      "watchEnabled": false
    }
  }
}
```

## With Cost Tracking

```json
{
  "plugins": {
    "workspace-map": {
      "enabled": true,
      "summarizer": "model",
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

## With Custom Generated Patterns

```json
{
  "plugins": {
    "workspace-map": {
      "enabled": true,
      "autoDetectGenerated": true,
      "generatedPatterns": [
        "*.generated.*",
        "dist/**",
        "build/**",
        "my-generated/**"
      ]
    }
  }
```

## With Custom Watch

```json
{
  "plugins": {
    "workspace-map": {
      "enabled": true,
      "watchEnabled": true,
      "watch": {
        "debounceMs": 200,
        "batchChanges": true,
        "batchTimeoutMs": 50
      }
    }
  }
```

## Per-Language Summarizer

```json
{
  "plugins": {
    "workspace-map": {
      "enabled": true,
      "summarizer": "outline",
      "summarizerPreference": {
        "perLanguage": {
          "ts": "lsp",
          "tsx": "lsp",
          "py": "lsp",
          "md": "outline",
          "json": "outline"
        },
        "fallbackChain": ["lsp", "outline"]
      }
    }
  }
}
```