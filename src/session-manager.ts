import type { Options, Logger } from "./config/index.ts"

export interface SessionManager {
  recordRecent(sessionID: string | undefined, rel: string): void
  getSessionRecent(sessionID: string): Map<string, number>
  pruneSessions(): void
  markDirty(sessionID: string | undefined, rel: string, debounceMs: number): void
}

export function createSessionManager(
  opts: Options,
  recentBySession: Map<string, Map<string, number>>,
  recentGlobal: Map<string, number>,
  injectionState: Map<string, { rev: string }>,
  sessionsWithInitialWalk: Set<string>,
  dirty: Set<string>,
  flushTimer: { current: ReturnType<typeof setTimeout> | undefined },
  log: Logger,
  flushCallback: (rels: string[]) => Promise<void>
): SessionManager {

  function recordRecent(sessionID: string | undefined, rel: string): void {
    const target = sessionID ? getSessionRecent(sessionID) : recentGlobal
    target.set(rel, Date.now())
    if (target.size > 200) {
      const cutoff = Date.now() - 30 * 60_000
      for (const [key, at] of target) if (at < cutoff) target.delete(key)
    }
    pruneSessions()
  }

  function pruneSessions(): void {
    while (recentBySession.size > 128) {
      const oldest = recentBySession.keys().next().value
      if (oldest === undefined) break
      recentBySession.delete(oldest)
      injectionState.delete(oldest)
      sessionsWithInitialWalk.delete(oldest)
    }
    while (injectionState.size > 256) {
      const first = injectionState.keys().next().value
      if (first === undefined) break
      injectionState.delete(first)
    }
  }

  function getSessionRecent(sessionID: string): Map<string, number> {
    let m = recentBySession.get(sessionID)
    if (!m) {
      m = new Map()
      recentBySession.set(sessionID, m)
    }
    return m
  }

  function markDirty(sessionID: string | undefined, rel: string, debounceMs: number): void {
    recordRecent(sessionID, rel)
    dirty.add(rel)
    if (flushTimer.current) clearTimeout(flushTimer.current)
    flushTimer.current = setTimeout(() => {
      flushTimer.current = undefined
      const batch = [...dirty]
      dirty.clear()
      // stats.dirtyFlushes++ - will be handled by caller
      void (async () => {
        try {
          await flushCallback(batch)
        } catch (err) {
          log.error("flush failed", { error: err })
        }
      })()
    }, debounceMs)
  }

  return {
    recordRecent,
    getSessionRecent,
    pruneSessions,
    markDirty,
  }
}