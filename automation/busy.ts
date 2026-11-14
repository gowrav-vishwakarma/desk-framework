import { deskHost } from '../host';

let count = 0;
const labels = new Map<number, string>();
let nextId = 1;

/** Start counting a piece of async work. Call the returned function when it settles. */
export function beginDeskWork(label: string): () => void {
  const id = nextId;
  nextId += 1;
  count += 1;
  labels.set(id, label);
  let done = false;
  return () => {
    if (done) return;
    done = true;
    count -= 1;
    labels.delete(id);
  };
}

/** Make `waitIdle()` wait for this promise. Returns the same promise. */
export function trackDeskWork<T>(promise: Promise<T>, label: string): Promise<T> {
  const end = beginDeskWork(label);
  const finish = (): void => end();
  promise.then(finish, finish);
  return promise;
}

export function pendingDeskWork(): { count: number; labels: string[] } {
  const requests = deskHost().automation?.pendingRequests?.() ?? 0;
  return { count: count + requests, labels: [...labels.values(), ...(requests > 0 ? [`http x${requests}`] : [])] };
}

function frame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 16);
  });
}

/**
 * Resolve once no tracked work is pending for two frames in a row.
 * Gives up after `timeoutMs` and reports what was still pending.
 */
export async function waitDeskIdle(timeoutMs = 10000): Promise<{ idle: boolean; pending: string[] }> {
  const started = Date.now();
  let quiet = 0;
  while (Date.now() - started < timeoutMs) {
    await frame();
    if (pendingDeskWork().count === 0) {
      quiet += 1;
      if (quiet >= 2) return { idle: true, pending: [] };
    } else {
      quiet = 0;
    }
  }
  return { idle: false, pending: pendingDeskWork().labels };
}
