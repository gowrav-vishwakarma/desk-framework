import { ref } from 'vue';
import { readDeskPref, writeDeskPref } from '../storage/deskPrefs';

/** One choice for every desk currency control, for this browser. */
export interface DeskCurrencyPrefs {
  show: 'code' | 'name';
}

export const CURRENCY_PREF_KEY = 'currency-input';

export const CURRENCY_PREF_DEFAULTS: DeskCurrencyPrefs = {
  show: 'code',
};

export const currencyPrefs = ref<DeskCurrencyPrefs>({ ...CURRENCY_PREF_DEFAULTS });

let started = false;

function sanitize(value: Partial<DeskCurrencyPrefs> | null): DeskCurrencyPrefs {
  return { show: value?.show === 'name' ? 'name' : 'code' };
}

/** Read the saved choice once. Later reads use the in-memory copy. */
export function ensureCurrencyPrefs(): void {
  if (started) return;
  started = true;
  void readDeskPref<Partial<DeskCurrencyPrefs>>(CURRENCY_PREF_KEY).then((saved) => {
    if (!saved) return;
    currencyPrefs.value = sanitize(saved);
  });
}

export function useCurrencyPrefs(): {
  prefs: typeof currencyPrefs;
  set: <K extends keyof DeskCurrencyPrefs>(key: K, value: DeskCurrencyPrefs[K]) => void;
} {
  ensureCurrencyPrefs();
  function set<K extends keyof DeskCurrencyPrefs>(key: K, value: DeskCurrencyPrefs[K]): void {
    currencyPrefs.value = sanitize({ ...currencyPrefs.value, [key]: value });
    void writeDeskPref(CURRENCY_PREF_KEY, currencyPrefs.value);
  }
  return { prefs: currencyPrefs, set };
}
