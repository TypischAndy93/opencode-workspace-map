export function createSemaphore(limit: number) {
  let running = 0
  const queue: Array<() => void> = []
  return {
    async acquire<T>(fn: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        const run = async () => {
          running++
          try {
            const result = await fn()
            resolve(result)
          } catch (err) {
            reject(err)
          } finally {
            running--
            if (queue.length > 0) {
              const next = queue.shift()!
              next()
            }
          }
        }
        if (running < limit) {
          run()
        } else {
          queue.push(run)
        }
      })
    },
  }
}