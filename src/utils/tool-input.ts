import * as path from "node:path"

export interface ToolInput {
  filePath?: string
  file_path?: string
  path?: string
  files?: Array<string | { path?: string; filePath?: string }>
  filePaths?: string[]
  edits?: Array<{ filePath?: string; path?: string; file?: string; fileRelPath?: string }>
  patch?: string
  diff?: string
}

export function toRel(input: unknown, root: string): string | undefined {
  if (typeof input !== "string" || !input.trim()) return undefined
  const abs = path.isAbsolute(input) ? input : path.resolve(root, input)
  const rel = path.relative(root, abs)
  if (!rel || rel.startsWith("..")) return undefined
  return rel.split(path.sep).join("/")
}

export function relsFromInput(input: ToolInput, root: string): string[] {
  const out: string[] = []
  const pushRel = (p: unknown) => {
    const rel = toRel(p, root)
    if (rel && !out.includes(rel)) out.push(rel)
  }
  pushRel(input?.filePath ?? input?.file_path ?? input?.path)
  for (const f of input?.files ?? []) pushRel(typeof f === "string" ? f : f?.path ?? f?.filePath)
  for (const f of input?.filePaths ?? []) pushRel(f)
  for (const e of input?.edits ?? []) pushRel(e?.filePath ?? e?.path ?? e?.file ?? e?.fileRelPath)
  const patchText = typeof input?.patch === "string" ? input.patch : typeof input?.diff === "string" ? input.diff : ""
  if (patchText) {
    for (const m of patchText.matchAll(/^\*{3}\s+(?:Update File|Add File|Delete File)\s*:\s*(.+)$/gm)) {
      pushRel(m[1].trim())
    }
  }
  return out
}