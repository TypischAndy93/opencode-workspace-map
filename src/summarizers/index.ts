import type { Options, FileEntry, Stats } from "../config/index.ts"
import type { Context } from "@opencode/plugin/promise/plugin"

export interface Summarizer {
  kind: "outline" | "model" | "lsp"
  summarize(
    rel: string,
    content: string,
    api: Context,
    opts: Options,
    stats: Stats,
    log: (...args: unknown[]) => void
  ): Promise<{ summary: string; symbols: string[]; imports: string[] }>
}

// Re-export summarizers
export { outlineSummarize } from "./outline.ts"
export { modelSummary } from "./model.ts"
export { lspSummarize } from "./lsp.ts"

// Re-export utilities (directly from source modules to avoid circular deps)
export { 
  extOf, 
  familyOf, 
  leadingDoc, 
  collectSymbols, 
  collectImports, 
  dataSummary, 
  codeSummary,
  parseModelSummary,
  extractTodos,
  extractPurpose
} from "./utils.ts"

// Re-export symbols utilities
export { 
  collectSymbols as collectSymbolsForFile, 
  getSymbolRules 
} from "./symbols.ts"

// Re-export imports utilities
export { collectImports as collectImportsForFile } from "./imports.ts"

// Re-export doc-comments utilities
export { leadingDoc as extractLeadingDoc } from "./doc-comments.ts"