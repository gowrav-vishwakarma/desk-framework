/** Pointer gestures the grid and other controls can bind to desk action ids. */
export type DeskPointerGesture = 'dblclick' | 'ctrl+dblclick';

/** Action id to the gestures that run it. An empty list unbinds that action. */
export type DeskPointerBindings = Record<string, readonly DeskPointerGesture[]>;

const DEFAULT_POINTER: DeskPointerBindings = {
  'grid-cell-dialog': ['dblclick'],
  'grid-open-page': ['ctrl+dblclick'],
};

let overrides: DeskPointerBindings = {};

function mergedBindings(): DeskPointerBindings {
  return { ...DEFAULT_POINTER, ...overrides };
}

function buildIndex(bindings: DeskPointerBindings): Map<DeskPointerGesture, string[]> {
  const index = new Map<DeskPointerGesture, string[]>();
  for (const [actionId, gestures] of Object.entries(bindings)) {
    for (const gesture of gestures) {
      const list = index.get(gesture);
      if (list) list.push(actionId);
      else index.set(gesture, [actionId]);
    }
  }
  return index;
}

let gestureIndex = buildIndex(mergedBindings());

/** Action ids bound to a gesture, in binding order. */
export function deskActionsForGesture(gesture: DeskPointerGesture): readonly string[] {
  return gestureIndex.get(gesture) ?? [];
}

/** Host or product overrides on top of the defaults. */
export function setDeskPointerGestures(patch: DeskPointerBindings): void {
  overrides = { ...overrides, ...patch };
  gestureIndex = buildIndex(mergedBindings());
}
