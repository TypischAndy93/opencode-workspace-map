/**
 * Import collection utilities for various programming languages.
 * Each language family has its own import pattern matching logic.
 */

export function collectImports(content: string, family: string): string[] {
  const specs = new Set<string>()
  const add = (s: string) => {
    const v = s.trim()
    if (v) specs.add(v)
  }

  if (family === "js") {
    let m: RegExpExecArray | null
    const fromRe = /(?:^|\s)(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g
    while ((m = fromRe.exec(content))) add(m[1])
    const reqRe = /require\(\s*['"]([^'"]+)['"]\s*\)/g
    while ((m = reqRe.exec(content))) add(m[1])
  } else if (family === "py") {
    let m: RegExpExecArray | null
    const re = /^\s*(?:from\s+([A-Za-z0-9_.]+)\s+import|import\s+([A-Za-z0-9_.,\s]+))/gm
    while ((m = re.exec(content))) add(m[1] ?? (m[2] ?? "").split(",")[0])
  } else if (family === "go") {
    let m: RegExpExecArray | null
    const re = /^\s*(?:import\s+)?[`"]([^`"]+)[`"]/gm
    while ((m = re.exec(content))) add(m[1])
  } else if (family === "rust") {
    let m: RegExpExecArray | null
    const re = /^\s*use\s+([A-Za-z0-9_:]+)/gm
    while ((m = re.exec(content))) add(m[1])
  } else if (family === "jvm") {
    let m: RegExpExecArray | null
    const re = /^\s*import\s+([A-Za-z0-9_.*]+)/gm
    while ((m = re.exec(content))) add(m[1])
  } else if (family === "code") {
    let m: RegExpExecArray | null
    const re = /^\s*#\s*include\s+[<"]([^>"]+)[>"]/gm
    while ((m = re.exec(content))) add(m[1])
  }
  return [...specs].slice(0, 25)
}

/**
 * Collect imports for a file by detecting its language family.
 */
export async function collectImportsForFile(content: string, ext: string): Promise<string[]> {
  // Import familyOf locally to avoid circular dependency
  const { familyOf } = await import("../config/index.ts")
  const family = familyOf(ext)
  return collectImports(content, family)
}