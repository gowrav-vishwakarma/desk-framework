import { reactive } from 'vue';
import { readDeskPref, writeDeskPref } from './deskPrefs';

/** One on/off choice a page offers, such as "Show zero values". */
export interface DeskToggle {
  id: string;
  label: string;
  /** Used until the user picks. */
  default: boolean;
}

export interface DeskToggles {
  readonly items: readonly DeskToggle[];
  /** What the page shows now. Pages and cells read it; a layout tab may set it. */
  readonly screen: Record<string, boolean>;
  /** The user's remembered choice, or the default. A layout tab that saved its own wins over it. */
  remembered: (id: string) => boolean;
  /** Show this now and remember it as the user's choice. */
  set: (id: string, value: boolean) => void;
}

/**
 * Saved on/off choices for one page, kept under `prefKey` in desk prefs. Only choices the user
 * made are stored, so a later default change still reaches them. Read once, then from memory.
 */
export function createDeskToggles(prefKey: string, items: readonly DeskToggle[]): DeskToggles {
  const chosen = reactive<Record<string, boolean>>({});
  const screen = reactive<Record<string, boolean>>(Object.fromEntries(items.map((item) => [item.id, item.default])));
  let loading: Promise<void> | null = null;

  function load(): void {
    if (loading) return;
    loading = readDeskPref<Record<string, unknown>>(prefKey).then((found) => {
      if (!found || typeof found !== 'object') return;
      for (const item of items) {
        const value = found[item.id];
        // A choice made while the read was in flight wins.
        if (typeof value !== 'boolean' || chosen[item.id] !== undefined) continue;
        chosen[item.id] = value;
        screen[item.id] = value;
      }
    });
  }

  function remembered(id: string): boolean {
    load();
    return chosen[id] ?? items.find((item) => item.id === id)?.default ?? false;
  }

  function set(id: string, value: boolean): void {
    if (!items.some((item) => item.id === id)) return;
    chosen[id] = value;
    screen[id] = value;
    void writeDeskPref(prefKey, { ...chosen });
  }

  load();
  return { items, screen, remembered, set };
}
