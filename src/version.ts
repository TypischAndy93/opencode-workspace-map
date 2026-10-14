import { createRequire } from "node:module"

// Single source of truth for the reported plugin version. Reading package.json
// at runtime means the version can never drift from what is published.
const require = createRequire(import.meta.url)
const pkg = require("../package.json") as { version?: string }

export const VERSION: string = pkg.version ?? "0.0.0"
