import type { Options, FileEntry } from "../config/index.ts"
import { createHash } from "node:crypto"

export interface TreeNode {
  name: string
  rel: string
  file: boolean
  generated?: boolean
  children: TreeNode[]
}

export function buildTree(files: string[], isGenerated?: (rel: string) => boolean): TreeNode {
  interface Node {
    name: string
    rel: string
    file: boolean
    generated?: boolean
    children: Map<string, Node>
  }
  const rootNode: Node = { name: "", rel: "", file: false, children: new Map() }
  for (const f of files) {
    const parts = f.split("/")
    let node = rootNode
    let rel = ""
    for (let i = 0; i < parts.length; i++) {
      const isFile = i === parts.length - 1
      rel = rel ? `${rel}/${parts[i]}` : parts[i]
      let child = node.children.get(parts[i])
      if (!child) {
        child = { name: parts[i], rel, file: isFile, generated: isFile && isGenerated?.(rel), children: new Map() }
        node.children.set(parts[i], child)
      }
      node = child
    }
  }

  const convert = (node: Node): TreeNode => ({
    name: node.name,
    rel: node.rel,
    file: node.file,
    generated: node.generated,
    children: [...node.children.values()].sort((a, b) => {
      if (a.file !== b.file) return a.file ? 1 : -1
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
    }).map(convert),
  })

  return convert(rootNode)
}

export function renderTree(
  files: string[],
  opts: Options,
  broadRoot: boolean,
  changedSet?: Set<string>,
  isGenerated?: (rel: string) => boolean
): string {
  const tree = buildTree(files, isGenerated)
  
  const lines: string[] = []
  let count = 0
  let truncated = false
  let depthTruncated = false
  const maxEntries = broadRoot ? Math.min(opts.maxTreeEntries, 100) : opts.maxTreeEntries
  const maxDepth = broadRoot ? 1 : opts.treeDepth

  const rec = (node: TreeNode, prefix: string, level: number): void => {
    if (truncated || level > maxDepth) {
      if (level > maxDepth && node.children.length) depthTruncated = true
      return
    }
    for (const child of node.children) {
      if (count >= maxEntries) {
        truncated = true
        return
      }
      const generatedMarker = child.file && child.generated ? " ⚙" : ""
      lines.push(
        prefix + child.name + generatedMarker + (child.file && changedSet?.has(child.rel) ? " ~" : "") + (child.file ? "" : "/"),
      )
      count++
      if (!child.file) rec(child, prefix + "  ", level + 1)
    }
  }
  rec(tree, "", 1)
  if (truncated || depthTruncated) {
    const bits: string[] = []
    if (truncated) bits.push("… (truncated)")
    if (depthTruncated) bits.push("… (tree depth limited)")
    lines.push(bits.join(" "))
  }
  return lines.join("\n")
}

export function renderJson(
  files: string[],
  changed: string[],
  cache: Map<string, FileEntry>,
  reverseDeps: Map<string, Set<string>>,
  opts: Options,
  broadRoot: boolean,
  stats?: { summaries: number; walks: number; files: number },
  isGenerated?: (rel: string) => boolean
): string {
  const tree = buildTree(files, isGenerated)
  
  const notes: Record<string, any> = {}
  for (const rel of files) {
    const e = cache.get(rel)
    if (e) {
      notes[rel] = {
        summary: e.summary,
        symbols: e.symbols,
        imports: e.imports,
        size: e.size,
        updatedAt: e.updatedAt,
        kind: e.kind,
        generated: e.kind === "generated",
        importedBy: reverseDeps.get(rel) ? [...reverseDeps.get(rel)!] : [],
        sections: e.sections,
      }
    }
  }

  const output = {
    version: "0.4.0",
    root: "",
    broadRoot,
    totalFiles: files.length,
    changedFiles: changed.length,
    changed: changed,
    tree,
    notes,
    reverseDeps: opts.includeReverseDeps ? Object.fromEntries(
      [...reverseDeps.entries()]
        .filter(([, importers]) => importers.size > 0)
        .map(([imported, importers]) => [imported, [...importers]])
    ) : undefined,
    stats: stats ? {
      summaries: stats.summaries,
      walks: stats.walks,
      files: stats.files,
    } : undefined,
  }

  return JSON.stringify(output, null, 2)
}

export function focusFiles(
  files: string[],
  changed: string[],
  sessionID: string | undefined,
  recentBySession: Map<string, Map<string, number>>,
  recentGlobal: Map<string, number>
): string[] {
  const set = new Set(files)
  const ordered: string[] = []
  const push = (rel: string) => {
    if (set.has(rel) && !ordered.includes(rel)) ordered.push(rel)
  }
  changed.forEach(push)
  const recent = sessionID ? recentBySession.get(sessionID) : undefined
  const source = recent && recent.size ? recent : recentGlobal
  ;[...source.entries()].sort((a, b) => b[1] - a[1]).forEach(([rel]) => push(rel))
  return ordered
}

export function mapRev(
  files: string[],
  changed: string[],
  cache: Map<string, FileEntry>
): string {
  let maxUpdated = 0
  for (const e of cache.values()) if (e.updatedAt > maxUpdated) maxUpdated = e.updatedAt
  return createHash("sha1").update(`${files.length}|${files.slice(0, 80).join(",")}|${changed.join(",")}|${maxUpdated}`).digest("hex").slice(0, 12)
}

export function renderReverseDeps(
  reverseDeps: Map<string, Set<string>>,
  files: string[],
  maxEntries: number = 50
): string {
  const lines: string[] = []
  const fileSet = new Set(files)
  let count = 0
  
  for (const [imported, importers] of reverseDeps) {
    if (count >= maxEntries) break
    if (!fileSet.has(imported)) continue
    if (importers.size === 0) continue
    
    const importerList = [...importers].filter(f => fileSet.has(f)).sort()
    if (importerList.length === 0) continue
    
    lines.push(`${imported} ← ${importerList.join(", ")}`)
    count++
  }
  
  if (count === 0) return ""
  return lines.join("\n")
}