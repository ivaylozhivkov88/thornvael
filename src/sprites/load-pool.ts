/**
 * Bounded concurrency pool and timeout helpers for asset/atlas loading.
 * Keeps peak simultaneous image decodes low (default 3) so WebKit/mobile
 * software GL does not stall on 18+ parallel decode/canvas allocations.
 */

export const DEFAULT_ATLAS_CONCURRENCY = 3;
export const DEFAULT_LOAD_TIMEOUT_MS = 15_000;

/**
 * Race a promise against a timeout; cleans up the timer on settle.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs = DEFAULT_LOAD_TIMEOUT_MS,
  label = 'operation',
): Promise<T> {
  if (timeoutMs <= 0 || !Number.isFinite(timeoutMs)) return promise;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout after ${timeoutMs}ms: ${label}`));
    }, timeoutMs);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Fetch with an AbortController timeout.
 */
export async function fetchWithTimeout(
  url: string,
  timeoutMs = DEFAULT_LOAD_TIMEOUT_MS,
): Promise<Response> {
  if (timeoutMs <= 0 || !Number.isFinite(timeoutMs) || typeof AbortController === 'undefined') {
    return fetch(url);
  }
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Run async task factories with at most `concurrency` in flight at once,
 * preserving input order and returning PromiseSettledResult for each task.
 */
export async function runWithPool<T>(
  tasks: readonly (() => Promise<T>)[],
  concurrency = DEFAULT_ATLAS_CONCURRENCY,
): Promise<PromiseSettledResult<T>[]> {
  const results = new Array<PromiseSettledResult<T>>(tasks.length);
  if (tasks.length === 0) return results;
  const limit = Math.max(1, Math.min(Math.floor(concurrency) || 1, tasks.length));
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const idx = nextIndex++;
      if (idx >= tasks.length) return;
      try {
        const value = await tasks[idx]!();
        results[idx] = { status: 'fulfilled', value };
      } catch (reason) {
        results[idx] = { status: 'rejected', reason };
      }
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}
