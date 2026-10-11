/**
 * Shared types and constants used by both config and fs modules.
 * This breaks the circular dependency between config/ and fs/.
 */

export interface GitignoreRule {
  negate: boolean
  regex: RegExp
}

// Directory/file allowlists
export const DOT_DIR_ALLOW = new Set([".github", ".opencode", ".vscode", ".devcontainer", ".gitlab"])
export const DOT_FILE_ALLOW = new Set([
  ".gitignore",
  ".gitattributes",
  ".editorconfig",
  ".dockerignore",
  ".npmignore",
  ".prettierignore",
  ".eslintignore",
  ".prettierrc",
  ".eslintrc",
  ".babelrc",
  ".nvmrc",
  ".node-version",
  ".python-version",
  ".tool-versions",
  ".commitlintrc",
])

// File type patterns
export const LOCKFILES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lock",
  "bun.lockb",
  "cargo.lock",
  "poetry.lock",
  "composer.lock",
  "gemfile.lock",
  "go.sum",
  "uv.lock",
])

export const BINARY_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico", ".svgz", ".tiff",
  ".pdf", ".zip", ".gz", ".tgz", ".tar", ".7z", ".rar", ".bz2", ".xz",
  ".exe", ".dll", ".so", ".dylib", ".bin", ".class", ".o", ".a", ".obj", ".lib",
  ".mp3", ".mp4", ".mov", ".avi", ".mkv", ".wav", ".flac", ".ogg", ".webm",
  ".woff", ".woff2", ".ttf", ".otf", ".eot",
  ".db", ".sqlite", ".sqlite3", ".lock", ".wasm", ".pyc", ".img", ".iso", ".vhd", ".vhdx", ".map",
])

export const SECRET_EXT = new Set([
  ".pem", ".key", ".p12", ".pfx", ".jks", ".keystore", ".asc", ".gpg", ".ppk", ".kdbx", ".der",
])

export const SECRET_STEM = /^(\.netrc|\.npmrc|\.pypirc|\.htpasswd|env|credentials|secrets?|token|tokens|password|passwd|private[_-]?key|api[_-]?key|apikey|id_rsa|id_dsa|id_ecdsa|id_ed25519|keystore|adbkey)$/i

export const SECRET_STEM_EXT = new Set([
  ".json", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".conf", ".properties", ".txt", ".sh", ".xml", ".csv", ".log",
])

export const TOP_LEVEL_IGNORES = new Set(["bin", "tmp", "temp", "cache"])