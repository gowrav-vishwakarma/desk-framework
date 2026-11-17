import type { DeskToggles } from '../storage/deskToggles';
import type { DeskFieldMenu } from './fieldMenu';

/**
 * A check menu for a page's toggles. Rows stay open on a pick, so several can be flipped at once.
 * `onChange` decides what a pick means; the default shows it and remembers it.
 */
export function deskTogglesMenu(
  toggles: DeskToggles,
  options: { label?: string; groupId?: string; onChange?: (id: string, value: boolean) => void } = {},
): DeskFieldMenu {
  const groupId = options.groupId ?? 'toggles';
  return {
    groups: () => [
      {
        id: groupId,
        ...(options.label ? { label: options.label } : {}),
        mode: 'check',
        items: toggles.items.map((item) => ({ id: item.id, label: item.label, checked: toggles.screen[item.id] === true })),
      },
    ],
    choose(group, id) {
      if (group !== groupId || !toggles.items.some((item) => item.id === id)) return;
      const next = toggles.screen[id] !== true;
      if (options.onChange) options.onChange(id, next);
      else toggles.set(id, next);
    },
  };
}
