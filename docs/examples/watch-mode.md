# Watch Mode Examples

## Basic Watch

```json
{
  "plugins": {
    "workspace-map": {
      "enabled": true,
      "watchEnabled": true
    }
  }
}
```

## High-Frequency Editing

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

## Low-Frequency / Large Repo

```json
{
  "plugins": {
    "workspace-map": {
      "enabled": true,
      "watchEnabled": true,
      "watch": {
        "debounceMs": 1000,
        "batchChanges": true,
        "batchTimeoutMs": 500
      }
    }
  }
}
```

## No Batching (Immediate)

```json
{
  "plugins": {
    "workspace-map": {
      "enabled": true,
      "watchEnabled": true,
      "watch": {
        "debounceMs": 0,
        "batchChanges": false
      }
    }
  }
}
```

## Pattern Filtering

```json
{
  "plugins": {
    "workspace-map": {
      "enabled": true,
      "watchEnabled": true,
      "watch": {
        "debounceMs": 500,
        "batchChanges": true,
        "batchTimeoutMs": 100
      }
    }
  }
}
```

```bash
# CLI with pattern
workspace-map:watch --pattern="src/**/*.ts" --batchChanges=true
```

## Once Mode (CI/CD)

```bash
workspace-map:watch --once=true --debounceMs=500
```

## Disable Watch

```json
{
  "plugins": {
    "workspace-map": {
      "enabled": true,
      "watchEnabled": false
    }
  }
}
```

## With Pattern in Config

```json
{
  "plugins": {
    "workspace-map": {
      "enabled": true,
      "watchEnabled": true,
      "watch": {
        "debounceMs": 500,
        "batchChanges": true,
        "batchTimeoutMs": 100
      }
    }
  }
}
```

Then use CLI with pattern:
```bash
workspace-map:watch --pattern="src/**/*.ts"
```

## Debugging Watch

```json
{
  "plugins": {
    "workspace-map": {
      "enabled": true,
      "watchEnabled": true,
      "debug": true
    }
  }
}
```

Output:
```
[workspace-map] watching /project for changes (batched) + polling
[workspace-map] batch summarizing 3 files: src/components/Button.tsx, src/lib/utils.ts
[workspace-map] new file detected via polling: src/new-file.ts
[workspace-map] deleted file detected via polling: src/old-file.ts
```