import { describe, it, expect, vi, beforeEach } from "vitest"
import { enqueue, resetChain, setDisposed } from "../../src/utils/enqueue.js"

describe("enqueue", () => {
  beforeEach(() => {
    resetChain()
    setDisposed(false)
  })

  it("executes queued functions in order", async () => {
    const results: number[] = []
    
    await enqueue(async () => { results.push(1) })
    await enqueue(async () => { results.push(2) })
    await enqueue(async () => { results.push(3) })
    
    // Wait for queue to process
    await new Promise(r => setTimeout(r, 50))
    
    expect(results).toEqual([1, 2, 3])
  })

  it("returns promise that resolves with result", async () => {
    const promise = enqueue(async () => 42)
    const result = await promise
    expect(result).toBe(42)
  })

  it("propagates errors", async () => {
    const promise = enqueue(async () => { throw new Error("test error") })
    await expect(promise).rejects.toThrow("test error")
  })

  it("handles synchronous functions", async () => {
    const promise = enqueue(() => 42)
    const result = await promise
    expect(result).toBe(42)
  })

  it("respects disposal", async () => {
    setDisposed(true)
    let executed = false
    
    // After disposal, enqueue should reject
    const promise = enqueue(async () => { executed = true })
    
    // Wait for the queue to process
    await new Promise(r => setTimeout(r, 50))
    
    // The function should not have executed
    expect(executed).toBe(false)
  })

  it("chains multiple enqueues correctly", async () => {
    const order: string[] = []
    
    const p1 = enqueue(async () => { order.push("a") })
    const p2 = enqueue(async () => { order.push("b") })
    const p3 = enqueue(async () => { order.push("c") })
    
    await Promise.all([p1, p2, p3])
    await new Promise(r => setTimeout(r, 50))
    
    expect(order).toEqual(["a", "b", "c"])
  })

  it("handles concurrent enqueues", async () => {
    const results: number[] = []
    
    const promises = Array.from({ length: 20 }, (_, i) =>
      enqueue(async () => {
        await new Promise(r => setTimeout(r, Math.random() * 10))
        results.push(i)
        return i
      })
    )
    
    const resolved = await Promise.all(promises)
    await new Promise(r => setTimeout(r, 50))
    
    expect(resolved).toHaveLength(20)
    expect(results).toHaveLength(20)
  })

  it("resetChain clears the queue", async () => {
    await enqueue(async () => {})
    resetChain()
    
    // After reset, new enqueues should work
    let executed = false
    await enqueue(async () => { executed = true })
    await new Promise(r => setTimeout(r, 50))
    expect(executed).toBe(true)
  })
})