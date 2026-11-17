import type { DeskRowAction } from './types';

/** Same partition as classic SingleRecordActions: buttons first, menu entries under ⋮. */
export function splitRowActions(actions: readonly DeskRowAction[]): {
  buttons: DeskRowAction[];
  menu: DeskRowAction[];
} {
  const buttons: DeskRowAction[] = [];
  const menu: DeskRowAction[] = [];
  for (const action of actions) {
    if (action.displayMode === 'menu') menu.push(action);
    else buttons.push(action);
  }
  return { buttons, menu };
}

/** Resolve display mode from a page override or action metadata. */
export function resolveRowActionDisplayMode(
  name: string,
  actionDisplayMode: string | undefined,
  rowDisplay?: Record<string, 'btngroup' | 'menu'>,
): 'btngroup' | 'menu' {
  const override = rowDisplay?.[name];
  if (override) return override;
  return actionDisplayMode === 'menu' ? 'menu' : 'btngroup';
}
