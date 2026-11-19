import { computed, getCurrentInstance, inject, nextTick, onBeforeUnmount, ref, shallowReactive, shallowRef, watch, type ComputedRef, type InjectionKey } from 'vue';
import { confirmDeskDiscard } from './leaveGuard';
import { useDeskFormDraft, type DeskDraft, type DeskDraftOptions } from './draft';

/**
 * Unsaved changes for one form. A form is one record, however many grids, tabs and settings
 * sheets show it, so it has one dirty flag. See "Unsaved changes" in the framework README.
 */

/** A sub-form that saves on its own, such as opening stock lines beside a product. */
export interface DeskFormPart {
  dirty: () => boolean;
  /** Saves the part. Resolve true when it went through. Offered as Save in the leave question. */
  save?: () => Promise<boolean>;
  /**
   * `page` (default): the part keeps its work while hidden (KeepAlive, or state on the record), so
   * only leaving the page asks. `swap`: the part loses its work when it unmounts, so a tab switch
   * that would unmount it asks first.
   */
  guard?: 'page' | 'swap';
}

interface RegisteredPart extends DeskFormPart {
  node: () => Node | null;
}

export interface DeskFormDirty {
  /** The record differs from its baseline, or a part has unsaved work. */
  readonly dirty: ComputedRef<boolean>;
  /** The form's draft (refresh-friendly) and the idempotency key of its save: `changes.draft.submit(save)`. */
  readonly draft: DeskDraft;
  /** Top-level keys of the record that differ from their baseline. */
  readonly changed: ComputedRef<string[]>;
  isDirty(key: string): boolean;
  /** First user input. Until then every change is taken as the baseline (defaults, late loads). */
  arm(): void;
  /** The whole record as it is now is the baseline: after a load or a save. */
  reset(): void;
  /** These keys as they are now are their baseline: a section that loaded late, or saved on its own. */
  rebase(...keys: string[]): void;
  /**
   * Runs `run` (load a section, show a pane), waits a tick for panes to mount, then takes the listed
   * keys that were clean before as their baseline. Defaults a pane fills in are not edits; edits
   * the user made before stay dirty.
   */
  settle(keys: string[], run: () => unknown): Promise<void>;
  /** Used by DeskForm. */
  addPart(part: RegisteredPart): () => void;
  /** Used by DeskForm: one save for the page leave question when only parts that can save are dirty. */
  pendingSave(): (() => Promise<boolean>) | null;
  /** Used by DeskTabs: `true` when nothing would be lost, else the answer to the question it asks. */
  beforeSwap(pane: Element | null): true | Promise<boolean>;
}

export const DESK_FORM_DIRTY: InjectionKey<DeskFormDirty> = Symbol('deskFormDirty');

function snapshot(value: unknown, ignored: ReadonlySet<string>): Map<string, string> {
  const map = new Map<string, string>();
  if (!value || typeof value !== 'object') return map;
  for (const [key, item] of Object.entries(value)) {
    if (!ignored.has(key)) map.set(key, JSON.stringify(item) ?? '');
  }
  return map;
}

/** One save that runs each part's save in turn, or null when one of them cannot save itself. */
function saveAll(parts: readonly DeskFormPart[]): (() => Promise<boolean>) | null {
  const savers = parts.map((part) => part.save);
  if (savers.length === 0 || savers.some((save) => !save)) return null;
  return async () => {
    for (const run of savers) if (run && !(await run())) return false;
    return true;
  };
}

export interface DeskFormDirtyOptions<T> {
  ignore?: readonly (keyof T & string)[];
  /**
   * The form's draft (`form/draft.ts`), on by default: `false` keeps none; `read` / `apply` when the source is not
   * the record itself (a copy without server-only fields) or the record loads in parts.
   */
  draft?: false | DeskDraftOptions<unknown>;
}

export function useDeskFormDirty<T extends object>(source: () => T, options: DeskFormDirtyOptions<T> = {}): DeskFormDirty {
  const ignored = new Set<string>(options.ignore ?? []);
  const current = computed(() => snapshot(source(), ignored));
  const baseline = shallowRef(current.value);
  const quiet = ref(true);
  const parts = shallowReactive<RegisteredPart[]>([]);
  /** The user typed or clicked since the last baseline a draft took. */
  let touched = false;

  watch(current, (now) => {
    if (quiet.value) baseline.value = now;
  });

  const changed = computed(() => {
    if (quiet.value) return [];
    const now = current.value;
    const base = baseline.value;
    const keys = new Set([...now.keys(), ...base.keys()]);
    return [...keys].filter((key) => now.get(key) !== base.get(key));
  });

  const dirty = computed(() => changed.value.length > 0 || parts.some((part) => part.dirty()));

  function rebase(...keys: string[]): void {
    const now = current.value;
    const next = new Map(baseline.value);
    for (const key of keys) {
      const value = now.get(key);
      if (value === undefined) next.delete(key);
      else next.set(key, value);
    }
    baseline.value = next;
  }

  const draftOptions = options.draft || {};
  const draft = useDeskFormDraft<unknown>(
    {
      read: draftOptions.read ?? source,
      apply: draftOptions.apply ?? ((saved) => void Object.assign(source(), saved)),
      dirty: () => dirty.value,
      takeBaseline() {
        baseline.value = current.value;
        quiet.value = false;
        touched = false;
      },
      touched: () => touched,
    },
    options.draft !== false,
  );

  return {
    draft,
    dirty,
    changed,
    isDirty: (key) => changed.value.includes(key),
    arm() {
      touched = true;
      if (!quiet.value) return;
      baseline.value = current.value;
      quiet.value = false;
    },
    reset() {
      baseline.value = current.value;
      draft.loaded();
    },
    rebase,
    async settle(keys, run) {
      const clean = keys.filter((key) => !changed.value.includes(key));
      await run();
      await nextTick();
      if (clean.length > 0) rebase(...clean);
    },
    addPart(part) {
      parts.push(part);
      return () => {
        const at = parts.indexOf(part);
        if (at >= 0) parts.splice(at, 1);
      };
    },
    pendingSave() {
      if (changed.value.length > 0) return null;
      return saveAll(parts.filter((part) => part.dirty()));
    },
    beforeSwap(pane) {
      const lost = parts.filter((part) => part.guard === 'swap' && part.dirty() && (!pane || !part.node() || pane.contains(part.node())));
      if (lost.length === 0) return true;
      const save = saveAll(lost);
      return confirmDeskDiscard({ what: 'This section', ...(save ? { save } : {}) });
    },
  };
}

/**
 * Registers a sub-form with the DeskForm around it. Call it in the part's setup. The form's leave
 * check then counts the part, and a `swap` part is asked about before a tab switch drops it.
 */
export function useDeskFormPart(part: DeskFormPart): void {
  const form = inject(DESK_FORM_DIRTY, null);
  if (!form) return;
  const instance = getCurrentInstance();
  const remove = form.addPart({
    guard: 'page',
    ...part,
    node: () => (instance?.proxy?.$el as Node | null | undefined) ?? null,
  });
  onBeforeUnmount(remove);
}
