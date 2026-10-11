import { createHash } from "node:crypto"

export function hash(input: string): string {
  return createHash("sha1").update(input).digest("hex").slice(0, 12)
}

export function locKey(root: string): string {
  return hash(root.toLowerCase()).slice(0, 12)
}

export function entryPrefix(locKey: string): string {
  return `loc/${locKey}/file/`
}

export const LEGACY_PREFIX = "file/"