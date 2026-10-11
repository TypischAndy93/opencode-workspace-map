import type { Context } from "@opencode/plugin/promise/plugin"
import { promises as fs } from "node:fs"
import * as path from "node:path"
import { getChangedFiles } from "./fs/vcs.js"

export interface VCSIntegration {
  getChangedFilesCached(): Promise<string[]>
  detectGit(): Promise<boolean>
  toRel(input: unknown, root: string): string | undefined
}

export function createVCSIntegration(
  api: Context,
  root: string,
  vcsCache: { at: number; files: string[] },
  log: (msg: string, ...args: unknown[]) => void
): VCSIntegration {

  let vcsCacheLocal = vcsCache

  function toRel(input: unknown, rootDir: string): string | undefined {
    if (typeof input !== "string" || !input.trim()) return undefined
    const abs = path.isAbsolute(input) ? input : path.resolve(rootDir, input)
    const rel = path.relative(rootDir, abs)
    if (!rel || rel.startsWith("..")) return undefined
    return rel.split(path.sep).join("/")
  }

  async function getChangedFilesCached(): Promise<string[]> {
    if (vcsCacheLocal.at && Date.now() - vcsCacheLocal.at < 2_000) return vcsCacheLocal.files
    const files = await getChangedFiles(api, root, (input: unknown) => toRel(input, root))
    vcsCacheLocal = { at: Date.now(), files }
    return files
  }

  async function detectGit(): Promise<boolean> {
    let dir = root
    for (let i = 0; i < 8; i++) {
      try {
        await fs.stat(path.join(dir, ".git"))
        return true
      } catch {
        const parent = path.dirname(dir)
        if (parent === dir) break
        dir = parent
      }
    }
    return false
  }

  return {
    getChangedFilesCached,
    detectGit,
    toRel: (input: unknown) => toRel(input, root),
  }
}