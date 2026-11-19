import { onBeforeUnmount, ref, shallowRef, watch, type Ref } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate, type RouteLocationNormalized } from 'vue-router';
import { inDeskPageDialog } from '../page/pageContext';
import { TAB_QUERY_KEY } from './deskTabRoute';
import { DESK_DRAFT_QUERY_KEY } from './draftQuery';

/**
 * Unsaved-changes check shared by every desk page and both hosts. It only needs Vue, so the
 * classic header's GUI | Desk switch can import it without pulling in the desk framework.
 *
 * A page calls `useDeskDirty(() => dirty)`. Anything that is about to drop the page (a route
 * change, a tab, the GUI | Desk switch, a page dialog) calls `askDeskLeave()` first. The dialog that
 * answers it is `DeskLeaveDialog`, mounted once by each host. It never saves. The user saves with the page.
 *
 * Pages stack: a page opened in a dialog sits above the page under it, and the question is
 * about the page on top. Leaving the dialog never touches the page below.
 */
type Check = () => boolean;
/** A save the leave question may offer, or null when the page saves only with its own button. */
type SaveOffer = () => (() => Promise<boolean>) | null;

interface Entry {
  check: Check;
  save: SaveOffer | null;
}

const stack: Entry[] = [];

/** The question on screen, if any. `DeskLeaveDialog` shows it and calls `answerDeskLeave`. */
export const deskLeaveAsked: Ref<boolean> = ref(false);
/** What has the changes: "This page" or "This section". */
export const deskLeaveWhat: Ref<string> = ref('This page');
/** Set when the asker can save first. The dialog then offers Save. */
export const deskLeaveSave: Ref<(() => Promise<boolean>) | null> = shallowRef(null);
let pending: ((leave: boolean) => void) | null = null;

function ask(what: string, save: (() => Promise<boolean>) | null): Promise<boolean> {
  // A second ask while one is open is the same question. Answer it as "stay".
  if (pending) return Promise.resolve(false);
  deskLeaveWhat.value = what;
  deskLeaveSave.value = save;
  return new Promise((resolve) => {
    pending = resolve;
    deskLeaveAsked.value = true;
  });
}

/** Put a check on top of the stack. The returned function takes it off again. */
export function pushDeskDirty(check: Check, save: SaveOffer | null = null): () => void {
  const entry: Entry = { check, save };
  stack.push(entry);
  return () => {
    const at = stack.lastIndexOf(entry);
    if (at >= 0) stack.splice(at, 1);
  };
}

/** True when the page on top has registered itself and has unsaved changes. */
export function deskIsDirty(): boolean {
  return stack[stack.length - 1]?.check() === true;
}

/** Resolves `true` when it is fine to leave. A dirty page waits for the user's answer. */
export function askDeskLeave(): Promise<boolean> {
  if (!deskIsDirty()) return Promise.resolve(true);
  return ask('This page', stack[stack.length - 1]?.save?.() ?? null);
}

/**
 * Asks about changes the caller already knows would be lost, such as a sub-form a tab switch is
 * about to unmount. With `save`, the dialog offers Save: it runs, and leaving goes ahead only when
 * it resolved true.
 */
export function confirmDeskDiscard(options: { what?: string; save?: () => Promise<boolean> } = {}): Promise<boolean> {
  return ask(options.what ?? 'This page', options.save ?? null);
}

/** The dialog's answer. `true` drops the changes and leaves, `false` keeps editing. */
export function answerDeskLeave(leave: boolean): void {
  const resolve = pending;
  pending = null;
  deskLeaveAsked.value = false;
  deskLeaveSave.value = null;
  resolve?.(leave);
}

/** The dialog's Save. A failed save keeps the user where they are, with the part's own message. */
export async function saveAndLeave(): Promise<void> {
  const save = deskLeaveSave.value;
  if (!save) return;
  let saved = false;
  try {
    saved = await save();
  } finally {
    answerDeskLeave(saved);
  }
}

/** A `?tab=` write from `DeskTabs` or a form's `?draft=` key stays on the same record, so it does not leave the page. */
function onlyTabChanged(to: RouteLocationNormalized, from: RouteLocationNormalized): boolean {
  if (to.path !== from.path || to.hash !== from.hash) return false;
  const keys = new Set([...Object.keys(to.query), ...Object.keys(from.query)]);
  keys.delete(TAB_QUERY_KEY);
  keys.delete(DESK_DRAFT_QUERY_KEY);
  for (const key of keys) {
    if (String(to.query[key]) !== String(from.query[key])) return false;
  }
  return true;
}

function warnOnUnload(event: BeforeUnloadEvent): void {
  event.preventDefault();
}

/**
 * Register the current page. Route leave and update guards live only while a routed page is
 * mounted, and the browser's reload and close warning is on only while the page is dirty.
 */
export function useDeskDirty(isDirty: Check, save: SaveOffer | null = null): void {
  const pop = pushDeskDirty(isDirty, save);

  if (!inDeskPageDialog()) {
    onBeforeRouteLeave(() => askDeskLeave());
    onBeforeRouteUpdate((to, from) => onlyTabChanged(to, from) || askDeskLeave());
  }

  let listening = false;
  watch(
    isDirty,
    (dirty) => {
      if (dirty === listening) return;
      listening = dirty;
      if (dirty) window.addEventListener('beforeunload', warnOnUnload);
      else window.removeEventListener('beforeunload', warnOnUnload);
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    if (listening) window.removeEventListener('beforeunload', warnOnUnload);
    pop();
  });
}
