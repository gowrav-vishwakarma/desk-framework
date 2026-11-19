import { getCurrentInstance, onBeforeUnmount, ref, type Ref } from 'vue';
import { deskPageSignal, linkDeskAbort } from './pageAbort';

/**
 * Work a component starts again and again where only the newest run counts: a report re-run when its filters
 * change, a search as the user types. Each run gets its own signal; starting a run aborts the one before it,
 * and so do leaving the page and unmounting the component.
 */
export interface DeskLatest {
  /**
   * Runs `work` with a signal for its calls and resolves with its answer. A run that a newer run (or `abort`)
   * replaced rejects with an `AbortError` even when its answer came in, so a stale answer never lands; the
   * caller's catch treats it as nothing to say (`deskIsAborted`).
   */
  run<T>(work: (signal: AbortSignal) => Promise<T>): Promise<T>;
  /** Aborts the run in flight, if any. */
  abort(): void;
  /** The newest run is in flight. Draw the loading state from this. */
  readonly busy: Ref<boolean>;
}

function replaced(): DOMException {
  return new DOMException('A newer run replaced this one', 'AbortError');
}

export function useDeskLatest(): DeskLatest {
  const busy = ref(false);
  let current: AbortController | null = null;

  function abort(): void {
    current?.abort(replaced());
    current = null;
    busy.value = false;
  }

  async function run<T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> {
    current?.abort(replaced());
    const controller = new AbortController();
    current = controller;
    const unlink = linkDeskAbort(controller, deskPageSignal());
    busy.value = true;
    try {
      let answer: T;
      try {
        answer = await work(controller.signal);
      } catch (failure) {
        // A replaced run's failure is not news either.
        throw controller.signal.aborted ? controller.signal.reason : failure;
      }
      if (controller.signal.aborted) throw controller.signal.reason;
      return answer;
    } finally {
      unlink();
      if (current === controller) {
        current = null;
        busy.value = false;
      }
    }
  }

  if (getCurrentInstance()) onBeforeUnmount(abort);
  return { run, abort, busy };
}
