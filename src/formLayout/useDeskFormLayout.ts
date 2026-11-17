import { computed, onBeforeUnmount, onMounted, ref, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue';
import { useDeskLayer } from '../keys/useDeskLayer';
import { useDeskToolbar } from '../layout/toolbar';
import { useDeskAutomationNode } from '../automation/registry';
import { onDeskPrefInvalidate } from '../automation/sets';
import { readDeskPref, writeDeskPref } from '../storage/deskPrefs';
import { layoutOps, layoutReadout, type DeskLayoutAutomation } from './layoutAutomation';
import { resolveFormLayout } from './resolve';
import { copyFormLayout, type DeskFormLayout, type DeskLayoutFieldRef, type DeskLayoutOption } from './types';

/** The last raw save read or written for a key, so the next visit does not wait on IndexedDB. */
const rawCache = new Map<string, unknown>();

/**
 * The saved layout for one form, merged with the fields that exist now.
 * `draft` is the designer's unsaved copy. The form draws `layout`, which is the draft while it is set.
 */
export function useDeskFormLayout(
  key: MaybeRefOrGetter<string>,
  defaults: MaybeRefOrGetter<DeskFormLayout>,
  fields: () => readonly DeskLayoutFieldRef[],
  options: () => readonly DeskLayoutOption[] = () => [],
  automation: DeskLayoutAutomation = {},
) {
  const keyText = computed(() => toValue(key));
  const raw = ref<unknown>(rawCache.get(keyText.value) ?? null);
  const ready = ref(rawCache.has(keyText.value));
  const draft = ref<DeskFormLayout | null>(null);

  const resolved = computed(() => resolveFormLayout(toValue(defaults), raw.value, fields(), options()));
  const layout = computed(() => draft.value ?? resolved.value);

  async function load(storageKey: string): Promise<void> {
    if (rawCache.has(storageKey)) {
      raw.value = rawCache.get(storageKey) ?? null;
      ready.value = true;
      return;
    }
    const saved = await readDeskPref<unknown>(storageKey);
    rawCache.set(storageKey, saved);
    if (storageKey !== keyText.value) return;
    raw.value = saved;
    ready.value = true;
  }

  let stopInvalidate: (() => void) | null = null;
  onMounted(() => {
    void load(keyText.value);
    // A set that rewrote this key behind our back: forget the cache and read it again.
    stopInvalidate = onDeskPrefInvalidate((changed) => {
      rawCache.delete(changed);
      if (changed === keyText.value) {
        draft.value = null;
        void load(changed);
      }
    });
  });
  onBeforeUnmount(() => stopInvalidate?.());

  watch(keyText, (storageKey) => {
    draft.value = null;
    ready.value = rawCache.has(storageKey);
    raw.value = rawCache.get(storageKey) ?? null;
    void load(storageKey);
  });

  const fieldKey = computed(() => fields().map((field) => `${field.id}:${field.locked ? 1 : 0}`).join('|'));
  const optionKey = computed(() => options().map((option) => `${option.id}:${option.default}`).join('|'));
  watch([fieldKey, optionKey], () => {
    if (draft.value) draft.value = resolveFormLayout(toValue(defaults), draft.value, fields(), options());
  });

  function begin(): void {
    if (!draft.value) draft.value = copyFormLayout(resolved.value);
  }

  function replace(next: DeskFormLayout): void {
    draft.value = next;
  }

  function cancel(): void {
    draft.value = null;
  }

  async function save(): Promise<void> {
    const next = copyFormLayout(draft.value ?? resolved.value);
    raw.value = next;
    rawCache.set(keyText.value, next);
    draft.value = null;
    await writeDeskPref(keyText.value, next);
  }

  function reset(): void {
    draft.value = resolveFormLayout(toValue(defaults), null, fields(), options());
  }

  /** The chosen value, including an unsaved designer change. Falls back to the option default. */
  function option(id: string): string {
    const chosen = layout.value.options?.[id];
    if (chosen) return chosen;
    return options().find((item) => item.id === id)?.default ?? '';
  }

  async function invalidate(): Promise<void> {
    rawCache.delete(keyText.value);
    await load(keyText.value);
  }

  const api = { key: () => keyText.value, layout, draft, fields, options, begin, replace, cancel, save, reset, invalidate };
  useDeskAutomationNode({
    kind: 'layout',
    name: automation.name ?? keyText.value,
    read: () => layoutReadout(api, automation),
    brief: () => ({ state: draft.value ? 'draft' : 'saved' }),
    ops: () => layoutOps(api, automation),
  });

  return { layout, ready, draft, begin, replace, cancel, save, reset, option };
}

/** What the panel needs of `useDeskFormLayout`. */
export interface DeskLayoutPanelForm {
  ready: Ref<boolean>;
  begin: () => void;
  save: () => Promise<void>;
}

/** The toolbar button, its action id and what it opens: the form layout designer. */
export const DESK_FORM_LAYOUT_ACTION = 'desk-form-layout';

/**
 * The form layout panel of a page: the toolbar's Form layout button (`form-layout`), its action on the page's layer,
 * and the designer's open state. Opening starts a draft; `save` keeps it and closes. Bind `open` to
 * `DeskLayoutDesigner` and its `save` event to `save`; cancel and reset stay the layout's own.
 */
export function useDeskLayoutPanel(form: DeskLayoutPanelForm): { open: Ref<boolean>; save: () => Promise<void> } {
  const open = ref(false);
  useDeskToolbar([{ id: 'form-layout', label: 'Form layout', actionId: DESK_FORM_LAYOUT_ACTION, icon: 'layout' }]);
  useDeskLayer({
    handlers: {
      [DESK_FORM_LAYOUT_ACTION]: () => {
        if (form.ready.value) open.value = true;
      },
    },
  });
  watch(open, (shown) => {
    if (shown) form.begin();
  });
  async function save(): Promise<void> {
    await form.save();
    open.value = false;
  }
  return { open, save };
}
