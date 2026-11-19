import type { DeskLookupConfig } from './grid/types';
import type { DeskBindings } from './keys/keymap';
import type { DeskPrefStore } from './storage/prefStore';
import type { DeskDraftStore } from './storage/deskDrafts';
import type { DeskAutomationHost } from './automation/types';

/** A named shortcut preset shown in the keys dialog. */
export interface DeskPresetChoice {
  id: string;
  label: string;
}

/**
 * What a host app gives the framework. The framework does not import the product.
 * Call `configureDesk` once, before `loadDeskKeymap` and before any lookup opens.
 */
export interface DeskHost {
  presets: Record<string, DeskBindings>;
  presetLabels: DeskPresetChoice[];
  defaultPreset: string;
  /** Human name for an action id, used in the keys dialog. */
  label: (actionId: string) => string;
  /** Preset to use when this user has none stored, such as a choice an older app saved. */
  initialPreset?: () => string | null;
  /**
   * Default keys for the host's own actions, such as a page action the presets do not list.
   * Presets and the user's overrides win over these.
   */
  extraBindings?: DeskBindings;
  /**
   * Locale for numbers and currency symbols, such as `en-IN` for 1,00,000.00 grouping. Without it
   * the browser's locale is used.
   */
  locale?: () => string;
  /** Lookup search. The framework draws the box; the host talks to its API. */
  searchLookup?: (lookup: DeskLookupConfig, query: string) => Promise<Record<string, unknown>[]>;
  /**
   * Company currency code, such as USD. Currency controls use this as the default. Without it every
   * row counts as company currency, so no cell shows a second amount.
   */
  companyCurrency?: () => string;
  /** Company currency id, when rows name their currency by id. Same id counts as the same currency. */
  companyCurrencyId?: () => string | number | null;
  /** Company currency symbol, such as $. Without it the browser's symbol for the code is used. */
  companyCurrencySymbol?: () => string;
  /**
   * Company decimal places, 0 to 8. `qty` for quantities, `money` for rates and amounts.
   * Lists pad to these and keep any extra saved digits. Default 2 each.
   */
  decimals?: () => { qty: number; money: number };
  /** Start year of the company's selected financial year, such as 2026 for 2026-27. */
  financialYear?: () => number | null;
  /**
   * Where UI settings are saved. Leave it out for the IndexedDB default, or pass
   * `createIndexedDbPrefStore({ dbName })`, or a store that talks to a server.
   * Set it before the first setting is read.
   */
  prefs?: DeskPrefStore;
  /**
   * Whose drafts a form keeps (`form/draft.ts`): a text naming the company and the user, such as `c7:u3`, so one
   * user never restores another's form. Null (or left out) keeps no drafts.
   */
  draftScope?: () => string | null;
  /** Where drafts are kept. Leave it out for the IndexedDB default; tests pass `createMemoryDraftStore()`. */
  drafts?: DeskDraftStore;
  /**
   * Whether a failed save was answered by the server (refused, timed out): a draft's next save is then a new
   * submission with a new idempotency key. Without it every failure keeps the key (the outcome counts as unknown,
   * as for a lost connection or an aborted call).
   */
  submitAnswered?: (error: unknown) => boolean;
  /**
   * Turns on the automation driver (`window.__desk`) for tests and AI agents. Off when missing.
   * See `automation/` and the framework README.
   */
  automation?: DeskAutomationHost;
}

const fallback: DeskHost = {
  presets: {},
  presetLabels: [],
  defaultPreset: '',
  label: (actionId) => actionId,
};

let current: DeskHost = fallback;

export function configureDesk(next: DeskHost): void {
  current = next;
}

export function deskHost(): DeskHost {
  return current;
}
