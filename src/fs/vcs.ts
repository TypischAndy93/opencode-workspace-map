import type { Context } from "@opencode/plugin/promise/plugin"
import { withRetry, RETRY_PRESETS } from "../utils/retry.js"

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
    const res = await withRetry(
      () => api.vcs.status() as Promise<VcsStatusOutput>,
      RETRY_PRESETS.vcs
    )
    const raw = res?.data ?? []
    const out: string[] = []
    for (const item of raw) {
      const p = item.file
      const rel = toRel(p)
      if (rel && !out.includes(rel)) out.push(rel)
    }
    return out
  } catch (err) {
    console.error("[workspace-map] vcs status failed", err)
    return []
  }
}