import { describe, it, expect, vi } from "vitest"
import { createSemaphore } from "../../src/utils/semaphore.js"

describe("semaphore", () => {
  describe("createSemaphore", () => {
    it("allows up to N concurrent operations", async () => {
      const semaphore = createSemaphore(2)
      let running = 0
      let maxRunning = 0
      
      const run = async () => {
        running++
        maxRunning = Math.max(maxRunning, running)
        await new Promise(r => setTimeout(r, 10))
        running--
      }
      
      await Promise.all([
        semaphore.acquire(run),
        semaphore.acquire(run),
        semaphore.acquire(run),
        semaphore.acquire(run),
      ])
      
      expect(maxRunning).toBe(2)
    })

    it("handles single permit", async () => {
      const semaphore = createSemaphore(1)
      let running = 0
      let maxRunning = 0
      
      const run = async () => {
        running++
        maxRunning = Math.max(maxRunning, running)
        await new Promise(r => setTimeout(r, 10))
        running--
      }
      
      await Promise.all([
        semaphore.acquire(run),
        semaphore.acquire(run),
        semaphore.acquire(run),
      ])
      
      expect(maxRunning).toBe(1)
    })

    it("returns result from acquired function", async () => {
      const semaphore = createSemaphore(1)
      const result = await semaphore.acquire(() => Promise.resolve(42))
      expect(result).toBe(42)
    })

    it("propagates errors", async () => {
      const semaphore = createSemaphore(1)
      await expect(semaphore.acquire(() => Promise.reject(new Error("test"))))
        .rejects.toThrow("test")
    })

    it("handles synchronous functions", async () => {
      const semaphore = createSemaphore(1)
      const result = await semaphore.acquire(() => 42)
      expect(result).toBe(42)
    })

    it("handles high concurrency correctly", async () => {
      const semaphore = createSemaphore(10)
      const results: number[] = []
      
      await Promise.all(
        Array.from({ length: 50 }, (_, i) =>
          semaphore.acquire(async () => {
            await new Promise(r => setTimeout(r, Math.random() * 5))
            results.push(i)
          })
        )
      )
      
      expect(results.length).toBe(50)
    })

    it("releases permits after completion", async () => {
      const semaphore = createSemaphore(1)
      let completed = 0
      
      await Promise.all([
        semaphore.acquire(async () => { completed++ }),
        semaphore.acquire(async () => { completed++ }),
      ])
      
      expect(completed).toBe(2)
    })
  })
})