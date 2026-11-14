import { ref } from 'vue';
import type { DeskFieldMenu, DeskMenuGroup } from '../menu/fieldMenu';
import { readDeskPref, writeDeskPref } from '../storage/deskPrefs';

/**
 * How a chips cell draws a long list.
 * `first` is "A +4". `pair` is "A, B +3". `wrap` keeps every name inside the column and grows the row.
 * `line` is every name on one row, which can widen the column.
 */
export type DeskChipsShow = 'first' | 'pair' | 'wrap' | 'line';

export const CHIPS_SHOW_KEY = 'chips-show';

const SHOWS: { id: DeskChipsShow; label: string }[] = [
  { id: 'first', label: 'A +4' },
  { id: 'pair', label: 'A, B +3' },
  { id: 'wrap', label: 'All, wrapped' },
  { id: 'line', label: 'All on one line' },
];

export const chipsPrefs = ref<{ show: DeskChipsShow }>({ show: 'first' });

let started = false;

function known(value: unknown): value is DeskChipsShow {
  return SHOWS.some((item) => item.id === value);
}

/** Read the saved choice once. Later reads use the in-memory copy. */
export function ensureChipsPrefs(): void {
  if (started) return;
  started = true;
  void readDeskPref<{ show?: unknown }>(CHIPS_SHOW_KEY).then((saved) => {
    if (known(saved?.show)) chipsPrefs.value = { show: saved.show };
  });
}

function setShow(show: DeskChipsShow): void {
  chipsPrefs.value = { show };
  void writeDeskPref(CHIPS_SHOW_KEY, chipsPrefs.value);
}

/** The Show as menu for every chips cell. The choice is one for this browser. */
export function chipsFieldMenu(): DeskFieldMenu {
  ensureChipsPrefs();
  return {
    groups(): DeskMenuGroup[] {
      const show = chipsPrefs.value.show;
      return [
        {
          id: 'chips-show',
          label: 'Show as',
          mode: 'radio',
          items: SHOWS.map((item) => ({ id: item.id, label: item.label, checked: show === item.id })),
        },
      ];
    },
    choose(groupId, itemId): void {
      if (groupId === 'chips-show' && known(itemId)) setShow(itemId);
    },
  };
}

/** Names kept on the first line, and how many are left off it. Wrap and line show every name. */
export function chipsHead(labels: readonly string[], show: DeskChipsShow): { head: string; more: number } {
  if (show === 'pair') return { head: labels.slice(0, 2).join(', '), more: Math.max(0, labels.length - 2) };
  return { head: labels[0] ?? '', more: Math.max(0, labels.length - 1) };
}
