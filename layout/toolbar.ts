import { onUnmounted, reactive } from 'vue';

/**
 * One button in the shell toolbar. A click runs `actionId` on the top page that handles it.
 * With `icon`, the button is only that picture and `label` is the tooltip, like a Windows toolbar.
 * Otherwise the button shows its label, and a shortcut when that action has keys.
 */
export interface DeskToolbarItem {
  id: string;
  label: string;
  actionId: string;
  icon?: 'layout' | 'scan' | 'link' | 'settings';
  /** When this returns false the button stays off the bar. Omitted means always shown. */
  visible?: () => boolean;
}

const items = reactive<DeskToolbarItem[]>([]);

/** Show these buttons while the calling component is mounted. */
export function useDeskToolbar(list: readonly DeskToolbarItem[]): void {
  const ids = new Set(list.map((item) => item.id));
  for (const item of list) {
    if (!items.some((existing) => existing.id === item.id)) items.push({ ...item });
  }
  onUnmounted(() => {
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const item = items[index];
      if (item && ids.has(item.id)) items.splice(index, 1);
    }
  });
}

export function deskToolbarItems(): readonly DeskToolbarItem[] {
  return items;
}
