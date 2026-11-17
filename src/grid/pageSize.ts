import { computed, onMounted, ref, type Ref } from 'vue';
import { readDeskPref, writeDeskPref } from '../storage/deskPrefs';

/** A fixed row count per page, fit-to-viewport, scroll to load more, or no server limit. */
export type DeskPageSize = number | 'dynamic' | 'infinite' | 'all';

export const DESK_PAGE_SIZES: readonly DeskPageSize[] = [
  10,
  20,
  50,
  100,
  500,
  1000,
  'dynamic',
  'infinite',
  'all',
];

/** Build a page-size list for one grid, omitting modes the page should not offer. */
export function deskPageSizesExcept(...omit: readonly DeskPageSize[]): DeskPageSize[] {
  return DESK_PAGE_SIZES.filter((size) => !omit.includes(size));
}

export function pageSizeLabel(size: DeskPageSize): string {
  if (size === 'dynamic') return 'Dynamic';
  if (size === 'infinite') return 'Infinite scroll';
  if (size === 'all') return 'All';
  return String(size);
}

function choiceKey(storageKey: string): string {
  return `grid-page-size:${storageKey}`;
}

function fitKey(storageKey: string): string {
  return `grid-page-fit:${storageKey}`;
}

function scopedFitKey(storageKey: string): string {
  return `grid-page-fits:${storageKey}`;
}

function parseSavedChoice(raw: unknown, sizes: readonly DeskPageSize[], initial: DeskPageSize): DeskPageSize {
  if (typeof raw === 'number' && sizes.some((s) => s === raw)) return raw;
  if (raw === 'dynamic' || raw === 'infinite' || raw === 'all') {
    if (sizes.includes(raw)) return raw;
  }
  return initial;
}

export interface UseDeskPageSizeOptions {
  storageKey: string;
  sizes?: readonly DeskPageSize[];
  initial?: DeskPageSize;
  /**
   * One list can draw several grids, such as one per layout, each with its own row height.
   * With a scope, the `dynamic` fit is kept per scope; a scope not measured yet starts from the
   * last fit measured anywhere on the list.
   */
  scope?: () => string;
}

export interface DeskPageSizeState {
  choice: Ref<DeskPageSize>;
  /** Rows per page when choice is `dynamic` and a fit has been measured (for the current scope). */
  fit: Ref<number | null>;
  /** True once the saved choice (and fit, if any) has been read. */
  ready: Ref<boolean>;
  /** Limit for the server, or null for `all`. */
  limit: Ref<number | null>;
  /** Numeric page size for row numbers and offset math. */
  effectivePageSize: Ref<number>;
  setChoice: (next: DeskPageSize) => void;
  setFit: (rows: number) => void;
  clearFit: () => void;
  isPaged: Ref<boolean>;
  isInfinite: Ref<boolean>;
}

/**
 * Per-grid page size, persisted in desk prefs. `dynamic` uses `fit` once measured;
 * until then the numeric `initial` is the limit.
 */
export function useDeskPageSize(options: UseDeskPageSizeOptions): DeskPageSizeState {
  const sizes = options.sizes ?? DESK_PAGE_SIZES;
  const initial = options.initial ?? 20;
  const choice = ref<DeskPageSize>(initial);
  /** The last fit measured on this list, whatever the scope. */
  const shared = ref<number | null>(null);
  /** Fits per scope, when the list has scopes. */
  const scoped = ref<Record<string, number>>({});
  const ready = ref(false);
  const scope = options.scope;
  const fit = computed<number | null>({
    get: () => (scope ? (scoped.value[scope()] ?? shared.value) : shared.value),
    set: (next) => {
      if (next === null) {
        shared.value = null;
        scoped.value = {};
      } else shared.value = next;
    },
  });

  onMounted(() => {
    void (async () => {
      const saved = await readDeskPref<unknown>(choiceKey(options.storageKey));
      choice.value = parseSavedChoice(saved, sizes, initial);
      if (choice.value === 'dynamic') {
        const savedFit = await readDeskPref<number>(fitKey(options.storageKey));
        if (typeof savedFit === 'number' && savedFit >= 1) shared.value = savedFit;
        if (scope) {
          const fits = await readDeskPref<Record<string, unknown>>(scopedFitKey(options.storageKey));
          if (fits && typeof fits === 'object') {
            scoped.value = Object.fromEntries(Object.entries(fits).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && entry[1] >= 1));
          }
        }
      }
      ready.value = true;
    })();
  });

  function setChoice(next: DeskPageSize): void {
    if (!sizes.includes(next)) return;
    choice.value = next;
    void writeDeskPref(choiceKey(options.storageKey), next);
    if (next !== 'dynamic') fit.value = null;
  }

  function setFit(rows: number): void {
    const n = Math.max(1, Math.floor(rows));
    shared.value = n;
    void writeDeskPref(fitKey(options.storageKey), n);
    if (!scope) return;
    scoped.value = { ...scoped.value, [scope()]: n };
    void writeDeskPref(scopedFitKey(options.storageKey), scoped.value);
  }

  function clearFit(): void {
    fit.value = null;
    void writeDeskPref(fitKey(options.storageKey), null);
    if (scope) void writeDeskPref(scopedFitKey(options.storageKey), null);
  }

  const limit = computed((): number | null => {
    const c = choice.value;
    if (c === 'all') return null;
    if (c === 'infinite') return typeof initial === 'number' ? initial : 20;
    if (c === 'dynamic') return fit.value ?? (typeof initial === 'number' ? initial : 20);
    return c;
  });

  const effectivePageSize = computed(() => {
    const c = choice.value;
    if (c === 'all') return 0;
    if (c === 'infinite') return limit.value ?? 20;
    if (c === 'dynamic') return fit.value ?? (typeof initial === 'number' ? initial : 20);
    return c;
  });

  const isPaged = computed(() => choice.value !== 'infinite' && choice.value !== 'all');
  const isInfinite = computed(() => choice.value === 'infinite');

  return {
    choice,
    fit,
    ready,
    limit,
    effectivePageSize,
    setChoice,
    setFit,
    clearFit,
    isPaged,
    isInfinite,
  };
}

/** The paging props a list hands to `DeskGrid` with `v-bind`. */
export interface DeskGridPagingBind {
  page: number;
  pageCount: number;
  pageSize: number;
  /** Total rows matching the current filters (server count). */
  itemCount: number;
  pageSizes?: readonly DeskPageSize[];
  pageSizeChoice?: DeskPageSize;
  totalRowCount: number | null;
  loading: boolean;
  onPage: (next: number) => void;
  onMore: () => void;
  onFit: (rows: number) => void;
  'onUpdate:pageSizeChoice': (next: DeskPageSize) => void;
}
