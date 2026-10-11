# Summarizer Outline

## Overview

Zero-cost summarizer using regex-based parsing.

## API

```typescript
export async function outlineSummarize(
  rel: string,
  content: string,
  opts: Options,
  stats: Stats
): Promise<{
  summary: string
  symbols: Array<{ name: string; kind?: string }>
  imports: string[]
  sections?: SummarySections
}>
```

## Behavior

1. Detects language by extension
2. Uses language-specific regex patterns
3. Extracts symbols (functions, classes, interfaces, etc.)
4. Collects imports/dependencies
5. Extracts leading documentation
6. Builds structured sections

## Language Support

| Language | Extensions | Symbol Kinds |
|----------|------------|--------------|
| TypeScript | .ts, .tsx | functions, classes, interfaces, types, enums |
| JavaScript | .js, .jsx, .mjs, .cjs | functions, classes, const/let/var |
| Python | .py | functions, classes, imports |
| Go | .go | functions, types, imports |
| Rust | .rs | functions, structs, enums, traits |
| Java/Kotlin | .java, .kt | classes, methods, interfaces |
| C/C++ | .c, .cc, .cpp, .h | functions, structs, includes |
| C# | .cs | classes, methods, properties |
| Ruby | .rb | classes, modules, methods |
| PHP | .php | functions, classes, traits |
| Swift | .swift | functions, structs, classes |
| Dart | .dart | functions, classes, mixins |
| Lua | .lua | functions, tables |
| Shell | .sh, .bash, .zsh | functions, variables |
| SQL | .sql | tables, views, procedures |

## Output

```markdown
## File notes
- src/components/Button.tsx: React component · exports: Button, ButtonProps · imports: react, ./hooks
- src/lib/utils.ts: Utility functions · exports: cn, formatDate, clamp · imports: none
```

## Configuration

```json
{
  "summarySections": {
    "includePurpose": true,
    "includeKeyExports": true,
    "includeDependencies": true,
    "includeTodos": true,
    "maxPurposeLength": 120,
    "maxExports": 12,
    "maxDependencies": 15,
    "maxTodos": 8
  }
}
```