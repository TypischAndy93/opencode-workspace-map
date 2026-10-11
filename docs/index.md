---
layout: home

hero:
  name: workspace-map
  text: An OpenCode Plugin for Workspace Awareness
  tagline: A live, cached map of your workspace — directory tree + per-file summaries
  image:
    src: /logo.svg
    alt: workspace-map logo
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/TypischAndy93/opencode-workspace-map

features:
  - title: 🗺️ Live Workspace Map
    details: Maintains an incrementally updated directory tree with per-file summaries for structural awareness of multi-file repositories.
  - title: 📝 Multi-Strategy Summarization
    details: Choose from Outline (zero cost), Model (AI-powered), or LSP (precise symbols) summarizers with graceful fallback chains.
  - title: 💉 Context Injection
    details: Injects workspace map into agent context with multiple strategies (first, changed, always) and formats (Markdown, JSON, both).
  - title: 👁️ Watch Mode
    details: Real-time file watching with fs.watch + 5s polling fallback, batching, and file deletion detection.
  - title: 💰 Cost Tracking
    details: Per-summarizer token usage and estimated USD cost tracking with periodic logging.
  - title: 📦 Export/Import
    details: Export/import workspace maps to share across sessions, agents, or team members.
  - title: 🏢 Monorepo Support
    details: Auto-detects pnpm, turbo, nx, lerna, rush workspaces with per-package maps.
  - title: 🚫 Generated File Detection
    details: Auto-detects and skips generated files (dist/, *.d.ts, *.min.js, etc.) with configurable patterns.
  - title: 💰 Cost Tracking
    details: Per-summarizer token usage and estimated USD cost tracking with periodic logging.