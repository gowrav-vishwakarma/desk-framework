import { ref } from 'vue';
import { readDeskPref, writeDeskPref } from '../storage/deskPrefs';
import type { DeskFieldMenu, DeskMenuGroup } from './fieldMenu';

export interface DeskChecklistItem {
  id: string;
  label: string;
}

export interface DeskChecklist {
  /** A menu with one `check` group. Pass it as a field's or a lookup's `menu`. */
  menu: DeskFieldMenu;
  /** The checked ids, in item order. All items start checked. */
  selected: () => string[];
}

export interface DeskChecklistOptions {
  /** Heading above the rows. */
  label?: string;
  /** Group id. Defaults to the pref key. Give each checklist in one merged menu its own. */
  groupId?: string;
  /**
   * The ids checked until the user chooses (default: all). A function is read each time, so the defaults can follow
   * something that loads later (a company setting: a party lookup searching aliases where the company keeps them).
   */
  defaults?: readonly string[] | (() => readonly string[]);
}

/**
 * A saved list of checks for a right-click menu. The choice is kept under `prefKey` in the
 * desk settings store. It is read once. After that the menu and callers read memory.
 * The framework does not know what the ids mean; the product turns them into a search.
 */
export function createDeskChecklist(
  prefKey: string,
  items: readonly DeskChecklistItem[],
  options: DeskChecklistOptions = {},
): DeskChecklist {
  const ids = items.map((item) => item.id);
  const groupId = options.groupId ?? prefKey;
  const revision = ref(0);
  let chosen: Set<string> | null = null;
  let loading: Promise<void> | null = null;

  function known(value: unknown): value is string {
    return typeof value === 'string' && ids.includes(value);
  }

  function current(): Set<string> {
    void revision.value;
    if (chosen) return chosen;
    const defaults = typeof options.defaults === 'function' ? options.defaults() : options.defaults;
    return new Set(defaults ? ids.filter((id) => defaults.includes(id)) : ids);
  }

  function apply(fields: Iterable<string>, persist: boolean): void {
    const next = new Set(fields);
    chosen = next;
    revision.value += 1;
    if (!persist) return;
    void writeDeskPref(prefKey, { fields: ids.filter((id) => next.has(id)) });
  }

  function load(): void {
    if (loading) return;
    loading = readDeskPref<{ fields?: unknown }>(prefKey).then((saved) => {
      if (chosen) return;
      if (!saved || !Array.isArray(saved.fields)) return;
      apply(saved.fields.filter(known), false);
    });
  }

  const menu: DeskFieldMenu = {
    groups(): DeskMenuGroup[] {
      load();
      const on = current();
      return [
        {
          id: groupId,
          ...(options.label ? { label: options.label } : {}),
          mode: 'check',
          items: items.map((item) => ({ id: item.id, label: item.label, checked: on.has(item.id) })),
        },
      ];
    },
    choose(group, id): void {
      if (group !== groupId || !known(id)) return;
      const next = new Set(current());
      if (next.has(id)) next.delete(id);
      else next.add(id);
      apply(next, true);
    },
  };

  return {
    menu,
    selected(): string[] {
      load();
      const on = current();
      return ids.filter((id) => on.has(id));
    },
  };
}
