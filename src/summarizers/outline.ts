import type { FileEntry, Options, Stats, SymbolRule, SummarySectionConfig, SummarySections } from "../config/index.ts"
import { extOf, familyOf, dataSummary, codeSummary } from "./index.ts"

export async function outlineSummarize(
  rel: string,
  content: string,
  opts: Options,
  stats: Stats
): Promise<{ summary: string; symbols: Array<{ name: string; kind?: string }>; imports: string[]; sections?: SummarySections }> {
  const ext = extOf(rel)
  const family = familyOf(ext)
  const maxLength = opts.summaryLengthByExt?.[ext]
  if (family === "data") {
    const { summary, symbols } = dataSummary(content, ext)
    let finalSummary = summary
    if (maxLength && finalSummary.length > maxLength) finalSummary = finalSummary.slice(0, maxLength - 1) + "…"
    return { summary: finalSummary, symbols: symbols.map(s => ({ name: s })), imports: [] }
  }
  if (family === "code" || family === "js" || family === "py" || family === "go" || family === "rust" || family === "jvm") {
    return codeSummary(content, ext, opts.summarySections, maxLength)
  }
  let summary = `${ext || "text"} file · ${content.split(/\r?\n/).length} lines`
  if (maxLength && summary.length > maxLength) summary = summary.slice(0, maxLength - 1) + "…"
  return { summary, symbols: [], imports: [] }
}