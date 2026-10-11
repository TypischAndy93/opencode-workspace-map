import type { GitignoreRule } from "../shared.ts"
import {
  DOT_DIR_ALLOW,
  DOT_FILE_ALLOW,
  LOCKFILES,
  BINARY_EXT,
  SECRET_EXT,
  SECRET_STEM,
  SECRET_STEM_EXT,
  TOP_LEVEL_IGNORES,
} from "../shared.ts"

// Re-export constants from shared
export { DOT_DIR_ALLOW, DOT_FILE_ALLOW, LOCKFILES, BINARY_EXT, SECRET_EXT, SECRET_STEM, SECRET_STEM_EXT, TOP_LEVEL_IGNORES }

export function globToRegex(glob: string): string {
  let out = ""
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === "*") {
      if (glob[i + 1] === "*") {
        if (glob[i + 2] === "/") {
          out += "(?:.*/)?"
          i += 2
        } else {
          out += ".*"
          i += 1
        }
      } else {
        out += "[^/]*"
      }
    } else if (c === "?") {
      out += "[^/]"
    } else if ("\\^$.|+()[]{}".includes(c)) {
      out += "\\" + c
    } else {
      out += c
    }
  }
  return out
}

export function compileGitignore(text: string): GitignoreRule[] {
  const rules: GitignoreRule[] = []
  for (const raw of text.split(/\r?\n/)) {
    if (!raw || raw.startsWith("#")) continue
    let line = raw.replace(/\s+$/, "")
    if (!line) continue
    let negate = false
    if (line.startsWith("!")) {
      negate = true
      line = line.slice(1)
    }
    if (line.endsWith("/")) line = line.slice(0, -1)
    const anchored = line.startsWith("/") || line.slice(1).includes("/")
    if (line.startsWith("/")) line = line.slice(1)
    if (!line) continue
    const prefix = anchored ? "^" : "(?:^|.*/)"
    try {
      rules.push({ negate, regex: new RegExp(prefix + globToRegex(line) + "(?:/.*)?$") })
    } catch {
      /* skip invalid pattern */
    }
  }
  return rules
}

export function gitignored(rules: GitignoreRule[], rel: string): boolean {
  let ignored = false
  for (const r of rules) if (r.regex.test(rel)) ignored = !r.negate
  return ignored
}