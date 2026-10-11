# Custom Summarizer

## Overview

workspace-map allows creating custom summarizers by implementing the `Summarizer` interface.

## Interface

```typescript
interface Summarizer {
  kind: "outline" | "model" | "lsp" | "custom"
  summarize(
    rel: string,
    content: string,
    api: Context,
    opts: Options,
    stats: Stats,
    log: (...args: unknown[]) => void
  ): Promise<{
    summary: string
    symbols: Array<{ name: string; kind?: string }>
    imports: string[]
    sections?: SummarySections
  }>
}
```

## Example: JSON Summarizer

```typescript
// json-summarizer.ts
import type { Summarizer, Options, Stats, FileEntry, SummarySections } from "../config/index.ts"
import type { Context } from "@opencode/plugin/promise/plugin"

export const jsonSummarizer: Summarizer = {
  kind: "custom",
  async summarize(rel, content, api, opts, stats, log) {
    if (!rel.endsWith(".json")) return undefined
    
    try {
      const parsed = JSON.parse(content)
      const keys = Object.keys(parsed).slice(0, 20)
      
      return {
        summary: `JSON file with ${Object.keys(parsed).length} keys: ${keys.join(", ")}`,
        symbols: keys.map(k => ({ name: k, kind: "property" })),
        imports: [],
        sections: {
          keyExports: keys.map(k => ({ name: k, kind: "property" }))
        }
      }
    } catch {
      return undefined
    }
  }
}
```

## Registration

```typescript
// In plugin setup
import { jsonSummarizer } from "./json-summarizer.ts"

// Add to summarizer chain
const summarizers = {
  outline: outlineSummarize,
  model: modelSummary,
  lsp: lspSummarize,
  json: jsonSummarizer, // custom
}

// In summarize function
for (const summarizer of fallbackChain) {
  const fn = summarizers[summarizer]
  if (fn) {
    const result = await fn(rel, content, api, opts, stats, log)
    if (result) return result
  }
}
```

## Registration via Plugin

```typescript
// custom-plugin.ts
import { Plugin } from "@opencode/plugin"

export default Plugin.define({
  id: "custom-summarizers",
  async setup(api) {
    // Register custom summarizer
    // This would need integration with workspace-map's summarizer registry
  }
})
```

## Advanced: Language-Specific

```typescript
// rust-summarizer.ts
export const rustSummarizer: Summarizer = {
  kind: "custom",
  async summarize(rel, content, api, opts, stats, log) {
    if (!rel.endsWith(".rs")) return undefined
    
    // Custom Rust-specific parsing
    const structs = extractStructs(content)
    const enums = extractEnums(content)
    const traits = extractTraits(content)
    const impls = extractImpls(content)
    const functions = extractFunctions(content)
    
    const symbols = [
      ...structs.map(s => ({ name: s, kind: "struct" })),
      ...enums.map(e => ({ name: e, kind: "enum" })),
      ...traits.map(t => ({ name: t, kind: "trait" })),
      ...impls.map(i => ({ name: i, kind: "impl" })),
      ...functions.map(f => ({ name: f, kind: "function" }))
    ]
    
    return {
      summary: `Rust module with ${structs.length} structs, ${enums.length} enums, ${functions.length} functions`,
      symbols,
      imports: extractImports(content),
      sections: {
        keyExports: symbols.slice(0, 12)
      }
    }
  }
}

function extractStructs(content: string): string[] {
  const regex = /^\s*(?:pub\s+)?struct\s+(\w+)/gm
  const matches = []
  let match
  while ((match = regex.exec(content)) !== null) {
    matches.push(match[1])
  }
  return matches
}
// ... similar for enums, traits, impls, functions
```

## Registration in workspace-map

Currently, custom summarizers require modifying workspace-map source. Future versions may support plugin registration API.

## Best Practices

1. **Return undefined** for unsupported files
2. **Handle errors gracefully** - return undefined on parse failure
3. **Limit symbols** - Return max 12 key exports
4. **Include imports** - Helpful for dependency tracking
5. **Use sections** - Structured output for injection
5. **Handle errors** - Never throw, return undefined
6. **Be fast** - Avoid blocking operations