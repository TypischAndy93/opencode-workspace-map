import type { Options, FileEntry } from "../config/index.ts"
import type { Context } from "@opencode/plugin/promise/plugin"
import { parseModelSummary } from "./index.ts"

export async function modelSummary(
  rel: string,
  content: string,
  api: Context,
  opts: Options,
  log: (...args: unknown[]) => void
): Promise<{ summary: string; symbols: string[]; inputTokens?: number; outputTokens?: number } | undefined> {
  if (isSecret(rel)) return undefined
  const model = await getModelRef(api, opts)
  if (!model) return undefined
  const body = content.length > 12_000 ? content.slice(0, 12_000) : content

  // Get per-extension summary length limit
  const ext = extOf(rel)
  const maxLength = opts.summaryLengthByExt?.[ext]
  const lengthGuide =
    maxLength
      ? `In approximately ${Math.round(maxLength / 6)} words`
      : opts.summaryLength === "short"
        ? "In 1 sentence"
        : opts.summaryLength === "long"
          ? "In 4-5 sentences"
          : "In 2-3 sentences"

  try {
    const res = await api.generate.text({
      model,
      prompt:
        `You are indexing a code repository. ${lengthGuide} describe this file's purpose, ` +
        "its key exports, and which other modules it likely interacts with. Then on a new " +
        `line beginning "Symbols:" list up to 12 key exported symbols.\n\nFile: ${rel}\n\n\`\`\`\n${body}\n\`\`\``,
    })
    const parsed = parseModelSummary(res?.text ?? "")
    if (parsed.summary && maxLength && parsed.summary.length > maxLength) {
      parsed.summary = parsed.summary.slice(0, maxLength - 1) + "\u2026"
    }
    
    // Estimate token usage (approximate: 1 token ≈ 4 chars for English)
    const promptTokens = Math.ceil((body.length + 200) / 4) // prompt + template
    const responseTokens = Math.ceil((res?.text?.length ?? 0) / 4)
    
    return parsed.summary ? { ...parsed, inputTokens: promptTokens, outputTokens: responseTokens } : undefined
  } catch (err) {
    log("model summary failed", rel, err)
    return undefined
  }
}

let modelRefCache: { providerID: string; id: string } | undefined

async function getModelRef(api: Context, opts: Options): Promise<{ providerID: string; id: string } | undefined> {
  if (opts.summaryModel) return opts.summaryModel
  if (modelRefCache) return modelRefCache
  try {
    const d: any = await api.model.default()
    const info = d?.data ?? d
    if (info?.providerID && (info.id || info.modelID)) {
      modelRefCache = { providerID: info.providerID, id: info.id ?? info.modelID }
      return modelRefCache
    }
  } catch {
    /* ignore */
  }
  return undefined
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

function extOf(rel: string): string {
  const i = rel.lastIndexOf(".")
  return i >= 0 ? rel.slice(i + 1).toLowerCase() : ""
}