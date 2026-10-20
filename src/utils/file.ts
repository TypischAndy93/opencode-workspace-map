import * as path from "node:path"
import {
  SECRET_EXT,
  SECRET_STEM,
  SECRET_STEM_EXT,
  BINARY_EXT,
  LOCKFILES,
  DOT_DIR_ALLOW,
  DOT_FILE_ALLOW,
  TOP_LEVEL_IGNORES,
} from "../shared.ts"

/**
 * Extract the file extension from a path (without the leading dot, lowercase).
 * Uses path.extname for consistent behavior with Node.js.
 */
export function extOf(rel: string): string {
  return path.extname(rel).toLowerCase().replace(/^\./, "")
}

/**
 * Check if a file path appears to be a secret/credential file.
 */
export function isSecret(rel: string): boolean {
  const base = (rel.split("/").pop() ?? rel).toLowerCase()
  if (base === ".env" || base.startsWith(".env.") || base.startsWith(".env-")) return true
  const ext = "." + extOf(base)
  if (SECRET_EXT.has(ext)) return true
  const stem = base.includes(".") ? base.slice(0, base.lastIndexOf(".")) : base
  if (SECRET_STEM.test(stem)) return ext === "." || SECRET_STEM_EXT.has(ext)
  return false
}

/**
 * Check if a file path appears to be a binary file.
 */
export function isBinary(rel: string): boolean {
  const ext = "." + extOf(rel)
  return BINARY_EXT.has(ext)
}

/**
 * Check if a file path is a lockfile.
 */
export function isLockfile(rel: string): boolean {
  const base = rel.split("/").pop() ?? rel
  return LOCKFILES.has(base.toLowerCase())
}

/**
 * Check if a file path is minified (ends with .min.js or .min.css).
 */
export function isMinified(rel: string): boolean {
  return rel.endsWith(".min.js") || rel.endsWith(".min.css")
}

// Re-export constants for convenience
export {
  SECRET_EXT,
  SECRET_STEM,
  SECRET_STEM_EXT,
  BINARY_EXT,
  LOCKFILES,
  DOT_DIR_ALLOW,
  DOT_FILE_ALLOW,
  TOP_LEVEL_IGNORES,
}