# Getting Started

## Introduction

**workspace-map** is an OpenCode plugin that maintains a live, incrementally updated map of your workspace. It provides structural awareness of multi-file repositories by maintaining a directory tree with per-file summaries.

### Key Features

- **Live Workspace Map** - Incrementally maintained directory tree with per-file summaries
- **Multi-Strategy Summarization** - Outline (zero cost), Model (AI-powered), LSP (precise)
- **Context Injection** - Injects workspace map into agent context with multiple strategies
- **Watch Mode** - Real-time file watching with polling fallback
- **Cost Tracking** - Token usage and estimated cost per summarizer
- **Export/Import** - Share workspace maps across sessions/agents
- **Monorepo Support** - Auto-detects pnpm, turbo, nx, lerna, rush workspaces
- **Generated File Detection** - Skips generated files automatically

## Installation

### Prerequisites

- OpenCode v2.x or later
- Node.js 20+ (for the plugin runtime)

### Install

Add to your OpenCode configuration:

```json
{
  "plugins": {
    "workspace-map": {
      "enabled": true
    }
  }
}
```

Or install as a local plugin:

```bash
npm install opencode-workspace-map
```

Then configure in your `opencode.json`:

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

## Quick Start

1. **Install the plugin** (see above)
2. **Restart OpenCode** - The plugin will automatically start indexing your workspace
3. **Start coding** - The agent now has structural awareness of your repository

## Next Steps

- [Installation](/guide/installation) - Detailed installation guide
- [Configuration](/guide/configuration) - All configuration options
- [How It Works](/guide/how-it-works) - Deep dive into the architecture