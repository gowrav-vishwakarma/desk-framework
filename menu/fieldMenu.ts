import { getCurrentInstance, onUnmounted, ref, type Ref } from 'vue';

/** One row in a right-click menu. */
export interface DeskMenuItem {
  id: string;
  label: string;
  checked?: boolean;
  disabled?: boolean;
  title?: string;
  /** Adds `desk-tone-<tone>` on the menu row. */
  tone?: string;
  /** Not permitted for this user (`desk-action-denied`): disabled in the theme's denied colours. */
  denied?: boolean;
}

/**
 * A block of rows. `check` rows toggle and the menu stays open. `radio` and `action` rows close it.
 * Group ids must be unique inside one menu.
 */
export interface DeskMenuGroup {
  id: string;
  label?: string;
  mode: 'check' | 'radio' | 'action';
  items: DeskMenuItem[];
}

/**
 * A right-click menu for one field. `groups` is read each time the menu draws, so it must
 * read current state. `choose` runs when a row is picked.
 */
export interface DeskFieldMenu {
  groups: () => DeskMenuGroup[];
  choose: (groupId: string, itemId: string) => void;
}

/** One menu from several. Groups keep their order; a pick goes to the menu that owns that group. */
export function mergeDeskMenus(...menus: (DeskFieldMenu | null | undefined)[]): DeskFieldMenu | null {
  const list = menus.filter((menu): menu is DeskFieldMenu => Boolean(menu));
  if (list.length === 0) return null;
  const [only] = list;
  if (list.length === 1 && only) return only;
  return {
    groups: () => list.flatMap((menu) => menu.groups()),
    choose(groupId, itemId) {
      const owner = list.find((menu) => menu.groups().some((group) => group.id === groupId));
      owner?.choose(groupId, itemId);
    },
  };
}

export interface DeskContextMenuState {
  menu: DeskFieldMenu;
  x: number;
  y: number;
}

/** Closers for menus that are open. Opening one runs the others, so two menus cannot stay up. */
const openDeskMenus = new Set<() => void>();

function closeOtherDeskMenus(self: () => void): void {
  for (const close of [...openDeskMenus]) {
    if (close !== self) close();
  }
}

/**
 * Right-click state for a control. `open` returns false when there is no menu, so the browser's
 * own menu stays. `openAt` places the menu at a point, such as under a button. Opening any menu
 * closes the one that was already open.
 */
export function useDeskContextMenu(getMenu: () => DeskFieldMenu | null | undefined): {
  state: Ref<DeskContextMenuState | null>;
  open: (event: MouseEvent) => boolean;
  openAt: (x: number, y: number) => boolean;
  close: () => void;
} {
  const state = ref<DeskContextMenuState | null>(null);
  function close(): void {
    state.value = null;
    openDeskMenus.delete(close);
  }
  function place(x: number, y: number): boolean {
    const menu = getMenu();
    if (!menu) return false;
    closeOtherDeskMenus(close);
    openDeskMenus.add(close);
    state.value = { menu, x, y };
    return true;
  }
  function open(event: MouseEvent): boolean {
    const placed = place(event.clientX, event.clientY);
    if (placed) event.preventDefault();
    return placed;
  }
  function openAt(x: number, y: number): boolean {
    return place(x, y);
  }
  if (getCurrentInstance()) onUnmounted(close);
  return { state, open, openAt, close };
}
