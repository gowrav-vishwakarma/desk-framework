import { computed, getCurrentInstance, inject, onBeforeUnmount, ref, watch, type Ref } from 'vue';
import { routeLocationKey, routerKey, type LocationQuery } from 'vue-router';
import { deskHost } from '../host';
import { deskDraftStore, readDeskDraft } from '../storage/deskDrafts';
import { deskUuid } from '../request/uuid';
import { inDeskPageDialog } from '../page/pageContext';
import { DESK_DRAFT_QUERY_KEY } from './draftQuery';

/**
 * Drafts: a desk form survives an accidental reload. Every form with a `useDeskFormDirty` tracker has one unless it
 * opts out (`draft: false`); see "Drafts" in the framework README.
 *
 * One rule for a new record and an existing one: on the first change the page puts a draft key in its URL
 * (`?draft=<key>`, `router.replace`, no new history entry) and keeps the unsent form under that key. A reload keeps
 * the URL, so the form comes back with it (and with the idempotency key of a save whose answer never came).
 * Opening the page without the key (Add New, Edit, a link) starts from the server record or an empty form and
 * drops that page's old drafts, so a stale draft never overrides a saved record. A save (the form clean again) or
 * Discard removes the draft and the key.
 */

export interface DeskDraftOptions<T> {
  /** The form as kept in a draft (plain JSON). Default: the tracker's source. Files (any `Blob`) are left out. */
  read?: () => T;
  /** Puts a restored draft on the form. Default: its top-level keys assigned onto the tracker's source. */
  apply?: (saved: T) => void | Promise<void>;
}

export interface DeskDraft {
  /** When the draft now on the form was saved, after a restore; null otherwise. */
  readonly restoredAt: Ref<number | null>;
  /** The idempotency key of a save whose answer never came, or null. */
  readonly pendingKey: Ref<string | null>;
  /**
   * Runs the form's save with its idempotency key (the host's client sends it as `Idempotency-Key`): the pending
   * one, else a new one, kept with the draft. Success clears it, and so does a failure the server answered (host
   * `submitAnswered`). A lost answer or an aborted call keeps it, so the next Save (also after a reload) repeats the
   * same submission and the server answers it instead of saving twice.
   */
  submit<R>(save: (idempotencyKey: string) => Promise<R>): Promise<R>;
  /** Puts the record back as it was loaded and removes the draft (the restored note's Discard). */
  discard(): Promise<void>;
  /** Writes a change still waiting for its delay. */
  flush(): Promise<void>;
}

/** What the tracker gives its draft. */
export interface DeskDraftForm<T> {
  read: () => T;
  apply: (saved: T) => void | Promise<void>;
  dirty: () => boolean;
  /** The form as it is now is the baseline, and every later change counts (a restore). */
  takeBaseline: () => void;
  /** The user typed or clicked in the form since the last `takeBaseline`. */
  touched: () => boolean;
}

/** Milliseconds a change waits before it is written, so typing writes once. */
const WRITE_DELAY = 300;

/** Files cannot be kept as JSON (they would come back as `{}`): a draft leaves them out. */
function withoutFiles(_key: string, value: unknown): unknown {
  return typeof Blob !== 'undefined' && value instanceof Blob ? undefined : value;
}

const asText = (value: unknown): string => JSON.stringify(value, withoutFiles) ?? 'null';

function queryKey(query: LocationQuery): string | null {
  const raw = query[DESK_DRAFT_QUERY_KEY];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' && value !== '' ? value : null;
}

interface Wanted {
  /** The page's URL key, or '' before the first change. */
  key: string;
  /** The draft as JSON text, or null to keep none. */
  text: string | null;
  submissionKey: string | null;
}

/**
 * A form's draft. Kept only for a routed page (not inside a page dialog, not opted out) with a host `draftScope`; otherwise it
 * holds just the idempotency key, in memory. The tracker calls `loaded()` on every `reset()`: the first one (the
 * record or a new form's defaults are on the form) starts the draft.
 */
export function useDeskFormDraft<T>(form: DeskDraftForm<T>, keep = true): DeskDraft & { loaded: () => void } {
  const restoredAt = ref<number | null>(null);
  const pendingKey = ref<string | null>(null);
  const router = keep && getCurrentInstance() && !inDeskPageDialog() ? inject(routerKey, null) : null;
  const route = router ? inject(routeLocationKey, null) : null;

  /** `<scope>|<path>`: the page whose draft is on, set by its first load. */
  const page = ref<string | null>(null);
  /** The form as loaded, before a restore: what Discard puts back. */
  let loadedText: string | null = null;
  /** The restored draft, put on again when the page loads once more before the user touches it. */
  let restored: T | null = null;
  let navigating = false;

  const urlKey = computed(() => (route ? queryKey(route.query) : null));

  async function restore(saved: T, savedAt: number, submissionKey: string | null): Promise<void> {
    loadedText = asText(form.read());
    form.takeBaseline();
    await form.apply(saved);
    restored = saved;
    restoredAt.value = savedAt;
    pendingKey.value = submissionKey;
  }

  async function begin(): Promise<void> {
    const scope = deskHost().draftScope?.() ?? null;
    if (!route || !scope) return;
    const path = route.path;
    const target = `${scope}|${path}`;
    const key = urlKey.value;
    if (!key) {
      // Opened without a key (Add New, Edit, a link): the server record (or an empty form) wins; old drafts go.
      await deskDraftStore().removePrefix(`${target}|`);
    } else {
      const entry = await readDeskDraft<T>(`${target}|${key}`);
      if (route.path !== path) return;
      if (entry) await restore(entry.value, entry.savedAt, entry.submissionKey);
    }
    page.value = target;
  }

  /** On every `reset()`: the first is the load; a later one before any input puts a restored draft on again. */
  function loaded(): void {
    if (page.value === null) {
      void begin();
    } else if (restored !== null && !form.touched()) {
      form.takeBaseline();
      void form.apply(restored);
    } else {
      restored = null;
    }
  }

  // Another record on the same component (a param change): it starts again with its own load.
  if (route) {
    watch(
      () => route.path,
      () => {
        page.value = null;
        restored = null;
        restoredAt.value = null;
      },
    );
  }

  const wanted = computed<Wanted | null>(() => {
    if (!page.value) return null;
    return { key: urlKey.value ?? '', text: form.dirty() ? asText(form.read()) : null, submissionKey: pendingKey.value };
  });

  let waiting: Wanted | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let writing: Promise<void> = Promise.resolve();

  /** A dirty form without a key yet gets one in its URL (no new history entry). */
  function keyFor(next: Wanted): string {
    if (next.key) return next.key;
    const key = deskUuid();
    if (router && route) void router.replace({ query: { ...route.query, [DESK_DRAFT_QUERY_KEY]: key } });
    return key;
  }

  /** A clean form's key leaves the URL, unless the page is being left (a save that goes back to the list). */
  function dropUrlKey(): void {
    setTimeout(() => {
      if (!router || !route || navigating || !urlKey.value || form.dirty() || page.value !== `${deskHost().draftScope?.() ?? ''}|${route.path}`) return;
      const query = { ...route.query };
      delete query[DESK_DRAFT_QUERY_KEY];
      void router.replace({ query });
    }, 0);
  }

  function write(next: Wanted): Promise<void> {
    const store = deskDraftStore();
    const owner = page.value;
    if (!owner) return writing;
    if (next.text === null) {
      if (!next.key) return writing;
      dropUrlKey();
      writing = writing.then(() => store.remove(`${owner}|${next.key}`));
      return writing;
    }
    const entry = { key: `${owner}|${keyFor(next)}`, savedAt: Date.now(), value: JSON.parse(next.text) as unknown, submissionKey: next.submissionKey };
    writing = writing.then(() => store.write(entry));
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
    if (!next) return;
    // The key arriving in the URL for a draft just written is not a change.
    if (before && before.text === next.text && before.submissionKey === next.submissionKey && (before.key === next.key || !before.key)) return;
    waiting = next;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flush(), WRITE_DELAY);
  });

  async function discard(): Promise<void> {
    if (loadedText !== null) await form.apply(JSON.parse(loadedText) as T);
    form.takeBaseline();
    restored = null;
    loadedText = null;
    restoredAt.value = null;
    pendingKey.value = null;
    // The form is clean now: the watcher removes the draft and its URL key.
  }

  async function submit<R>(save: (idempotencyKey: string) => Promise<R>): Promise<R> {
    pendingKey.value ??= deskUuid();
    const sent = pendingKey.value;
    try {
      const answer = await save(sent);
      if (pendingKey.value === sent) pendingKey.value = null;
      return answer;
    } catch (error) {
      if (pendingKey.value === sent && deskHost().submitAnswered?.(error)) pendingKey.value = null;
      throw error;
    }
  }

  if (router) {
    const offBefore = router.beforeEach(() => {
      navigating = true;
    });
    const offAfter = router.afterEach(() => {
      navigating = false;
    });
    // A reload or a closed tab does not unmount: the last change is written on the way out.
    const out = () => void flush();
    window.addEventListener('pagehide', out);
    onBeforeUnmount(() => {
      offBefore();
      offAfter();
      window.removeEventListener('pagehide', out);
      // Leaving in the app keeps the draft under its URL key (Back brings both back) until it expires.
      void flush();
    });
  }

  return { restoredAt, pendingKey, submit, discard, flush, loaded };
}
