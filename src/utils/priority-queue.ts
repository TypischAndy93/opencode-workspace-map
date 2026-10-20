export type SummarizationPriority = "changed" | "recent" | "warmup" | "background"

export interface SummarizationJob {
  rel: string
  force: boolean
  priority: SummarizationPriority
  timestamp: number
}

export class PriorityQueue {
  private queue: SummarizationJob[] = []
  private processing = false
  private concurrency: number
  private active = 0
  private onDrain?: () => void
  private executeFn?: (job: SummarizationJob) => Promise<void>
  private cancelled = false

  constructor(concurrency: number, onDrain?: () => void) {
    this.concurrency = concurrency
    this.onDrain = onDrain
  }

  enqueue(job: SummarizationJob): void {
    if (this.cancelled) return
    this.queue.push(job)
    this.queue.sort((a, b) => {
      // Sort by priority first (changed > recent > warmup > background)
      const priorityOrder: Record<SummarizationPriority, number> = {
        changed: 0,
        recent: 1,
        warmup: 2,
        background: 3,
      }
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority]
      if (priorityDiff !== 0) return priorityDiff
      // Then by timestamp (older first)
      return a.timestamp - b.timestamp
    })
    this.process()
  }

  enqueueBatch(jobs: SummarizationJob[]): void {
    if (this.cancelled) return
    for (const job of jobs) {
      this.queue.push(job)
    }
    this.queue.sort((a, b) => {
      const priorityOrder: Record<SummarizationPriority, number> = {
        changed: 0,
        recent: 1,
        warmup: 2,
        background: 3,
      }
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority]
      if (priorityDiff !== 0) return priorityDiff
      return a.timestamp - b.timestamp
    })
    this.process()
  }

  private async process(): Promise<void> {
    if (this.processing || this.active >= this.concurrency || this.queue.length === 0 || this.cancelled) {
      if (this.queue.length === 0 && this.active === 0 && this.onDrain) {
        this.onDrain()
      }
      return
    }

    this.processing = true

    while (this.queue.length > 0 && this.active < this.concurrency && !this.cancelled) {
      const job = this.queue.shift()
      if (!job) break

      this.active++
      try {
        // The actual processing is done by the caller via a callback
        // This queue just manages ordering and concurrency
        await this.executeJob(job)
      } catch (err) {
        console.error("[workspace-map] PriorityQueue job failed:", err)
      } finally {
        this.active--
      }
    }

    this.processing = false
    this.process() // Continue processing if there are more jobs
  }

  // Override this method to provide the actual job execution
  protected async executeJob(job: SummarizationJob): Promise<void> {
    if (this.executeFn) {
      await this.executeFn(job)
    }
  }

  setExecuteFn(fn: (job: SummarizationJob) => Promise<void>): void {
    this.executeFn = fn
  }

  size(): number {
    return this.queue.length
  }

  activeCount(): number {
    return this.active
  }

  isEmpty(): boolean {
    return this.queue.length === 0 && this.active === 0
  }

  clear(): void {
    this.queue = []
    this.cancelled = true
  }

  cancel(): void {
    this.cancelled = true
    this.queue = []
  }

  resume(): void {
    this.cancelled = false
    this.process()
  }

  isCancelled(): boolean {
    return this.cancelled
  }

  // Get jobs by priority for debugging/stats
  getJobsByPriority(): Record<SummarizationPriority, number> {
    const counts: Record<SummarizationPriority, number> = {
      changed: 0,
      recent: 0,
      warmup: 0,
      background: 0,
    }
    for (const job of this.queue) {
      counts[job.priority]++
    }
    return counts
  }
}