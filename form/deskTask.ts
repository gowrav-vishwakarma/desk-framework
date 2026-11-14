import { computed, inject, ref, watch, type ComputedRef, type Ref } from 'vue';
import { DESK_FORM_DIRTY, type DeskFormDirty } from './formDirty';

/**
 * When a single-click task takes clicks again after it ran.
 * `done` (default): as soon as it finishes.
 * `dirty`: after a failure at once; after a success only once the form has unsaved changes again,
 * so saving an unchanged record twice is not possible. Without a dirty source it acts as `done`.
 */
export type DeskTaskAfter = 'done' | 'dirty';

/** What `after: 'dirty'` watches: the form's tracker, or a flag. */
export type DeskFormDirtySource = DeskFormDirty | (() => boolean);

export interface DeskTaskOptions {
  /** Take every click, even while a run is in flight. Off by default. */
  repeat?: boolean;
  after?: DeskTaskAfter;
  /** For `after: 'dirty'`: the form's tracker or a flag. Defaults to the enclosing `DeskForm`'s tracker. */
  dirty?: DeskFormDirtySource;
}

/** What a `DeskButton` ref offers. */
export interface DeskButtonApi {
  focus: () => void;
}

export interface DeskTask {
  /** Run the work unless the task is locked. Bind the button and its shortcut to this one function. */
  run: () => Promise<void>;
  /** The work is in flight. Draw the loading state from this. */
  readonly busy: Ref<boolean>;
  /** A click would be ignored now: busy, or waiting for an edit after a save. */
  readonly locked: ComputedRef<boolean>;
}

/**
 * One piece of work that a button, a shortcut and Enter-to-submit all start. A second start while
 * the first is in flight is ignored, so a double click or a held Ctrl+S saves once.
 * The work fails when it throws or returns `false`; anything else is a success. A throw is passed on.
 */
export function useDeskTask(work: () => unknown, options: DeskTaskOptions = {}): DeskTask {
  const busy = ref(false);
  /** Saved, and waiting for the form to change before the next run. */
  const waiting = ref(false);
  const injected = options.after === 'dirty' && options.dirty === undefined ? inject(DESK_FORM_DIRTY, null) : null;
  const source = options.dirty ?? injected;
  const isDirty = (): boolean | null => {
    if (!source) return null;
    return typeof source === 'function' ? source() : source.dirty.value;
  };
  const watchesDirty = options.after === 'dirty' && source !== null && source !== undefined;

  if (watchesDirty) {
    watch(isDirty, (dirty) => {
      if (dirty) waiting.value = false;
    });
  }

  const locked = computed(() => !options.repeat && (busy.value || waiting.value));

  async function run(): Promise<void> {
    if (locked.value) return;
    busy.value = true;
    let ok = false;
    try {
      ok = (await work()) !== false;
    } finally {
      busy.value = false;
      // A save that left the form clean waits for the next edit. One that left it dirty stays open.
      if (ok && watchesDirty && isDirty() === false) waiting.value = true;
    }
  }

  return { run, busy, locked };
}
