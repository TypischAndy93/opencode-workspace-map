// Symbol navigation integration test using the plugin SDK directly.
// Exercises the full symbols -> definition -> references round-trip.
import { promises as fs } from "node:fs"
import * as path from "node:path"
import * as os from "node:os"
import { pathToFileURL } from "node:url"
import assert from "node:assert/strict"

const PLUGIN_DIR = path.dirname(import.meta.dir)
const FIX = path.join(os.tmpdir(), `wm-symbols-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)

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

function makeStorage() {
  const m = new Map()
  return {
    _m: m,
    async get(k) { return m.get(k) },
    async set(k, v) { m.set(k, v) },
    async remove(k) { m.delete(k) },
    async scan({ prefix, after, limit }) {
      const keys = [...m.keys()].filter((k) => k.startsWith(prefix)).sort()
      let start = 0
      if (after) {
        const i = keys.findIndex((k) => k > after)
        start = i < 0 ? keys.length : i
      }
      const slice = keys.slice(start, start + (limit ?? 100))
      return {
        entries: slice.map((k) => ({ key: k, value: m.get(k) })),
        next: start + slice.length < keys.length ? slice[slice.length - 1] : undefined,
      }
    },
  }
}

function makeCtx({ directory, storage, options = {} }) {
  const toolHooks = {}
  const sessionHooks = {}
  const tools = []
  const ctx = {
    location: { directory },
    options,
    storage,
    vcs: {
      status: async () => ({ location: { directory }, data: [] }),
    },
    model: { default: async () => ({ location: { directory }, data: { providerID: "p", id: "m" } }) },
    generate: { text: async () => ({ text: "Demo module.\nSymbols: alpha, beta" }) },
    tool: {
      hook: async (name, cb) => { ;(toolHooks[name] ??= []).push(cb); return { dispose: async () => {} } },
      transform: async (cb) => {
        cb({ add: (t) => tools.push(t), list: () => tools, get: () => undefined, update() {}, remove() {}, namespace() {} })
        return { dispose: async () => {} }
      },
    },
    session: {
      hook: async (name, cb) => { ;(sessionHooks[name] ??= []).push(cb); return { dispose: async () => {} } },
    },
  }
  return { ctx, toolHooks, sessionHooks, tools }
}

async function writeWs(dir) {
  const w = (rel, content) =>
    fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true }).then(() => fs.writeFile(path.join(dir, rel), content))
  await w("src/user.ts", `export class UserService {\n  register() {}\n  authenticate() {}\n}\n`)
  await w("src/db.ts", `export function connect() {}\n`)
  await w("src/index.ts", `import { UserService } from "./user"\nexport function main() { return new UserService() }\n`)
  await w("package.json", JSON.stringify({ name: "demo", version: "1.0.0" }, null, 2))
}

async function main() {
  const cleanups = []
  try {
    const plugin = (await import(pathToFileURL(path.join(PLUGIN_DIR, "index.ts")).href)).default
    await fs.mkdir(FIX, { recursive: true })
    await writeWs(FIX)

    const storage = makeStorage()
    const env = makeCtx({ directory: FIX, storage, options: { warmupSummaries: 0, debounceMs: 30 } })
    const cleanup = await plugin.setup(env.ctx)
    cleanups.push(cleanup)
    const tool = env.tools.find((t) => t.name === "workspace_map")

    // Force a full re-scan so files get summarized and cached
    await tool.execute({ refresh: true }, { progress: async () => {} })

    // Wait for summarization to complete
    await new Promise((r) => setTimeout(r, 300))

    await test("symbols action lists symbols with file and kind", async () => {
      const res = JSON.parse((await tool.execute({ action: "symbols", query: "User" }, {})).content)
      assert.equal(res.action, "symbols")
      const names = res.symbols.map((s) => s.name)
      assert.ok(names.includes("UserService"), `expected UserService in ${JSON.stringify(names)}`)
      const userSvc = res.symbols.find((s) => s.name === "UserService")
      assert.equal(userSvc.file, "src/user.ts")
      assert.equal(userSvc.kind, "class")
    })

    await test("definition action returns file:line for known symbol", async () => {
      const res = JSON.parse((await tool.execute({ action: "definition", symbol: "UserService" }, {})).content)
      assert.equal(res.found, true)
      assert.equal(res.symbol, "UserService")
      assert.equal(res.file, "src/user.ts")
      // line/character require LSP summarizer; outline mode provides file only
    })

    await test("definition action reports not found for unknown symbol", async () => {
      const res = JSON.parse((await tool.execute({ action: "definition", symbol: "NonExistentSymbol" }, {})).content)
      assert.equal(res.found, false)
    })

    await test("references action returns referencing files", async () => {
      const res = JSON.parse((await tool.execute({ action: "references", symbol: "UserService" }, {})).content)
      assert.equal(res.symbol, "UserService")
      const files = res.references.map((r) => r.file)
      assert.ok(files.includes("src/user.ts"), `expected src/user.ts in ${JSON.stringify(files)}`)
      assert.ok(files.includes("src/index.ts"), `expected src/index.ts in ${JSON.stringify(files)}`)
    })

    await test("symbols -> definition -> references round-trip", async () => {
      const symbolsRes = JSON.parse((await tool.execute({ action: "symbols", query: "connect" }, {})).content)
      const connect = symbolsRes.symbols.find((s) => s.name === "connect")
      assert.ok(connect, "connect symbol not found")
      assert.equal(connect.file, "src/db.ts")

      const defRes = JSON.parse((await tool.execute({ action: "definition", symbol: "connect" }, {})).content)
      assert.equal(defRes.found, true)
      assert.equal(defRes.file, "src/db.ts")

      const refsRes = JSON.parse((await tool.execute({ action: "references", symbol: "connect" }, {})).content)
      assert.equal(refsRes.symbol, "connect")
      const refFiles = refsRes.references.map((r) => r.file)
      assert.ok(refFiles.includes("src/db.ts"), `expected src/db.ts in references`)
    })

    await test("graph action returns nodes, edges, layers and no cycles for DAG", async () => {
      const res = JSON.parse((await tool.execute({ action: "graph" }, {})).content)
      assert.ok(Array.isArray(res.nodes), "graph should have nodes array")
      assert.ok(Array.isArray(res.edges), "graph should have edges array")
      assert.ok(Array.isArray(res.circularDependencies), "graph should have circularDependencies array")
      // Every node should have fanIn, fanOut, and layer
      for (const node of res.nodes) {
        assert.ok(typeof node.fanIn === "number", `node ${node.id} missing fanIn`)
        assert.ok(typeof node.fanOut === "number", `node ${node.id} missing fanOut`)
        assert.ok(typeof node.layer === "number", `node ${node.id} missing layer`)
      }
      // A DAG should have no cycles
      assert.equal(res.circularDependencies.length, 0, "expected no cycles in DAG fixture")
    })

    await test("graph action nodes include expected files", async () => {
      const res = JSON.parse((await tool.execute({ action: "graph" }, {})).content)
      const fileIds = res.nodes.map((n) => n.id)
      assert.ok(fileIds.includes("src/user.ts"), `expected src/user.ts in graph nodes`)
      assert.ok(fileIds.includes("src/db.ts"), `expected src/db.ts in graph nodes`)
      assert.ok(fileIds.includes("src/index.ts"), `expected src/index.ts in graph nodes`)
    })

    console.log(`\n${passed} passed, ${failed} failed`)
    process.exitCode = failed ? 1 : 0
  } finally {
    for (const c of cleanups.reverse()) await c?.()
    await fs.rm(FIX, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error("integration test crashed:", err)
  process.exit(2)
})
