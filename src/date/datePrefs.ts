import { ref } from 'vue';
import { deskHost } from '../host';
import { readDeskPref, writeDeskPref } from '../storage/deskPrefs';
import { orderOf, todayIso, type DeskDateOrder, type DeskDateParseOptions, type DeskDateShow, type DeskDateYear } from './deskDate';

/** One choice for every desk date field, for this browser. */
export interface DeskDatePrefs {
  show: DeskDateShow;
  typing: 'mask' | 'free';
  calendar: 'focus' | 'key';
  /** Where the weekday is drawn. */
  weekday: 'beside' | 'tip';
  /** `focus` shows it only while the field is focused. `always` leaves it up. */
  weekdayWhen: 'focus' | 'always';
  /** Year used when the typed date has none. `fy` follows the selected financial year. */
  year: DeskDateYear;
}

export const DATE_PREF_KEY = 'date-input';

const SHOWS: DeskDateShow[] = ['dd/mm/yyyy', 'dd-mm-yyyy', 'dd MMM yyyy', 'yyyy-mm-dd'];

export const DATE_PREF_DEFAULTS: DeskDatePrefs = {
  show: 'dd/mm/yyyy',
  typing: 'mask',
  calendar: 'key',
  weekday: 'beside',
  weekdayWhen: 'focus',
  year: 'calendar',
};

export const datePrefs = ref<DeskDatePrefs>({ ...DATE_PREF_DEFAULTS });

let started = false;

function knownShow(value: unknown): value is DeskDateShow {
  return typeof value === 'string' && SHOWS.includes(value as DeskDateShow);
}

function sanitize(value: (Partial<DeskDatePrefs> & { detail?: boolean }) | null): DeskDatePrefs {
  const weekdayWhen = value?.weekdayWhen === 'always' || value?.weekdayWhen === 'focus'
    ? value.weekdayWhen
    : value?.detail === true
      ? 'always'
      : DATE_PREF_DEFAULTS.weekdayWhen;
  return {
    show: knownShow(value?.show) ? value.show : DATE_PREF_DEFAULTS.show,
    typing: value?.typing === 'free' ? 'free' : 'mask',
    calendar: value?.calendar === 'focus' ? 'focus' : 'key',
    weekday: value?.weekday === 'tip' ? 'tip' : 'beside',
    weekdayWhen,
    year: value?.year === 'fy' ? 'fy' : 'calendar',
  };
}

/** Options for `parseDeskDate` from the saved date choice and the host's financial year. */
export function dateParseOptions(): DeskDateParseOptions {
  ensureDatePrefs();
  const year: DeskDateYear = datePrefs.value.year;
  const order: DeskDateOrder = orderOf(datePrefs.value.show);
  const selected = year === 'fy' ? deskHost().financialYear?.() : null;
  return {
    order,
    today: todayIso(),
    year,
    ...(typeof selected === 'number' && Number.isFinite(selected) ? { fyStart: selected } : {}),
  };
}

/** Read the saved choice once. Later reads use the in-memory copy. */
export function ensureDatePrefs(): void {
  if (started) return;
  started = true;
  void readDeskPref<Partial<DeskDatePrefs> & { detail?: boolean }>(DATE_PREF_KEY).then((saved) => {
    if (!saved) return;
    datePrefs.value = sanitize(saved);
  });
}

export function useDatePrefs(): {
  prefs: typeof datePrefs;
  set: <K extends keyof DeskDatePrefs>(key: K, value: DeskDatePrefs[K]) => void;
} {
  ensureDatePrefs();
  function set<K extends keyof DeskDatePrefs>(key: K, value: DeskDatePrefs[K]): void {
    datePrefs.value = sanitize({ ...datePrefs.value, [key]: value });
    void writeDeskPref(DATE_PREF_KEY, datePrefs.value);
  }
  return { prefs: datePrefs, set };
}
