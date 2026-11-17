import { computed, onUnmounted, reactive, type ComputedRef } from 'vue';

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

interface OwnedItem extends DeskToolbarItem {
  owner: symbol;
}

const items = reactive<OwnedItem[]>([]);

/**
 * Show these buttons while the calling component is mounted. Each call owns its entries: the next page mounts before
 * the last one unmounts, so two pages may name the same button (`form-layout`) for a moment; the newest is shown and
 * the leaving page takes away only its own.
 */
export function useDeskToolbar(list: readonly DeskToolbarItem[]): void {
  const owner = Symbol('desk-toolbar');
  for (const item of list) items.push({ ...item, owner });
  onUnmounted(() => {
    for (let index = items.length - 1; index >= 0; index -= 1) {
      if (items[index]?.owner === owner) items.splice(index, 1);
    }
  });
}

/** The buttons on the bar: one per id, the newest owner's, in the order the ids first came. */
const shown = computed((): DeskToolbarItem[] => {
  const newest = new Map<string, OwnedItem>();
  // A Map keeps an id where it was first set; setting it again only replaces the entry.
  for (const item of items) newest.set(item.id, item);
  return [...newest.values()].map(({ owner: _owner, ...item }) => item);
});

/** The bar's buttons, kept up to date as pages add and remove theirs. */
export function deskToolbarItems(): ComputedRef<DeskToolbarItem[]> {
  return shown;
}
