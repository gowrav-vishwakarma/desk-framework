import { getCurrentInstance, onUnmounted, reactive, shallowRef, type ShallowRef } from 'vue';

export interface DeskColumnFiltersOptions {
  /** The filter text changed and has settled. Reload page 1 with it. */
  onChange: (filters: Readonly<Record<string, string>>) => void;
  /**
   * Wait this long before reloading. Default 0: the grid now emits only when a filter is applied
   * (Enter, the header filter's Apply), not on every key, so there is nothing to wait for.
   */
  delay?: number;
}

export interface DeskColumnFilters {
  /** Text per column id, as the grid's filter row holds it. Only non-empty entries. */
  readonly filters: Readonly<Record<string, string>>;
  /**
   * What the grid's filter boxes start with. Bind it to `DeskGrid :filter-values` so the text
   * survives a remount, such as a switch between row and cell moves.
   */
  readonly start: ShallowRef<Record<string, string>>;
  /** Bind to `DeskGrid @filter`. */
  onFilter: (next: Record<string, string>) => void;
  /** Empty every box without a reload, such as when the feature is switched off. */
  clear: () => void;
  /** True when some text is set. */
  active: () => boolean;
}

/**
 * Filter-row text for a page that sends column filters to its own server. The grid emits text as
 * the user types; this waits for a pause, drops a reload when nothing changed, and hands the page
 * the settled text. The page turns it into its request, the same way `layouts.query` filters are.
 */
export function useDeskColumnFilters(options: DeskColumnFiltersOptions): DeskColumnFilters {
  const filters = reactive<Record<string, string>>({});
  const start = shallowRef<Record<string, string>>({});
  const delay = options.delay ?? 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let sent = '{}';

  function settled(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [id, text] of Object.entries(filters)) if (text.trim()) out[id] = text;
    return out;
  }

  function flush(): void {
    timer = null;
    const next = settled();
    const key = JSON.stringify(next);
    if (key === sent) return;
    sent = key;
    start.value = next;
    options.onChange(next);
  }

  function onFilter(next: Record<string, string>): void {
    for (const id of Object.keys(filters)) if (!(id in next)) delete filters[id];
    Object.assign(filters, next);
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, delay);
  }

  function clear(): void {
    if (timer) clearTimeout(timer);
    timer = null;
    for (const id of Object.keys(filters)) delete filters[id];
    sent = '{}';
    start.value = {};
  }

  if (getCurrentInstance()) {
    onUnmounted(() => {
      if (timer) clearTimeout(timer);
    });
  }

  return { filters, start, onFilter, clear, active: () => Object.keys(settled()).length > 0 };
}
