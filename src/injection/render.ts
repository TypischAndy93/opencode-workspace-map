import type { Options, FileEntry } from "../config/index.ts"
import { createHash } from "node:crypto"
import { VERSION } from "../version.ts"

export interface TreeNode {
  name: string
  rel: string
  file: boolean
  generated?: boolean
  children: TreeNode[]
}

// Internal mutable node for tree building
interface MutableNode {
  name: string
  rel: string
  file: boolean
  generated?: boolean
  children: Map<string, MutableNode>
}

export function buildTree(files: string[], isGenerated?: (rel: string) => boolean): TreeNode {
  const rootNode: MutableNode = { name: "", rel: "", file: false, children: new Map() }
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

  const convert = (node: MutableNode): TreeNode => ({
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

/**
 * Create a new mutable node
 */
export function createMutableNode(name: string, rel: string, file: boolean, generated?: boolean): MutableNode {
  return { name, rel, file, generated, children: new Map() }
}

/**
 * Add a path to a mutable node (internal function)
 */
export function addPathToMutableNode(node: MutableNode, rel: string, isGenerated?: (rel: string) => boolean): void {
  const parts = rel.split("/")
  let current = node
  let currentRel = ""
  for (let i = 0; i < parts.length; i++) {
    const isFile = i === parts.length - 1
    currentRel = currentRel ? `${currentRel}/${parts[i]}` : parts[i]
    let child = current.children.get(parts[i])
    if (!child) {
      child = createMutableNode(parts[i], currentRel, isFile, isFile && isGenerated?.(currentRel))
      current.children.set(parts[i], child)
    }
    current = child
  }
}

/**
 * Remove a path from a mutable node (internal function)
 */
export function removePathFromMutableNode(node: MutableNode, rel: string): boolean {
  const parts = rel.split("/")
  const path: MutableNode[] = [node]
  let current = node
  
  // Find the path to the file
  for (let i = 0; i < parts.length; i++) {
    const child = current.children.get(parts[i])
    if (!child) return false
    current = child
    path.push(current)
  }
  
  // Remove from leaf up, cleaning up empty directories
  for (let i = path.length - 1; i > 0; i--) {
    const parent = path[i - 1]
    const child = path[i]
    
    parent.children.delete(child.name)
    
    // If parent has no children and is not root, it will be cleaned up in next iteration
    if (parent.children.size === 0 && i > 1) {
      // Will be removed in next iteration
    } else if (parent.children.size > 0) {
      break // Parent still has other children, stop cleanup
    }
  }
  
  return true
}

/**
 * Update generated status for a file in a mutable node
 */
export function updateGeneratedStatusInMutableNode(node: MutableNode, rel: string, isGenerated: boolean): boolean {
  const parts = rel.split("/")
  let current = node
  
  for (let i = 0; i < parts.length; i++) {
    const child = current.children.get(parts[i])
    if (!child) return false
    current = child
  }
  
  if (current.file) {
    current.generated = isGenerated
    return true
  }
  
  return false
}

/**
 * Convert mutable tree to immutable TreeNode for rendering
 */
export function convertToImmutable(node: MutableNode): TreeNode {
  return {
    name: node.name,
    rel: node.rel,
    file: node.file,
    generated: node.generated,
    children: [...node.children.values()]
      .sort((a, b) => {
        if (a.file !== b.file) return a.file ? 1 : -1
        return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
      })
      .map(convertToImmutable),
  }
}

/**
 * Add a file path to an existing tree incrementally
 */
export function addPathToTree(tree: TreeNode, rel: string, isGenerated?: (rel: string) => boolean): TreeNode {
  const parts = rel.split("/")
  let node: TreeNode & { children: TreeNode[] } = tree
  
  for (let i = 0; i < parts.length; i++) {
    const isFile = i === parts.length - 1
    let child = node.children.find(c => c.name === parts[i])
    
    if (!child) {
      // Need to build the rest of the path
      const newRel = node.rel ? `${node.rel}/${parts[i]}` : parts[i]
      child = {
        name: parts[i],
        rel: newRel,
        file: isFile,
        generated: isFile && isGenerated?.(newRel),
        children: []
      }
      node.children.push(child)
      // Keep children sorted: directories first, then files, alphabetical
      node.children.sort((a, b) => {
        if (a.file !== b.file) return a.file ? 1 : -1
        return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
      })
    }
    node = child
  }
  
  // Update generated status if it's a file
  if (node.file && isGenerated) {
    node.generated = isGenerated(node.rel)
  }
  
  return tree
}

/**
 * Remove a file path from an existing tree incrementally
 */
export function removePathFromTree(tree: TreeNode, rel: string): TreeNode {
  const parts = rel.split("/")
  const nodes: (TreeNode & { children: TreeNode[] })[] = [tree]
  let current: TreeNode & { children: TreeNode[] } = tree
  
  // Find the path to the file
  for (let i = 0; i < parts.length; i++) {
    const child = current.children.find(c => c.name === parts[i])
    if (!child) return tree // Path doesn't exist
    current = child
    nodes.push(current)
  }
  
  // Remove from leaf up, cleaning up empty directories
  for (let i = nodes.length - 1; i > 0; i--) {
    const parent = nodes[i - 1]
    const child = nodes[i]
    
    const idx = parent.children.indexOf(child)
    if (idx >= 0) {
      parent.children.splice(idx, 1)
    }
    
    // If parent has no children and is not root, it will be cleaned up in next iteration
    if (parent.children.length === 0 && i > 1) {
      // Will be removed in next iteration
    } else if (parent.children.length > 0) {
      break // Parent still has other children, stop cleanup
    }
  }
  
  return tree
}

/**
 * Update generated status for a file in the tree
 */
export function updateGeneratedStatus(tree: TreeNode, rel: string, isGenerated: boolean): TreeNode {
  const parts = rel.split("/")
  let node: TreeNode & { children: TreeNode[] } = tree
  
  for (let i = 0; i < parts.length; i++) {
    const child = node.children.find(c => c.name === parts[i])
    if (!child) return tree
    node = child
  }
  
  if (node.file) {
    node.generated = isGenerated
  }
  
  return tree
}

export function renderTree(
  files: string[],
  opts: Options,
  broadRoot: boolean,
  changedSet?: Set<string>,
  isGenerated?: (rel: string) => boolean,
  cachedTree?: TreeNode
): string {
  const tree = cachedTree ?? buildTree(files, isGenerated)
  
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
  isGenerated?: (rel: string) => boolean,
  cachedTree?: TreeNode
): string {
  const tree = cachedTree ?? buildTree(files, isGenerated)
  
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
    version: VERSION,
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