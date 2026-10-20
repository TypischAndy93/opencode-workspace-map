import type { Options, FileEntry, Stats, SummarySections, Logger, LspClient } from "../config/index.ts"
import type { Context } from "@opencode/plugin/promise/plugin"
import { withRetry, RETRY_PRESETS } from "../utils/retry.js"
import { extOf, isSecret } from "../utils/file.ts"

interface LspDocumentSymbolParams {
  textDocument: { uri: string }
}

interface LspDocumentSymbolResult {
  name: string
  kind: number
  range?: { start: { line: number; character: number }; end: { line: number; character: number } }
  selectionRange?: { start: { line: number; character: number }; end: { line: number; character: number } }
  children?: LspDocumentSymbolResult[]
  deprecated?: boolean
}

interface LspHoverParams {
  textDocument: { uri: string }
  position: { line: number; character: number }
}

interface LspSymbolLocation {
  name: string
  kind?: string
  line?: number
  character?: number
}

export async function lspSummarize(
  rel: string,
  content: string,
  api: Context,
  opts: Options,
  stats: Stats,
  log: Logger
): Promise<{ summary: string; symbols: Array<{ name: string; kind?: string; line?: number; character?: number }>; imports: string[]; sections?: SummarySections } | undefined> {
  if (isSecret(rel)) return undefined

  const ext = extOf(rel)
  const supportedExts = new Set(["ts", "tsx", "js", "jsx", "py", "go", "rs", "java", "kt", "cs", "cpp", "cc", "c", "h", "hpp", "php", "rb", "swift", "kt"])
  if (!supportedExts.has(ext)) return undefined

  try {
    const symbols = await getLSPSymbols(rel, api, opts, log)
    const imports = await getLSPImports(rel, api, opts, log)

    if (!symbols.length && !imports.length) return undefined

    const bits = [`${ext} file`, `${content.split(/\r?\n/).length} lines`]
    if (symbols.length) bits.push(`exports: ${symbols.slice(0, 12).map(s => s.name).join(", ")}`)
    if (imports.length) bits.push(`imports: ${imports.slice(0, 8).join(", ")}`)

    return {
      summary: bits.join(" · "),
      symbols: symbols.map(s => ({ name: s.name, kind: s.kind })),
      imports,
    }
  } catch (err) {
    log.error("lsp summary failed", { rel, error: err })
    return undefined
  }
}

async function getLSPSymbols(
  rel: string,
  api: Context,
  opts: Options,
  log: Logger
): Promise<LspSymbolLocation[]> {
  // Check if LSP is available on the context
  const lsp = (api as unknown as { lsp?: LspClient }).lsp
  if (!lsp?.documentSymbols) {
    log.debug("LSP not available, skipping symbols")
    return []
  }

  try {
    const result = await withRetry(
      async () => {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), opts.lspTimeoutMs ?? 5000)

        try {
          const result = await lsp.documentSymbols(
            { textDocument: { uri: `file://${rel}` } } as LspDocumentSymbolParams,
            { signal: controller.signal }
          )

          clearTimeout(timeout)
          return result
        } catch (err) {
          clearTimeout(timeout)
          throw err
        }
      },
      RETRY_PRESETS.lsp
    )

    if (!result) return []

    const symbols: LspSymbolLocation[] = []
    const maxSymbols = opts.lspMaxSymbols ?? 50

    function extractSymbols(items: LspDocumentSymbolResult[]) {
      for (const item of items) {
        if (symbols.length >= maxSymbols) break
        if (item.name && typeof item.name === "string") {
          const kind = item.kind
          // Filter for exported-like symbols (functions, classes, interfaces, etc.)
          const exportedKinds = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26]
          if (exportedKinds.includes(kind) || item.deprecated !== true) {
            const location = item.selectionRange ?? item.range
            symbols.push({
              name: item.name,
              kind: LSP_SYMBOL_KIND[kind],
              line: location?.start.line,
              character: location?.start.character,
            })
          }
        }
        if (item.children) extractSymbols(item.children)
      }
    }

    extractSymbols(result as LspDocumentSymbolResult[])
    return symbols
  } catch (err) {
    if ((err as Error)?.name !== "AbortError") {
      log.error("lsp documentSymbols failed", { rel, error: err })
    }
    return []
  }
}

// LSP SymbolKind -> our SymbolInfo kind mapping
const LSP_SYMBOL_KIND: Record<number, string> = {
  1: "file",
  2: "module",
  3: "namespace",
  4: "package",
  5: "class",
  6: "method",
  7: "property",
  8: "field",
  9: "constructor",
  10: "enum",
  11: "interface",
  12: "function",
  13: "variable",
  14: "constant",
  15: "string",
  16: "number",
  17: "boolean",
  18: "array",
  19: "object",
  20: "key",
  21: "null",
  22: "enummember",
  23: "struct",
  24: "event",
  25: "operator",
  26: "typeparameter",
}

async function getLSPImports(
  rel: string,
  api: Context,
  opts: Options,
  log: Logger
): Promise<string[]> {
  // Check if LSP is available on the context
  const lsp = (api as unknown as { lsp?: LspClient }).lsp
  if (!lsp?.hover) {
    log.debug("LSP not available, skipping imports")
    return []
  }

  try {
    await withRetry(
      async () => {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), opts.lspTimeoutMs ?? 5000)

        try {
          await lsp.hover(
            { textDocument: { uri: `file://${rel}` }, position: { line: 0, character: 0 } } as LspHoverParams,
            { signal: controller.signal }
          )

          clearTimeout(timeout)
        } catch (err) {
          clearTimeout(timeout)
          throw err
        }
      },
      RETRY_PRESETS.lsp
    )

    return []
  } catch (err) {
    if ((err as Error)?.name !== "AbortError") {
      log.error("lsp imports failed", { rel, error: err })
    }
    return []
  }
}