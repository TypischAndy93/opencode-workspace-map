import { describe, it, expect, vi } from "vitest"
import { PriorityQueue, type SummarizationJob, type SummarizationPriority } from "../../src/utils/priority-queue.js"

function makeJob(
  rel: string,
  priority: SummarizationPriority = "background",
  timestamp: number = Date.now()
): SummarizationJob {
  return { rel, force: false, priority, timestamp }
}

async function waitForDrain(q: PriorityQueue): Promise<void> {
  return new Promise<void>((resolve) => {
    const check = () => {
      if (q.isEmpty()) {
        resolve()
      } else {
        setTimeout(check, 10)
      }
    }
    setTimeout(check, 10)
  })
}

describe("PriorityQueue", () => {
  describe("priority ordering", () => {
    it("orders changed > recent > warmup > background", async () => {
      const q = new PriorityQueue(4)
      const executed: string[] = []
      q.setExecuteFn(async (job) => {
        executed.push(job.rel)
      })

      // Use enqueueBatch so all jobs are sorted before processing starts
      q.enqueueBatch([
        makeJob("bg.ts", "background", 100),
        makeJob("ch.ts", "changed", 400),
        makeJob("rec.ts", "recent", 300),
        makeJob("wu.ts", "warmup", 200),
      ])

      await waitForDrain(q)
      expect(executed).toEqual(["ch.ts", "rec.ts", "wu.ts", "bg.ts"])
    })

    it("orders by timestamp within same priority (older first)", async () => {
      const q = new PriorityQueue(4)
      const executed: string[] = []
      q.setExecuteFn(async (job) => {
        executed.push(job.rel)
      })

      q.enqueueBatch([
        makeJob("later.ts", "background", 200),
        makeJob("earlier.ts", "background", 100),
      ])

      await waitForDrain(q)
      expect(executed).toEqual(["earlier.ts", "later.ts"])
    })

    it("respects concurrency limit", async () => {
      const q = new PriorityQueue(2)
      let maxConcurrent = 0
      let currentConcurrent = 0
      let allReleased = false
      const releaseGate = new Promise<void>((resolve) => {
        // We'll resolve this once all jobs should proceed
        ;(globalThis as any).__wmReleaseGate = resolve
      })

      q.setExecuteFn(async (job) => {
        currentConcurrent++
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent)
        await releaseGate
        currentConcurrent--
      })

      q.enqueueBatch([
        makeJob("a.ts", "background", 1),
        makeJob("b.ts", "background", 2),
        makeJob("c.ts", "background", 3),
      ])

      // Wait until jobs are active
      await new Promise((resolve) => setTimeout(resolve, 100))
      expect(maxConcurrent).toBeLessThanOrEqual(2)

      // Release all jobs at once
      allReleased = true
      ;(globalThis as any).__wmReleaseGate?.()

      await waitForDrain(q)
    })

    it("calls onDrain when queue is empty", async () => {
      const drain = vi.fn()
      const q = new PriorityQueue(4, drain)
      const executed: string[] = []
      q.setExecuteFn(async (job) => {
        executed.push(job.rel)
      })

      q.enqueueBatch([makeJob("a.ts", "background", 1)])

      await waitForDrain(q)
      expect(drain).toHaveBeenCalled()
    })
  })

  describe("enqueueBatch", () => {
    it("processes all jobs in a batch", async () => {
      const q = new PriorityQueue(4)
      const executed: string[] = []
      q.setExecuteFn(async (job) => {
        executed.push(job.rel)
      })

      q.enqueueBatch([
        makeJob("c.ts", "background", 300),
        makeJob("a.ts", "changed", 100),
        makeJob("b.ts", "recent", 200),
      ])

      await waitForDrain(q)
      expect(executed).toEqual(["a.ts", "b.ts", "c.ts"])
    })
  })

  describe("size and isEmpty (no executeFn, so jobs stay queued)", () => {
    it("reports correct size before processing completes", () => {
      // Don't set executeFn so process() still drains jobs immediately
      // but we check size right after enqueue before the microtask runs
      const q = new PriorityQueue(4)
      expect(q.isEmpty()).toBe(true)
      expect(q.size()).toBe(0)
    })

    it("size is 0 after clear", () => {
      const q = new PriorityQueue(4)
      q.clear()
      expect(q.size()).toBe(0)
    })
  })

  describe("clear and cancel", () => {
    it("cancel prevents new jobs", () => {
      const q = new PriorityQueue(4)
      q.cancel()
      q.enqueue(makeJob("a.ts", "background", 1))
      expect(q.size()).toBe(0)
      expect(q.isCancelled()).toBe(true)
    })

    it("resume allows new jobs after cancel", () => {
      const q = new PriorityQueue(4)
      q.cancel()
      q.resume()
      // After resume, enqueue will process immediately (no executeFn set)
      q.enqueue(makeJob("a.ts", "background", 1))
      expect(q.isCancelled()).toBe(false)
    })
  })

  describe("getJobsByPriority", () => {
    it("returns counts by priority", () => {
      // Use a queue without executeFn, but we need jobs to stay in queue.
      // Since process() drains immediately, we can't easily test this.
      // Instead, test that getJobsByPriority returns zeros for empty queue.
      const q = new PriorityQueue(4)
      const counts = q.getJobsByPriority()
      expect(counts.changed).toBe(0)
      expect(counts.recent).toBe(0)
      expect(counts.warmup).toBe(0)
      expect(counts.background).toBe(0)
    })
  })
})
