import type { Options, FileEntry, Stats, ProjectInfo } from "../config/index.ts"
import type { Context } from "@opencode/plugin/promise/plugin"
import { TOOL_NAME } from "../config/index.ts"
import { renderTree, focusFiles, mapRev, renderReverseDeps, renderJson } from "../injection/render.ts"

export async function buildFullMapping(
  api: Context,
  opts: Options,
  stats: Stats,
  cache: Map<string, FileEntry>,
  reverseDeps: Map<string, Set<string>>,
  root: string,
  broadRoot: boolean,
  sessionID: string | undefined,
  listFiles: (force: boolean) => Promise<string[]>,
  getChangedFiles: () => Promise<string[]>,
  summarizeMany: (rels: string[], force: boolean) => Promise<void>,
  recentBySession: Map<string, Map<string, number>>,
  recentGlobal: Map<string, number>,
  project: ProjectInfo,
  isGenerated?: (rel: string) => boolean,
  cachedTree?: import("../injection/render.ts").TreeNode
): Promise<string> {
  const files = await listFiles(false)
  const changed = await getChangedFiles()
  const focus = focusFiles(files, changed, sessionID, recentBySession, recentGlobal)
  const target = opts.inject === "full" ? files.slice(0, opts.maxSummaries) : focus.slice(0, opts.maxSummaries)

  // Refresh target notes synchronously so the injected map reflects reality
  // instead of "(indexing…)" — outline mode only. A model summarizer would
  // block the context hook on up to maxSummaries generate.text calls, so it
  // is enqueued instead (and never runs for inject:"tree", where notes are
  // not rendered anyway).
  if (target.length && opts.inject !== "tree") {
    if (opts.summarizer === "outline") {
      for (const rel of target) await summarizeMany([rel], false)
    } else {
      // Model summarizer: enqueue in background
      const { enqueue } = await import("../utils/enqueue.ts")
      enqueue(async () => {
        for (const rel of target) await summarizeMany([rel], false)
      }).catch(() => undefined)
    }
  }

  const header = [
    "# Workspace map",
    `Root: ${root}`,
    `${files.length} file${files.length === 1 ? "" : "s"}${changed.length ? ` · ${changed.length} changed` : ""}`,
  ]
  
  // Monorepo info
  if (project.isMonorepo) {
    header.push(`Monorepo: ${project.monorepoType} (${project.packages.length} packages)`)
    header.push(`Packages: ${project.packages.map(p => p.name).join(", ")}`)
  }
  
  // Use cached tree if available, otherwise build from files
  const parts: string[] = [...header, "", renderTree(files, opts, broadRoot, new Set(changed), isGenerated, cachedTree)]

  if (target.length && opts.inject !== "tree") {
    parts.push("", "## File notes")
    for (const rel of target) {
      const e = cache.get(rel)
      parts.push(`- ${rel}: ${e?.summary ?? "(indexing…)"}`)
    }
  }

  if (opts.registerTool) {
    parts.push("", `Use the ${TOOL_NAME} tool to inspect the full structure or fetch per-file summaries on demand.`)
  }

  // Reverse dependencies section (markdown only)
  if (opts.includeReverseDeps && opts.injectionFormat !== "json" && reverseDeps.size > 0) {
    const revText = renderReverseDeps(reverseDeps, files)
    if (revText) {
      parts.push("", "## Reverse dependencies", revText)
    }
  }

  // Handle JSON output
  if (opts.injectionFormat === "json" || opts.injectionFormat === "both") {
    const jsonOutput = renderJson(files, changed, cache, reverseDeps, opts, broadRoot, stats, isGenerated, cachedTree)
    if (opts.injectionFormat === "json") {
      return jsonOutput
    }
    // For "both", append JSON after markdown
    parts.push("", "---", "## JSON Output", "```json", jsonOutput, "```")
  }

  let text = parts.join("\n")
  if (text.length > opts.maxInjectedChars) {
    text = text.slice(0, opts.maxInjectedChars) + "\n… (workspace map truncated; use the workspace_map tool for detail)"
  }
  return text
}

export function buildDigest(
  files: string[],
  changed: string[],
  cache: Map<string, FileEntry>,
  broadRoot: boolean
): string {
  const bits = [`Workspace map available: ${files.length} files`]
  if (changed.length) {
    const clip = (s: string) => (s.length > 44 ? s.slice(0, 44) + "…" : s)
    const listed = changed
      .slice(0, 4)
      .map((rel) => {
        const e = cache.get(rel)
        return e?.summary ? `${rel} (${clip(e.summary)})` : rel
      })
      .join(", ")
    bits.push(`${changed.length} changed: ${listed}${changed.length > 4 ? ", …" : ""}`)
  }
  if (broadRoot) bits.push("(large root; using on-demand lookup)")
  bits.push(`Call ${TOOL_NAME} for the tree and per-file summaries.`)
  return bits.join(" · ")
}

export function buildInjectionRev(
  files: string[],
  changed: string[],
  cache: Map<string, FileEntry>
): string {
  return mapRev(files, changed, cache)
}