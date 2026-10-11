# CI/CD Pipeline

## Overview

This project uses GitHub Actions for continuous integration and deployment.

## Workflows

### CI (`.github/workflows/ci.yml`)

Runs on every push and PR to `main`:

1. **Test Matrix** - Tests on Node.js 20 and 22
   - Type checking (`npm run typecheck`)
   - Unit tests (`npx vitest run`)
   - Integration tests (`npm test`)

2. **Benchmark** (main branch only)
   - Runs performance benchmarks on every push to main

3. **Release** (on version tags)
   - Publishes to npm
   - Creates GitHub Release

3. **Notify** - Reports overall status

### Release Workflow (`.github/workflows/release.yml`)

Manual workflow dispatch for version bumping:

```bash
# Trigger manually via GitHub UI or:
gh workflow run release.yml -f version=patch  # or minor, major, prerelease
```

This workflow:
1. Runs all tests
2. Bumps version using `npm run release:<type>`
3. Pushes changes and tags
4. Publishes to npm (if not prerelease)
4. Creates GitHub Release with auto-generated notes

## Dependabot

Configured in `.github/dependabot.yml`:
- Weekly updates on Mondays
- Groups dev and production dependencies separately
- Auto-merges patch updates (configured in repo settings)

## Local Release Commands

```bash
# Bump patch version (0.4.2 -> 0.4.3)
npm run release:patch

# Bump minor version (0.4.2 -> 0.5.0)
npm run release:minor

# Bump major version (0.4.2 -> 1.0.0)
npm run release:major

# Bump prerelease (0.4.2 -> 0.4.3-beta.1)
npm run release:prerelease

# Dry run (preview changes)
npm run release:dry-run -- patch
```

## Required Secrets

Configure in GitHub repository settings:

| Secret | Description |
|--------|-------------|
| `NPM_TOKEN` | npm authentication token for publishing |
| `GITHUB_TOKEN` | Auto-provided by GitHub Actions |

## Status Badges

Add to README.md:

```markdown
![CI](https://github.com/TypischAndy93/opencode-workspace-map/workflows/CI/badge.svg)
![Release](https://github.com/TypischAndy93/opencode-workspace-map/workflows/Release/badge.svg)
[![npm version](https://badge.fury.io/js/opencode-workspace-map.svg)](https://www.npmjs.com/package/opencode-workspace-map)
```