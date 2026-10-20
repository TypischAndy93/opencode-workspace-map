import { describe, it, expect, vi, afterEach } from "vitest"
import * as os from "node:os"
import { createWatchManager } from "../../src/watch-manager.js"
import type { Logger } from "../../src/config/index.js"

const TMP = os.tmpdir()

function makeDeps() {
  const cache = new Map<string, any>()
  const reverseDeps = new Map<string, Set<string>>()
  const listFiles = vi.fn(async () => ["src/a.ts", "src/b.ts"])
  const summarizeMany = vi.fn(async () => {})
  const log: Logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => log) as any,
    setLevel: vi.fn(),
    getLevel: vi.fn(() => "info"),
  }
  return { cache, reverseDeps, listFiles, summarizeMany, log }
}

describe("WatchManager pause/resume", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("starts not paused", async () => {
    const deps = makeDeps()
    const opts: any = {}
    const mgr = createWatchManager(
      { root: TMP, cache: deps.cache, reverseDeps: deps.reverseDeps, listFiles: deps.listFiles, summarizeMany: deps.summarizeMany, log: deps.log },
      opts
    )
    expect(mgr.isPaused()).toBe(false)
    expect(mgr.isRunning()).toBe(false)
  })

  it("pause suspends change handling", async () => {
    const deps = makeDeps()
    const opts: any = {}
    const mgr = createWatchManager(
      { root: TMP, cache: deps.cache, reverseDeps: deps.reverseDeps, listFiles: deps.listFiles, summarizeMany: deps.summarizeMany, log: deps.log },
      opts
    )
    await mgr.start()
    mgr.pause()
    expect(mgr.isPaused()).toBe(true)
    mgr.resume()
    expect(mgr.isPaused()).toBe(false)
    mgr.stop()
  })

  it("resume restores change handling", async () => {
    const deps = makeDeps()
    const opts: any = {}
    const mgr = createWatchManager(
      { root: TMP, cache: deps.cache, reverseDeps: deps.reverseDeps, listFiles: deps.listFiles, summarizeMany: deps.summarizeMany, log: deps.log },
      opts
    )
    await mgr.start()
    mgr.pause()
    mgr.resume()
    expect(mgr.isPaused()).toBe(false)
    mgr.stop()
  })

  it("stop sets disposed and isRunning false", async () => {
    const deps = makeDeps()
    const opts: any = {}
    const mgr = createWatchManager(
      { root: TMP, cache: deps.cache, reverseDeps: deps.reverseDeps, listFiles: deps.listFiles, summarizeMany: deps.summarizeMany, log: deps.log },
      opts
    )
    await mgr.start()
    expect(mgr.isRunning()).toBe(true)
    mgr.stop()
    expect(mgr.isRunning()).toBe(false)
  })
})

describe("daemonize pid file", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    try { require("node:fs").unlinkSync(`${TMP}/test-watch.pid`) } catch {}
  })

  it("writes pid file when pidFile is set", async () => {
    const fs = require("node:fs")
    const log: any = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() }
    const deps = makeDeps()
    const mgr = createWatchManager(
      { root: TMP, cache: deps.cache, reverseDeps: deps.reverseDeps, listFiles: deps.listFiles, summarizeMany: deps.summarizeMany, log },
      {},
      { daemon: true, pidFile: `${TMP}/test-watch.pid` }
    )
    // start() runs daemonize synchronously before the first await (fs.watch)
    await Promise.race([
      mgr.start().catch((e) => { console.error("start error:", e) }),
      new Promise((r) => setTimeout(r, 200)),
    ])
    expect(fs.existsSync(`${TMP}/test-watch.pid`)).toBe(true)
    const content = fs.readFileSync(`${TMP}/test-watch.pid`, "utf8")
    expect(content).toBe(String(process.pid))
    expect(log.info).toHaveBeenCalledWith(
      "watch: daemon pid file written",
      expect.objectContaining({ pidFile: `${TMP}/test-watch.pid`, pid: process.pid })
    )
  })

  it("does not write pid file when pidFile is not set", async () => {
    const fs = require("node:fs")
    const log: any = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() }
    const deps = makeDeps()
    const mgr = createWatchManager(
      { root: TMP, cache: deps.cache, reverseDeps: deps.reverseDeps, listFiles: deps.listFiles, summarizeMany: deps.summarizeMany, log },
      {},
      { daemon: true }
    )
    await Promise.race([
      mgr.start().catch(() => {}),
      new Promise((r) => setTimeout(r, 200)),
    ])
    expect(fs.existsSync(`${TMP}/test-watch.pid`)).toBe(false)
  })
})
