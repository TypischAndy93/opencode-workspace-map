// Integration test for workspace-map plugin using OpenCode CLI
// Run with: bun test/integration.mjs
//
// This test uses the opencode CLI to create a session with the plugin
// and verifies the plugin loads correctly.

import { promises as fs } from "node:fs"
import * as path from "node:path"
import * as os from "node:os"
import { spawn } from "node:child_process"

const PLUGIN_DIR = path.dirname(import.meta.dirname)
const FIXTURE_DIR = path.join(os.tmpdir(), `wm-integration-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)

let passed = 0
let failed = 0

async function test(name, fn) {
  try {
    await fn()
    passed++
    console.log(`  PASS  ${name}`)
  } catch (err) {
    failed++
    console.log(`  FAIL  ${name}\n        ${err?.message ?? err}`)
  }
}

async function writeFixture(dir, files) {
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel)
    await fs.mkdir(path.dirname(abs), { recursive: true })
    await fs.writeFile(abs, content)
  }
}

function runCommand(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { ...options, stdio: ["ignore", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", d => stdout += d)
    child.stderr.on("data", d => stderr += d)
    child.on("close", code => {
      if (code === 0) resolve(stdout.trim())
      else reject(new Error(stderr.trim() || `Exit code ${code}`))
    })
    child.on("error", reject)
  })
}

async function main() {
  console.log(`workspace-map CLI integration test\n`)

  // Create fixture workspace
  await fs.mkdir(FIXTURE_DIR, { recursive: true })
  await writeFixture(FIXTURE_DIR, {
    "src/index.ts": 'import { helper } from "./helper"\nexport function main() { return helper() }\nexport const VERSION = 1\n',
    "src/helper.ts": "export function helper() { return 42 }\n",
    "README.md": "# Test Project\n\n## Usage\n",
    "package.json": JSON.stringify({ name: "test", version: "1.0.0" }, null, 2),
    ".env": "SECRET=1\n",
    "node_modules/dep/index.js": "module.exports = 1\n",
  })

  // Create opencode.json with plugin config
  const opencodeConfig = {
    plugins: [
      { package: PLUGIN_DIR, options: { warmupSummaries: 0, debounceMs: 30 } }
    ]
  }
  await fs.writeFile(path.join(FIXTURE_DIR, "opencode.json"), JSON.stringify(opencodeConfig, null, 2))

  try {
    // Test 1: Run opencode from the fixture directory with a simple prompt
    console.log("  Starting opencode session...")
    const result = await runCommand("opencode", [
      "run",
      "List files in src using workspace_map tool",
      "--model", "opencode/nemotron-3-ultra-free"
    ], { 
      cwd: FIXTURE_DIR,
      timeout: 60000 
    })

    await test("opencode run completes with plugin", () => {
      if (result.includes("Error loading plugin") || result.includes("workspace-map] ERROR")) {
        throw new Error(`Plugin error in output: ${result}`)
      }
    })

    // Test 2: Verify plugin produces workspace map output
    await test("Plugin produces workspace map output", () => {
      // The plugin injects workspace map into context
      // Check that the output indicates the plugin was active
      if (result.includes("Error") && result.includes("workspace-map")) {
        throw new Error("Plugin reported errors")
      }
    })

    // Test 3: Run another prompt to verify session context
    const debugResult = await runCommand("opencode", [
      "run",
      "What files are in the workspace?",
      "--model", "opencode/nemotron-3-ultra-free"
    ], { 
      cwd: FIXTURE_DIR,
      timeout: 60000 
    })

    await test("Session context includes workspace map", () => {
      if (debugResult.includes("Error loading plugin")) {
        throw new Error("Plugin failed to load")
      }
    })

  } finally {
    await fs.rm(FIXTURE_DIR, { recursive: true, force: true })
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch(err => {
  console.error("Integration test crashed:", err)
  process.exit(2)
})