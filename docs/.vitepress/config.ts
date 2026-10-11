import { defineConfig } from 'vitepress'
import { fileURLToPath } from 'node:url'
import { dirname, resolve as pathResolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  lang: 'en-US',
  title: 'workspace-map',
  description: 'An OpenCode plugin that keeps a live, cached map of the workspace',
  head: [
    ['link', { rel: 'icon', href: '/favicon.svg' }],
    ['meta', { name: 'theme-color', content: '#3c8772' }],
  ],

  themeConfig: {
    logo: '/logo.svg',
    siteTitle: 'workspace-map',

    nav: [
      { text: 'Guide', link: '/guide/getting-started', activeMatch: '/guide/' },
      { text: 'Reference', link: '/reference/configuration', activeMatch: '/reference/' },
      { text: 'API', link: '/api/overview', activeMatch: '/api/' },
      { text: 'Examples', link: '/examples/basic', activeMatch: '/examples/' },
      {
        text: 'v0.4.2',
        items: [
          { text: 'Changelog', link: 'https://github.com/TypischAndy93/opencode-workspace-map/blob/main/CHANGELOG.md' },
          { text: 'GitHub', link: 'https://github.com/TypischAndy93/opencode-workspace-map' },
          { text: 'npm', link: 'https://www.npmjs.com/package/opencode-workspace-map' },
        ],
      },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Introduction', link: '/guide/getting-started' },
            { text: 'Installation', link: '/guide/installation' },
            { text: 'Configuration', link: '/guide/configuration' },
            { text: 'How It Works', link: '/guide/how-it-works' },
          ],
        },
        {
          text: 'Core Concepts',
          items: [
            { text: 'Workspace Map', link: '/guide/workspace-map' },
            { text: 'Summarizers', link: '/guide/summarizers' },
            { text: 'Injection Modes', link: '/guide/injection-modes' },
            { text: 'Watch Mode', link: '/guide/watch-mode' },
            { text: 'Cost Tracking', link: '/guide/cost-tracking' },
          ],
        },
        {
          text: 'Advanced',
          items: [
            { text: 'Monorepo Support', link: '/guide/monorepo' },
            { text: 'Generated Files', link: '/guide/generated-files' },
            { text: 'Performance Tuning', link: '/guide/performance' },
            { text: 'Troubleshooting', link: '/guide/troubleshooting' },
          ],
        },
      ],
      '/reference/': [
        {
          text: 'Configuration',
          items: [
            { text: 'Configuration Options', link: '/reference/configuration' },
            { text: 'Environment Variables', link: '/reference/env-vars' },
            { text: 'Default Values', link: '/reference/defaults' },
          ],
        },
        {
          text: 'CLI Commands',
          items: [
            { text: 'workspace-map:dump', link: '/reference/cli-dump' },
            { text: 'workspace-map:stats', link: '/reference/cli-stats' },
            { text: 'workspace-map:validate', link: '/reference/cli-validate' },
            { text: 'workspace-map:clear-cache', link: '/reference/cli-clear-cache' },
            { text: 'workspace-map:watch', link: '/reference/cli-watch' },
            { text: 'workspace-map:export', link: '/reference/cli-export' },
            { text: 'workspace-map:import', link: '/reference/cli-import' },
          ],
        },
        {
          text: 'Injection Formats',
          items: [
            { text: 'Markdown Format', link: '/reference/injection-markdown' },
            { text: 'JSON Format', link: '/reference/injection-json' },
            { text: 'Both Format', link: '/reference/injection-both' },
          ],
        },
      ],
      '/api/': [
        {
          text: 'API Reference',
          items: [
            { text: 'Overview', link: '/api/overview' },
            { text: 'Plugin Entry Point', link: '/api/plugin-entry' },
            { text: 'Configuration Types', link: '/api/config-types' },
            { text: 'Summarizer Interface', link: '/api/summarizer-interface' },
            { text: 'Storage API', link: '/api/storage' },
            { text: 'Injection API', link: '/api/injection' },
          ],
        },
        {
          text: 'Summarizers',
          items: [
            { text: 'Outline Summarizer', link: '/api/summarizer-outline' },
            { text: 'Model Summarizer', link: '/api/summarizer-model' },
            { text: 'LSP Summarizer', link: '/api/summarizer-lsp' },
          ],
        },
        {
          text: 'Utilities',
          items: [
            { text: 'Filter System', link: '/api/filter' },
            { text: 'Cache System', link: '/api/cache' },
            { text: 'Tree Rendering', link: '/api/tree-rendering' },
          ],
        },
      ],
      '/examples/': [
        {
          text: 'Basic Usage',
          items: [
            { text: 'Basic Setup', link: '/examples/basic' },
            { text: 'Monorepo Setup', link: '/examples/monorepo' },
            { text: 'Custom Summarizer', link: '/examples/custom-summarizer' },
          ],
        },
        {
          text: 'Advanced',
          items: [
            { text: 'Custom Injection', link: '/examples/custom-injection' },
            { text: 'Watch Mode Config', link: '/examples/watch-mode' },
            { text: 'Cost Tracking Setup', link: '/examples/cost-tracking' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/TypischAndy93/opencode-workspace-map' },
      { icon: 'npm', link: 'https://www.npmjs.com/package/opencode-workspace-map' },
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2024-present Andy',
    },

    search: {
      provider: 'local',
      options: {
        detailedView: true,
      },
    },

    editLink: {
      pattern: 'https://github.com/TypischAndy93/opencode-workspace-map/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },

    lastUpdated: true,
    lastUpdatedText: 'Last updated',
  },

  markdown: {
    theme: {
      light: 'github-light',
      dark: 'github-dark',
    },
    lineNumbers: true,
    toc: { level: [2, 3] },
  },

  vite: {
    resolve: {
      alias: {
        '@': pathResolve(__dirname, '..'),
      },
    },
  },
})

function resolve(dir: string) {
  return resolve(__dirname, dir)
}