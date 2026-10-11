let chain: Promise<void> = Promise.resolve()
let disposed = false

export function setDisposed(value: boolean): void {
  disposed = value
}

export function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  if (disposed) return Promise.resolve(undefined as T)
  const next = chain.then(fn, fn)
  chain = next.then(
    () => undefined,
    () => undefined,
  )
  return next
}

export function resetChain(): void {
  chain = Promise.resolve()
}