import type { Context } from "@opencode/plugin/promise/plugin"

export interface VcsFileStatus {
  file: string
  additions: number
  deletions: number
  status: "added" | "deleted" | "modified"
}

export interface VcsStatusOutput {
  location: { directory: string }
  data: VcsFileStatus[]
}

export async function getChangedFiles(
  api: Context,
  root: string,
  toRel: (p: string) => string | undefined
): Promise<string[]> {
  try {
    const res = await api.vcs.status() as VcsStatusOutput
    const raw = res?.data ?? []
    const out: string[] = []
    for (const item of raw) {
      const p = item.file
      const rel = toRel(p)
      if (rel && !out.includes(rel)) out.push(rel)
    }
    return out
  } catch {
    return []
  }
}