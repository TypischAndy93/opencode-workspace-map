# Installation

## Package Installation

```bash
npm install opencode-workspace-map
```

## OpenCode Configuration

Add to your `opencode.json`:

```json
{
  "plugins": {
    "workspace-map": {
      "enabled": true
    }
  }
}
```

## Minimal Configuration

```json
{
  "plugins": {
    "workspace-map": {
      "enabled": true,
      "inject": "changed",
      "summarizer": "outline"
    }
  }
}
```

## Full Configuration Example

```json
{
  "plugins": {
    "workspace-map": {
      "enabled": true,
      "inject": "changed",
      "injectStrategy": "changed",
      "summarizer": "outline",
      "registerTool": true,
      "refreshOnWrite": true,
      "respectGitignore": true,
      "treeDepth": 3,
      "maxTreeEntries": 200,
      "maxInjectedChars": 12000,
      "maxSummaries": 50,
      "maxFiles": 3000,
      "maxFileBytes": 500000,
      "warmupSummaries": 20,
      "walkConcurrency": "auto",
      "summarizeConcurrency": 4,
      "autoTune": true,
      "exportJsonl": false,
      "lspTimeoutMs": 10000,
      "lspMaxSymbols": 500,
      "watchEnabled": true,
      "includeReverseDeps": true,
      "injectionFormat": "markdown",
      "followSymlinks": false,
      "autoDetectGenerated": true,
      "watch": {
        "debounceMs": 500,
        "batchChanges": true,
        "batchTimeoutMs": 100
      },
      "costTracking": {
        "enabled": false,
        "inputTokenPriceUsd": 0.0000015,
        "outputTokenPriceUsd": 0.000006,
        "logIntervalMs": 60000
      }
    }
  }
}
```

## Sidecar Configuration

You can also use a sidecar `config.json` file in your project root:

```json
{
  "inject": "changed",
  "summarizer": "model",
  "watchEnabled": true,
  "costTracking": {
    "enabled": true
  }
}
```

## Verification

After installation, restart OpenCode. You should see:

```
[workspace-map] SETUP START ...
registering workspace_map tool (early)
[workspace-map] ready v0.4.2 at /your/project
```

Check the tool is registered:

```
workspace_map
```

## Troubleshooting

### Plugin Not Loading

1. Check OpenCode version (requires v2.x+)
2. Check plugin path in configuration
3. Check logs: `[workspace-map] SETUP START`

### Permission Issues

Ensure the plugin has read access to your workspace:

```bash
chmod -R 755 /path/to/opencode-workspace-map
```