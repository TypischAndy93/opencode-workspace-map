// workspace-map test suite — run with `bun test/run-tests.mjs` (or `bun test`).
// Imports the plugin through the real @opencode/plugin SDK and drives it with a
// mocked plugin context + throwaway fixture workspace in the system temp dir.
import { promises as fs } from "node:fs"
import * as path from "node:path"
import * as os from "node:os"
import { pathToFileURL } from "node:url"
import assert from "node:assert/strict"

const PLUGIN_DIR = path.dirname(import.meta.dir)
const PKG_VERSION = JSON.parse(await fs.readFile(path.join(PLUGIN_DIR, "package.json"), "utf8")).version
const FIX = path.join(os.tmpdir(), `wm-fix-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)

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
    async get(k) {
      return m.get(k)
    },
    async set(k, v) {
      m.set(k, v)
    },
    async remove(k) {
      m.delete(k)
    },
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

function makeCtx({ directory, storage, vcsFiles = [], options = {} }) {
  const toolHooks = {}
  const sessionHooks = {}
  const tools = []
  let seq = 0
  let genCount = 0
  const ctx = {
    location: { directory },
    options,
    storage,
    vcs: {
      status: async () => ({
        location: { directory },
        data: vcsFiles.map((f) =>
          typeof f === "string" ? { file: f, additions: 0, deletions: 0, status: "modified" } : f,
        ),
      }),
    },
    model: { default: async () => ({ location: { directory }, data: { providerID: "p", id: "m" } }) },
    generate: {
      text: async () => {
        genCount++
        return { text: "Demo module.\nSymbols: alpha, beta" }
      },
    },
    tool: {
      hook: async (name, cb) => {
        ;(toolHooks[name] ??= []).push(cb)
        return { dispose: async () => {} }
      },
      transform: async (cb) => {
        cb({
          add: (t) => tools.push(t),
          list: () => tools,
          get: () => undefined,
          update() {},
          remove() {},
          namespace() {},
        })
        return { dispose: async () => {} }
      },
    },
    session: {
      hook: async (name, cb) => {
        ;(sessionHooks[name] ??= []).push(cb)
        return { dispose: async () => {} }
      },
    },
  }
  return { ctx, toolHooks, sessionHooks, tools, nextId: () => String(++seq), _vcsFiles: vcsFiles, _generateCount: () => genCount }
}

async function writeWs(dir) {
  const w = (rel, content) =>
    fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true }).then(() => fs.writeFile(path.join(dir, rel), content))
  await w("src/index.ts", 'import { helper } from "./helper"\nimport fs from "node:fs"\n/** Entry point docs */\nexport function main() { return helper() }\nexport const VERSION = 1\nfunction localOnly() {}\n')
  await w("src/helper.ts", "export function helper() { return 42 }\n")
  await w("src/credentials.ts", "export type Creds = { token: string }\n")
  await w("README.md", "# Project\n\n## Install\n\n## Usage\n")
  await w("package.json", JSON.stringify({ name: "demo", version: "1.0.0", scripts: { build: "tsc" } }, null, 2))
  await w("package-lock.json", '{"lockfileVersion":3}\n')
  await w(".env", "SECRET=1\n")
  await w(".gitignore", "*.log\n")
  await w("credentials.json", '{"token":"x"}\n')
  await w("data/config.yaml", "name: demo\nserver:\n  port: 8080\n")
  await w("tools/deploy.sh", "#!/usr/bin/env bash\nfunction deploy() {\n  echo hi\n}\n")
  await w("migrations/001.sql", "\nCREATE TABLE users (\n  id INTEGER PRIMARY KEY,\n  name TEXT\n);\n")
  await w("keep.log", "should be ignored by gitignore\n")
  await w("blob.bin", "\u0000\u0000\u0000")
  await w("data/weird.data", "\u0000\u0000\u0000")
  await w("node_modules/dep/index.js", "module.exports = 1\n")
  await w(".git/config", "[core]\n")
  await w("dist/out.js", "console.log(1)\n")
}

async function main() {
  const cleanups = []
  try {
    const plugin = (await import(pathToFileURL(path.join(PLUGIN_DIR, "index.ts")).href)).default

    await fs.mkdir(FIX, { recursive: true })
    await writeWs(FIX)

    const storage = makeStorage()
    const env = makeCtx({
      directory: FIX,
      storage,
      options: { warmupSummaries: 0, debounceMs: 30 }, // fast + deterministic tests
    })
    const cleanup = await plugin.setup(env.ctx)
    cleanups.push(cleanup)
    const tool = env.tools.find((t) => t.name === "workspace_map")

    console.log(`workspace-map test suite (plugin dir: ${PLUGIN_DIR})\n`)

    await test("registers the workspace_map tool", () => {
      assert.ok(tool, "tool not registered")
      assert.equal(typeof tool.execute, "function")
    })

    await test("registers session.context injection hook", () => {
      assert.ok(env.sessionHooks.context?.length, "no session.context hook")
    })

    const map1 = await tool.execute({}, { progress: async () => {} })
    await test("tree includes real source/config files", () => {
      for (const f of ["src/index.ts", "src/helper.ts", "src/credentials.ts", "README.md", "package.json", "data/config.yaml", ".gitignore", "tools/deploy.sh", "migrations/001.sql"]) {
        assert.ok(map1.content.includes(f), `missing ${f}`)
      }
    })

    await test("skips secrets, lockfiles, ignored dirs, binaries, gitignored", () => {
      for (const f of [".env", "credentials.json", "package-lock.json", "node_modules", "keep.log", "blob.bin", "dist/"]) {
        assert.ok(!map1.content.includes(f), `should have excluded ${f}`)
      }
    })

    await test("does not over-skip source named credentials.ts", () => {
      assert.ok(map1.content.includes("src/credentials.ts"))
    })

    const map2 = await tool.execute({}, { progress: async () => {} })
    await test("map output is deterministic across calls", () => {
      assert.equal(map1.content, map2.content)
    })

    const stats1 = JSON.parse((await tool.execute({ action: "stats" }, {})).content)
    await test("stats: version + scope + new counters", () => {
      assert.equal(stats1.version, PKG_VERSION)
      assert.ok(stats1.locationKey?.length === 12)
      assert.equal(stats1.broadRoot, false)
      assert.ok(stats1.walks >= 1, "no walk recorded")
      assert.ok(stats1.skippedByRule >= 5, `expected rule skips, got ${stats1.skippedByRule}`)
      assert.equal(typeof stats1.files, "number")
      assert.equal(typeof stats1.sessions, "number")
      assert.equal(typeof stats1.dirtyFlushes, "number")
    })

    await tool.execute({ refresh: true }, { progress: async () => {} })

    const indexNote = await tool.execute({ path: "src/index.ts" }, {})
    await test("code summary has exports and imports", () => {
      assert.ok(/exports:/i.test(indexNote.content), indexNote.content)
      assert.ok(indexNote.content.includes("./helper"), "missing import ./helper")
      assert.ok(indexNote.content.includes("node:fs"), "missing import node:fs")
    })

    const yamlNote = await tool.execute({ path: "data/config.yaml" }, {})
    await test("yaml summary lists top-level keys", () => {
      assert.ok(/keys:/i.test(yamlNote.content), yamlNote.content)
      assert.ok(yamlNote.content.includes("name") && yamlNote.content.includes("server"))
    })

    const mdNote = await tool.execute({ path: "README.md" }, {})
    await test("markdown summary lists sections", () => {
      assert.ok(/sections:/i.test(mdNote.content), mdNote.content)
      assert.ok(mdNote.content.includes("Install"))
    })

    const jNote = await tool.execute({ path: "package.json" }, {})
    await test("json summary lists name/version/scripts", () => {
      assert.ok(jNote.content.includes("name=demo"), jNote.content)
      assert.ok(jNote.content.includes("version=1.0.0"))
    })

    const shNote = await tool.execute({ path: "tools/deploy.sh" }, {})
    await test("shell summary has defines", () => {
      assert.ok(shNote.content.includes("deploy"), shNote.content)
    })

    const sqlNote = await tool.execute({ path: "migrations/001.sql" }, {})
    await test("sql summary lists created tables", () => {
      assert.ok(sqlNote.content.includes("users"), sqlNote.content)
    })

    const inj1 = { sessionID: "s1", system: [] }
    await env.sessionHooks.context[0](inj1)
    await test("first injection is a full map", () => {
      assert.equal(inj1.system.length, 1)
      assert.ok(inj1.system[0].text.includes("# Workspace map"), inj1.system[0].text)
      assert.ok(inj1.system[0].text.includes("index.ts"))
    })

    const inj2 = { sessionID: "s1", system: [] }
    await env.sessionHooks.context[0](inj2)
    await test("second injection (unchanged) is a short digest", () => {
      assert.ok(inj2.system[0].text.includes("Workspace map available"), inj2.system[0].text)
      assert.ok(inj2.system[0].text.length < inj1.system[0].text.length)
    })

    // ---- v0.3.0: multi-file edit tracking ----
    const runBefore = (toolName, input) =>
      env.toolHooks["execute.before"][0]({ tool: toolName, sessionID: "s1", agent: "a", messageID: "m", id: env.nextId(), input })
    const runAfter = (toolName, input) =>
      env.toolHooks["execute.after"][0]({ tool: toolName, sessionID: "s1", agent: "a", messageID: "m", id: env.nextId(), input, status: "completed", result: {} })

    runBefore("multiedit", { edits: [{ filePath: "src/helper.ts" }, { filePath: "src/index.ts" }] })
    await fs.writeFile(path.join(FIX, "src/helper.ts"), "export function helperTwo() { return 2 }\n")
    await fs.writeFile(path.join(FIX, "src/index.ts"), "export function mainTwo() { return 1 }\n")
    runAfter("multiedit", { edits: [{ filePath: "src/helper.ts" }, { filePath: "src/index.ts" }] })

    // Let the first debounced flush fire before the next edit, so we get two
    // distinct flushes (proves dirtyFlushes is tracked per batch).
    await new Promise((r) => setTimeout(r, 140))

    runBefore("apply_patch", { patch: "*** Update File: src/helper.ts\n*** Update File: src/index.ts\n" })
    await fs.writeFile(path.join(FIX, "src/helper.ts"), "export function helperPatched() { return 3 }\n")
    runAfter("apply_patch", { patch: "*** Update File: src/helper.ts\n*** Update File: src/index.ts\n" })

    await new Promise((r) => setTimeout(r, 250))

    const helperNote = await tool.execute({ path: "src/helper.ts" }, {})
    const indexNote2 = await tool.execute({ path: "src/index.ts" }, {})
    await test("dirty-flush refreshes ALL edited files (multiedit + patch)", () => {
      assert.ok(helperNote.content.includes("helperPatched"), helperNote.content)
      assert.ok(indexNote2.content.includes("mainTwo"), indexNote2.content)
    })

    const inj3 = { sessionID: "s1", system: [] }
    await env.sessionHooks.context[0](inj3)
    await test("injection after edits shows fresh notes (no indexing…)", () => {
      assert.ok(inj3.system[0].text.includes("## File notes"), inj3.system[0].text)
      assert.ok(inj3.system[0].text.includes("helperPatched"), inj3.system[0].text)
      assert.ok(!inj3.system[0].text.includes("indexing…"), inj3.system[0].text)
    })

    const inj4 = { sessionID: "s1", system: [] }
    await env.sessionHooks.context[0](inj4)
    await test("post-edit re-injection collapses back to a digest (rev guard)", () => {
      assert.ok(inj4.system[0].text.includes("Workspace map available"), inj4.system[0].text)
      assert.ok(inj4.system[0].text.length < inj3.system[0].text.length)
    })

    env._vcsFiles.push("src/helper.ts")
    await new Promise((r) => setTimeout(r, 2100)) // past the 2s VCS-change cache
    const inj5 = { sessionID: "s1", system: [] }
    await env.sessionHooks.context[0](inj5)
    await test("vcs-changed files are marked with ~ in the injected tree", () => {
      assert.ok(inj5.system[0].text.includes("helper.ts ~"), inj5.system[0].text)
      assert.ok(inj5.system[0].text.includes("## File notes"), inj5.system[0].text)
    })

    // ---- v0.3.0: format json + limit ----
    const jsonRes = JSON.parse((await tool.execute({ format: "json" }, {})).content)
    await test("format:json returns structured data", () => {
      assert.equal(jsonRes.version, PKG_VERSION)
      assert.ok(Array.isArray(jsonRes.files) && jsonRes.files.length > 0)
      assert.ok(Array.isArray(jsonRes.changed), "changed list missing")
      assert.equal(typeof jsonRes.notes["src/helper.ts"]?.updatedAt, "number")
      assert.ok(jsonRes.notes["src/helper.ts"]?.summary.includes("helperPatched"))
    })

    const limited = await tool.execute({ limit: 3 }, {})
    await test("limit caps matched results", () => {
      assert.ok(limited.content.includes("3 matching files"), limited.content)
    })

    // ---- v0.3.0: refresh-all indexes new files ----
    await fs.writeFile(path.join(FIX, "newfile.ts"), "export const fresh = true\n")
    const refreshed = await tool.execute({ refresh: true }, { progress: async () => {} })
    await test("refresh:true summarizes all matched files", () => {
      assert.ok(refreshed.content.includes("### newfile.ts"), refreshed.content)
      assert.ok(refreshed.content.includes("ts file"), refreshed.content)
    })

    const binNote = await tool.execute({ path: "data/weird.data" }, {})
    await test("NUL-byte files get a binary marker instead of 'not indexed'", () => {
      assert.ok(binNote.content.includes("binary"), binNote.content)
    })

    // ---- cross-instance scoping + prune isolation ----
    const WS2 = path.join(FIX, "ws2")
    await fs.mkdir(path.join(WS2, "src"), { recursive: true })
    await fs.writeFile(path.join(WS2, "src", "same.ts"), "export const two = 2\n")
    await test("scoped storage: both locations cached without collision", async () => {
      const env2 = makeCtx({ directory: WS2, storage, options: { warmupSummaries: 0, debounceMs: 30, cacheFlushIntervalMs: 25 } })
      const cleanup2 = await plugin.setup(env2.ctx)
      cleanups.push(cleanup2)
      const tool2 = env2.tools.find((t) => t.name === "workspace_map")
      await tool2.execute({ refresh: true }, { progress: async () => {} })
      // Storage persistence is batched; wait until both locations have flushed.
      for (let i = 0; i < 140; i++) {
        const cur = [...storage._m.keys()]
        if (cur.some((k) => k.includes("/file/src/index.ts")) && cur.some((k) => k.includes("/file/src/same.ts"))) break
        await new Promise((r) => setTimeout(r, 50))
      }
      const keys = [...storage._m.keys()]
      const scope1 = keys.find((k) => k.includes("/file/src/index.ts"))
      const scope2 = keys.find((k) => k.includes("/file/src/same.ts"))
      assert.ok(scope1 && scope2, "missing scoped keys")
      assert.notEqual(scope1.split("/file/")[0], scope2.split("/file/")[0], "expected distinct scopes")
    })

    // ---- legacy migration ----
    const migStorage = makeStorage()
    await migStorage.set("file/legacy.json", { rel: "legacy.json" })
    const env3 = makeCtx({ directory: FIX, storage: migStorage, options: { warmupSummaries: 0, debounceMs: 30 } })
    await plugin.setup(env3.ctx)
    await new Promise((r) => setTimeout(r, 100))
    await test("legacy unscoped cache keys are migrated away", () => {
      assert.equal(migStorage._m.has("file/legacy.json"), false)
    })

    // ---- broad root guard ----
    const envH = makeCtx({ directory: os.homedir(), storage: makeStorage(), options: { warmupSummaries: 0, debounceMs: 30 } })
    await plugin.setup(envH.ctx)
    await test("broad root disables injection but keeps the tool", () => {
      assert.equal(envH.sessionHooks.context, undefined)
      assert.ok(envH.tools.find((t) => t.name === "workspace_map"))
    })

    // ---- v0.4.0: model summarizer never blocks the session hook ----
    const envM = makeCtx({ directory: FIX, storage: makeStorage(), options: { warmupSummaries: 0, debounceMs: 30, summarizer: "model" } })
    cleanups.push(await plugin.setup(envM.ctx))
    const m1 = { sessionID: "sM", system: [] }
    await envM.sessionHooks.context[0](m1)
    await test("model mode: injection completes with zero generate on empty focus", () => {
      assert.ok(m1.system[0].text.includes("# Workspace map"), m1.system[0].text)
      assert.equal(envM._generateCount(), 0, `unexpected generate calls: ${envM._generateCount()}`)
    })

    const runBeforeM = (input) =>
      envM.toolHooks["execute.before"][0]({ tool: "edit", sessionID: "sM", agent: "a", messageID: "m", id: envM.nextId(), input })
    const runAfterM = (input) =>
      envM.toolHooks["execute.after"][0]({ tool: "edit", sessionID: "sM", agent: "a", messageID: "m", id: envM.nextId(), input, status: "completed", result: {} })
    runBeforeM({ filePath: "src/helper.ts" })
    await fs.writeFile(path.join(FIX, "src/helper.ts"), "export function helperModel() { return 7 }\n")
    runAfterM({ filePath: "src/helper.ts" })
    await new Promise((r) => setTimeout(r, 250))
    await test("model mode: dirty flush performs generate.text in the background", () => {
      assert.ok(envM._generateCount() >= 1, `expected background model calls, got ${envM._generateCount()}`)
    })

    const envTM = makeCtx({ directory: FIX, storage: makeStorage(), options: { warmupSummaries: 0, debounceMs: 30, summarizer: "model", inject: "tree" } })
    cleanups.push(await plugin.setup(envTM.ctx))
    const tm1 = { sessionID: "sT", system: [] }
    await envTM.sessionHooks.context[0](tm1)
    await test("tree mode never summarizes (zero model cost)", () => {
      assert.equal(envTM._generateCount(), 0, `generate.text called ${envTM._generateCount()} times`)
      assert.ok(tm1.system[0].text.includes("# Workspace map"))
    })

    // ---- v0.4.0: option validation — typo falls back to a valid strategy ----
    const envB = makeCtx({ directory: FIX, storage: makeStorage(), options: { warmupSummaries: 0, debounceMs: 30, injectStrategy: "alwayss" } })
    cleanups.push(await plugin.setup(envB.ctx))
    const b1 = { sessionID: "sB", system: [] }
    const b2 = { sessionID: "sB", system: [] }
    await envB.sessionHooks.context[0](b1)
    await envB.sessionHooks.context[0](b2)
    const runBeforeB = (input) =>
      envB.toolHooks["execute.before"][0]({ tool: "edit", sessionID: "sB", agent: "a", messageID: "m", id: envB.nextId(), input })
    const runAfterB = (input) =>
      envB.toolHooks["execute.after"][0]({ tool: "edit", sessionID: "sB", agent: "a", messageID: "m", id: envB.nextId(), input, status: "completed", result: {} })
    runBeforeB({ filePath: "src/index.ts" })
    await fs.writeFile(path.join(FIX, "src/index.ts"), "export function mainBad() { return 0 }\n")
    runAfterB({ filePath: "src/index.ts" })
    await new Promise((r) => setTimeout(r, 250))
    const b3 = { sessionID: "sB", system: [] }
    await envB.sessionHooks.context[0](b3)
    await test("invalid injectStrategy falls back to 'changed'", () => {
      assert.ok(b1.system[0].text.includes("# Workspace map"), "first should be full")
      assert.ok(!b2.system[0].text.includes("# Workspace map"), "second should be a digest")
      assert.ok(b3.system[0].text.includes("# Workspace map"), "edit must trigger full under fallback")
    })

    // ---- v0.4.0: digests name the changed files ----
    const envF = makeCtx({ directory: FIX, storage: makeStorage(), options: { warmupSummaries: 0, debounceMs: 30, injectStrategy: "first" } })
    cleanups.push(await plugin.setup(envF.ctx))
    const f1 = { sessionID: "sF", system: [] }
    await envF.sessionHooks.context[0](f1)
    envF._vcsFiles.push("src/helper.ts")
    await new Promise((r) => setTimeout(r, 2100)) // past the 2s VCS-change cache
    const f2 = { sessionID: "sF", system: [] }
    await envF.sessionHooks.context[0](f2)
    await test("digests name the changed files", () => {
      assert.ok(f2.system[0].text.includes("Workspace map available"), f2.system[0].text)
      assert.ok(f2.system[0].text.includes("changed"), "digest missing change count")
      assert.ok(f2.system[0].text.includes("src/helper.ts"), "digest missing changed path")
    })

    // ---- v0.4.0: honest tree depth truncation ----
    const envT = makeCtx({ directory: FIX, storage: makeStorage(), options: { warmupSummaries: 0, debounceMs: 30, treeDepth: 1 } })
    cleanups.push(await plugin.setup(envT.ctx))
    const toolT = envT.tools.find((t) => t.name === "workspace_map")
    const treeT = await toolT.execute({}, { progress: async () => {} })
    await test("depth-limited trees show a truncation marker", () => {
      assert.ok(treeT.content.includes("tree depth limited"), treeT.content)
    })

    // ---- v0.4.0: opportunistic prune on non-forced walks ----
    const envP = makeCtx({ directory: FIX, storage: makeStorage(), options: { warmupSummaries: 0, debounceMs: 30, treeTtlMs: 300 } })
    cleanups.push(await plugin.setup(envP.ctx))
    const toolP = envP.tools.find((t) => t.name === "workspace_map")
    await fs.writeFile(path.join(FIX, "prune-me.ts"), "export const pruned = true\n")
    await toolP.execute({ refresh: true }, { progress: async () => {} })
    const beforeP = JSON.parse((await toolP.execute({ action: "stats" }, {})).content)
    await fs.rm(path.join(FIX, "prune-me.ts"))
    await new Promise((r) => setTimeout(r, 400)) // past treeTtlMs → non-forced re-walk
    await toolP.execute({}, { progress: async () => {} })
    const afterP = JSON.parse((await toolP.execute({ action: "stats" }, {})).content)
    await test("vanished files are pruned from cache on non-forced walks", () => {
      assert.ok(afterP.cachedEntries < beforeP.cachedEntries, `cachedEntries ${beforeP.cachedEntries} -> ${afterP.cachedEntries}`)
    })

    const stats2 = JSON.parse((await tool.execute({ action: "stats" }, {})).content)
    await test("stats after edits: dirtyFlushes, sessions, kind counters", () => {
      assert.ok(stats2.dirtyFlushes >= 2, `dirtyFlushes=${stats2.dirtyFlushes}`)
      assert.ok(stats2.sessions >= 1, `sessions=${stats2.sessions}`)
      assert.ok(stats2.files >= 11, `files=${stats2.files}`)
      assert.ok(stats2.outlineSummaries >= 1, `outlineSummaries=${stats2.outlineSummaries}`)
      assert.ok(stats2.skippedSummaries >= 1, `skippedSummaries=${stats2.skippedSummaries}`)
      assert.equal(typeof stats2.lastWalkMs, "number")
    })

    console.log(`\n${passed} passed, ${failed} failed`)
    process.exitCode = failed ? 1 : 0
  } finally {
    for (const c of cleanups.reverse()) await c?.()
    await fs.rm(FIX, { recursive: true, force: true })
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error("harness crashed:", err)
    process.exit(2)
  })