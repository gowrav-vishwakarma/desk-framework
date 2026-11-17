/**
 * Cell editors that are open right now (a grid or settings cell being typed in). A shortcut such
 * as Ctrl+S or a dialog's OK runs while focus is still in the editor, so nothing has written the
 * typed value yet. The key dispatcher calls `commitOpenEditors` before it runs a shortcut, which
 * writes every open editor in place, the same as Enter would, without moving the cursor.
 */
const open = new Set<() => void>();

/** Register while a cell is being edited. Returns the unregister function. */
export function registerOpenEditor(commit: () => void): () => void {
  open.add(commit);
  return () => {
    open.delete(commit);
  };
}

/** Writes every open editor. Safe to call when none is open. */
export function commitOpenEditors(): void {
  for (const commit of [...open]) {
    try {
      commit();
    } catch (error) {
      console.error('Desk: could not write an open editor', error);
    }
  }
}

/** Shortcuts that discard or only move focus: an open editor is left for them to handle. */
const KEEPS_OPEN_EDITOR = /(^|-)(cancel|close|escape)($|-)|^desk-(move|tab|jump|keys|theme)/;

/** Writes typed-but-uncommitted cells before a shortcut acts (Ctrl+S, a dialog's OK, a toolbar action). */
export function commitEditorsBefore(actionIds: readonly string[]): void {
  if (actionIds.some((id) => KEEPS_OPEN_EDITOR.test(id))) return;
  commitOpenEditors();
}
