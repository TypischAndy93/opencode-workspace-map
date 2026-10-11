import type { Options, FileEntry, Stats, SummarySections } from "../config/index.ts"
import type { Context } from "@opencode/plugin/promise/plugin"

export async function lspSummarize(
  rel: string,
  content: string,
  api: Context,
  opts: Options,
  stats: Stats,
  log: (...args: unknown[]) => void
): Promise<{ summary: string; symbols: Array<{ name: string; kind?: string }>; imports: string[]; sections?: SummarySections } | undefined> {
  if (isSecret(rel)) return undefined

  const ext = extOf(rel)
  const supportedExts = new Set(["ts", "tsx", "js", "jsx", "py", "go", "rs", "java", "kt", "cs", "cpp", "cc", "c", "h", "hpp", "php", "rb", "swift", "kt"])
  if (!supportedExts.has(ext)) return undefined

  try {
    const symbols = await getLSPSymbols(rel, api, opts, log)
    const imports = await getLSPImports(rel, api, opts, log)

    if (!symbols.length && !imports.length) return undefined

    const bits = [`${ext} file`, `${content.split(/\r?\n/).length} lines`]
    if (symbols.length) bits.push(`exports: ${symbols.slice(0, 12).join(", ")}`)
    if (imports.length) bits.push(`imports: ${imports.slice(0, 8).join(", ")}`)

    return {
      summary: bits.join(" · "),
      symbols: symbols.map(s => ({ name: s })),
      imports,
    }
  } catch (err) {
    log("lsp summary failed", rel, err)
    return undefined
  }
}

async function getLSPSymbols(
  rel: string,
  api: Context,
  opts: Options,
  log: (...args: unknown[]) => void
): Promise<string[]> {
  try {
    // Check if LSP is available on the context
    const lsp = (api as any).lsp
    if (!lsp?.documentSymbols) {
      log("LSP not available, skipping symbols")
      return []
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), opts.lspTimeoutMs ?? 5000)

    const result = await lsp.documentSymbols({
      textDocument: { uri: `file://${rel}` },
    }, { signal: controller.signal })

    clearTimeout(timeout)

    if (!result) return []

    const symbols: string[] = []
    const maxSymbols = opts.lspMaxSymbols ?? 50

    function extractSymbols(items: any[]) {
      for (const item of items) {
        if (symbols.length >= maxSymbols) break
        if (item.name && typeof item.name === "string") {
          const kind = item.kind
          // Filter for exported-like symbols (functions, classes, interfaces, etc.)
          const exportedKinds = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26]
          if (exportedKinds.includes(kind) || item.deprecated !== true) {
            symbols.push(item.name)
          }
        }
        if (item.children) extractSymbols(item.children)
      }
    }

    extractSymbols(result)
    return [...new Set(symbols)].slice(0, maxSymbols)
  } catch (err) {
    if ((err as any)?.name !== "AbortError") {
      log("lsp documentSymbols failed", rel, err)
    }
    return []
  }
}

async function getLSPImports(
  rel: string,
  api: Context,
  opts: Options,
  log: (...args: unknown[]) => void
): Promise<string[]> {
  try {
    // Check if LSP is available on the context
    const lsp = (api as any).lsp
    if (!lsp?.hover) {
      log("LSP not available, skipping imports")
      return []
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), opts.lspTimeoutMs ?? 5000)

    // Try to get imports via LSP - this depends on the LSP implementation
    // Some LSPs support textDocument/references or textDocument/definition
    // For now, we'll use a simple approach: get the document and parse imports
    // This is a fallback - LSP doesn't have a standard "get imports" method
    const result = await lsp.hover({
      textDocument: { uri: `file://${rel}` },
      position: { line: 0, character: 0 },
    }, { signal: controller.signal })

    clearTimeout(timeout)
    return []
  } catch (err) {
    if ((err as any)?.name !== "AbortError") {
      log("lsp imports failed", rel, err)
    }
    return []
  }
}

function extOf(rel: string): string {
  const i = rel.lastIndexOf(".")
  return i >= 0 ? rel.slice(i + 1).toLowerCase() : ""
}

function isSecret(rel: string): boolean {
  const base = (rel.split("/").pop() ?? rel).toLowerCase()
  if (base === ".env" || base.startsWith(".env.") || base.startsWith(".env-")) return true
  const ext = "." + extOf(base)
  const SECRET_EXT = new Set([".pem", ".key", ".p12", ".pfx", ".jks", ".keystore", ".asc", ".gpg", ".ppk", ".kdbx", ".der"])
  if (SECRET_EXT.has(ext)) return true
  const stem = base.includes(".") ? base.slice(0, base.lastIndexOf(".")) : base
  const SECRET_STEM = /^(\.netrc|\.npmrc|\.pypirc|\.htpasswd|env|credentials|secrets?|token|tokens|password|passwd|private[_-]?key|api[_-]?key|apikey|id_rsa|id_dsa|id_ecdsa|id_ed25519|keystore|adbkey)$/i
  const SECRET_STEM_EXT = new Set([".json", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".conf", ".properties", ".txt", ".sh", ".xml", ".csv", ".log"])
  if (SECRET_STEM.test(stem)) return ext === "." || SECRET_STEM_EXT.has(ext)
  return false
}