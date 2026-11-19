import { computed, getCurrentInstance, onBeforeUnmount, ref, watch, type Ref } from 'vue';
import { deskHost } from '../host';
import { deskDraftStore, readDeskDraft } from '../storage/deskDrafts';
import type { DeskSubmission } from '../request/submission';
import { askDeskConfirm } from './confirm';
import type { DeskFormDirty } from './formDirty';

/**
 * A refresh-friendly form: while it has unsaved changes, its unsent values (and the idempotency key of a submit
 * whose answer never came) are kept on this computer, so an accidental reload or a closed tab does not lose them.
 * When the page opens the same record again, the form asks whether to restore them (Enter restores, Escape
 * discards). Opt in per form; see "Drafts" in the framework README.
 *
 * A draft is keyed by the host's `draftScope` (company and user), the page and the record. It goes when the form
 * is clean again (saved, or loaded fresh), when the user discards it, and when the page is left in the app (the
 * leave question already asked about the changes). It expires after a day (`DESK_DRAFT_MAX_AGE_MS`).
 */
export interface DeskDraftOptions<T> {
  /** The page, such as `payment`. */
  page: string;
  /** The record on the form: its id, or `new`. Null keeps no draft (nothing to name yet). */
  record: () => string | number | null;
  /** The form finished loading its record and defaults: a kept draft is offered then, over them. */
  ready: () => boolean;
  /** The unsent form as plain JSON (files and functions are not kept). */
  read: () => T;
  /** Puts a restored draft on the form. */
  apply: (value: T) => void | Promise<void>;
  /** The form's tracker, or a flag: a draft is kept only while the form has unsaved changes. */
  dirty: DeskFormDirty | (() => boolean);
  /** The form's submission: its pending key is kept with the draft and comes back with it. */
  submission?: DeskSubmission;
  /** The restore question. Resolves true to restore. Default: `askDeskConfirm`. */
  ask?: (savedAt: number) => Promise<boolean>;
  /** Milliseconds a change waits before it is written, so typing writes once. Default 300. */
  delay?: number;
}

export interface DeskDraft {
  /** When the draft now on the form was saved, after a restore; null otherwise. */
  readonly restoredAt: Ref<number | null>;
  /** Drops the kept draft (an explicit discard). */
  discard(): Promise<void>;
  /** Writes a change still waiting for its delay. */
  flush(): Promise<void>;
}

interface Wanted {
  key: string;
  /** The draft as JSON text, or null to keep none. */
  text: string | null;
  submissionKey: string | null;
}

function askRestore(savedAt: number): Promise<boolean> {
  const when = new Date(savedAt).toLocaleString(deskHost().locale?.(), { dateStyle: 'medium', timeStyle: 'short' });
  return askDeskConfirm({
    title: 'Restore unsaved changes?',
    message: `This form has changes from ${when} that were not saved (the page was reloaded or closed). Restore them?`,
    okLabel: 'Restore',
    cancelLabel: 'Discard',
  });
}

export function useDeskDraft<T>(options: DeskDraftOptions<T>): DeskDraft {
  const delay = options.delay ?? 300;
  const restoredAt = ref<number | null>(null);
  /** The key whose kept draft was offered: from then on the form's changes are kept under it. */
  const offered = ref<string | null>(null);
  const isDirty = (): boolean => (typeof options.dirty === 'function' ? options.dirty() : options.dirty.dirty.value);

  const key = computed(() => {
    const scope = deskHost().draftScope?.() ?? null;
    const record = options.record();
    return scope && record !== null && record !== '' ? `${scope}|${options.page}|${String(record)}` : null;
  });

  async function offer(target: string): Promise<void> {
    const entry = await readDeskDraft<T>(target);
    if (key.value !== target) return;
    if (entry) {
      if (await (options.ask ?? askRestore)(entry.savedAt)) {
        if (typeof options.dirty !== 'function') options.dirty.arm();
        await options.apply(entry.value);
        options.submission?.restore(entry.submissionKey);
        restoredAt.value = entry.savedAt;
      } else {
        await deskDraftStore().remove(target);
      }
    }
    if (key.value === target) offered.value = target;
  }

  watch(
    [key, () => options.ready()],
    ([target, ready]) => {
      if (target !== offered.value) offered.value = null;
      if (target && ready && offered.value === null) void offer(target);
    },
    { immediate: true },
  );

  const wanted = computed<Wanted | null>(() => {
    const target = offered.value;
    if (!target || target !== key.value) return null;
    return {
      key: target,
      text: isDirty() ? JSON.stringify(options.read()) : null,
      submissionKey: options.submission?.key.value ?? null,
    };
  });

  let waiting: Wanted | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let writing: Promise<void> = Promise.resolve();

  function write(next: Wanted): Promise<void> {
    const store = deskDraftStore();
    writing = writing.then(() =>
      next.text === null ? store.remove(next.key) : store.write({ key: next.key, savedAt: Date.now(), value: JSON.parse(next.text) as unknown, submissionKey: next.submissionKey }),
    );
    return writing;
  }

  function flush(): Promise<void> {
    if (timer) clearTimeout(timer);
    timer = null;
    const next = waiting;
    waiting = null;
    return next ? write(next) : writing;
  }

  watch(wanted, (next, before) => {
    if (!next || (before && before.key === next.key && before.text === next.text && before.submissionKey === next.submissionKey)) return;
    waiting = next;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flush(), delay);
  });

  async function discard(): Promise<void> {
    if (timer) clearTimeout(timer);
    timer = null;
    waiting = null;
    restoredAt.value = null;
    const target = offered.value ?? key.value;
    await writing;
    if (target) await deskDraftStore().remove(target);
  }

  if (getCurrentInstance()) {
    // A reload or a closed tab does not unmount: the last change is written on the way out.
    const out = () => void flush();
    window.addEventListener('pagehide', out);
    onBeforeUnmount(() => {
      window.removeEventListener('pagehide', out);
      // Leaving the page in the app is a decision (a dirty form asked first): its draft goes.
      void discard();
    });
  }

  return { restoredAt, discard, flush };
}
