/**
 * Cancellation utilities for async operations.
 * Provides AbortSignal support with timeout and manual cancellation.
 */

export interface CancellationToken {
  readonly signal: AbortSignal;
  readonly isCancelled: boolean;
  cancel(): void;
  throwIfCancelled(): void;
}

export function createCancellationToken(): CancellationToken {
  const controller = new AbortController();
  return {
    get signal() { return controller.signal; },
    get isCancelled() { return controller.signal.aborted; },
    cancel() { controller.abort(); },
    throwIfCancelled() { if (controller.signal.aborted) throw new DOMException("Operation cancelled", "AbortError"); },
  };
}

export function createCancellationTokenWithTimeout(ms: number): CancellationToken {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  
  return {
    get signal() { return controller.signal; },
    get isCancelled() { return controller.signal.aborted; },
    cancel() { 
      clearTimeout(timeoutId);
      controller.abort(); 
    },
    throwIfCancelled() { if (controller.signal.aborted) throw new DOMException("Operation cancelled", "AbortError"); },
  };
}

export function raceCancellation<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(new DOMException("Operation cancelled", "AbortError"));
  }
  
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      promise.then(resolve).catch(reject); // Let the original promise settle
      reject(new DOMException("Operation cancelled", "AbortError"));
    };
    
    signal.addEventListener("abort", onAbort, { once: true });
    
    promise
      .then((value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      })
      .catch((error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      });
  });
}

export function withCancellation<T>(promise: Promise<T>, signal: AbortSignal, cleanup?: () => void): Promise<T> {
  if (signal.aborted) {
    cleanup?.();
    return Promise.reject(new DOMException("Operation cancelled", "AbortError"));
  }
  
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      cleanup?.();
      reject(new DOMException("Operation cancelled", "AbortError"));
    };
    
    signal.addEventListener("abort", onAbort, { once: true });
    
    promise
      .then((value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      })
      .catch((error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      });
  });
}

export function createAbortSignal(): AbortSignal {
  return new AbortController().signal;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function isCancelledError(error: unknown): boolean {
  return isAbortError(error) || (error instanceof Error && error.message === "Operation cancelled");
}