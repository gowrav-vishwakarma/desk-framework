import { ref } from 'vue';
import { askDeskConfirm } from '../../form/confirm';
import { cloneLayout } from './compile';
import { mergeImportedLayouts, type DeskLayoutImportMode } from './transfer';
import { newLayoutId, type DeskGridLayoutsApi } from './useDeskGridLayouts';
import type { DeskGridLayout, DeskGridLayoutCommand, DeskGridLayoutView } from './types';

/** Runs the footer layout menu's commands and holds the designer dialog's state. */
export interface DeskGridDesignerOptions {
  /** What the page shows now, for Save current filters and New layout from current filters. */
  currentView?: () => Pick<DeskGridLayoutView, 'panel' | 'options'>;
}

export function useDeskGridDesigner(layouts: DeskGridLayoutsApi, options: DeskGridDesignerOptions = {}) {
  const open = ref(false);
  const draft = ref<DeskGridLayout>(layouts.blank());
  const isNew = ref(true);

  function edit(layout: DeskGridLayout, fresh: boolean): void {
    draft.value = layout;
    isNew.value = fresh;
    open.value = true;
  }

  async function confirmDelete(id: string): Promise<void> {
    const layout = layouts.layouts.value.find((item) => item.id === id);
    if (!layout) return;
    const ok = await askDeskConfirm({
      title: 'Delete layout',
      message: `Delete the layout "${layout.name}"?`,
      okLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    open.value = false;
    await layouts.remove(id);
  }

  function onCommand(command: DeskGridLayoutCommand): void {
    if (command.action === 'select') void layouts.select(command.id);
    else if (command.action === 'new') edit(layouts.blank(), true);
    else if (command.action === 'duplicate') edit(layouts.duplicate(), true);
    else if (command.action === 'edit' && layouts.activeLayout.value) edit(cloneLayout(layouts.activeLayout.value), false);
    else if (command.action === 'delete') void confirmDelete(layouts.active.value);
    else if (command.action === 'reset') void confirmReset();
    else if (command.action === 'save-view' && options.currentView) void layouts.saveView(options.currentView());
    else if (command.action === 'reset-view') layouts.resetView();
    else if (command.action === 'new-from-view' && options.currentView) {
      edit({ ...layouts.duplicate(), name: 'New tab', kind: 'tab', view: options.currentView() }, true);
    }
  }

  async function confirmReset(): Promise<void> {
    const ok = await askDeskConfirm({
      title: 'Reset layout',
      message: 'Restore the original columns of the default layout?',
      okLabel: 'Reset',
    });
    if (!ok) return;
    open.value = false;
    await layouts.resetDefault();
  }

  async function onSave(layout: DeskGridLayout): Promise<void> {
    open.value = false;
    await layouts.save(layout);
  }

  /** A file of all layouts, after the user chose Overwrite or Add in the designer. Saved at once. */
  async function onImportAll(payload: { layouts: DeskGridLayout[]; mode: DeskLayoutImportMode }): Promise<void> {
    const merged = mergeImportedLayouts(layouts.savedLayouts(), payload.layouts, payload.mode, () => newLayoutId());
    open.value = false;
    await layouts.replaceAll(merged);
  }

  function setOpen(next: boolean): void {
    open.value = next;
  }

  return { open, draft, isNew, setOpen, onCommand, onSave, onDelete: confirmDelete, onImportAll };
}
