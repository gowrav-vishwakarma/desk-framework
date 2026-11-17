import { computed, onMounted, reactive, ref, shallowRef, toValue, type MaybeRefOrGetter } from 'vue';
import { readDeskPref, writeDeskPref } from '../../storage/deskPrefs';
import { applyDeskGridSort } from '../listSort';
import type { DeskColumn, DeskGridSortAction } from '../types';
import {
  cleanLayout,
  cloneLayout,
  layoutColumnInfo,
  layoutColumns,
  selectionOf,
  shippedLayout,
  withLockedColumns,
} from './compile';
import {
  DESK_DEFAULT_LAYOUT_ID,
  type DeskColumnQueryInfo,
  type DeskFieldCatalog,
  type DeskFieldFormatters,
  type DeskFieldUse,
  type DeskGridLayout,
  type DeskGridLayoutMenuState,
  type DeskGridLayoutView,
  type DeskGridQueryFilter,
  type DeskGridQueryState,
} from './types';

interface SavedLayouts {
  version: 1;
  active: string;
  layouts: DeskGridLayout[];
  /**
   * Layouts whose pin is off: switching to one loads its rows again. Every other layout is kept
   * live, so switching back shows the rows it last loaded. Held apart from the layouts, so the
   * shipped Default can be unpinned without becoming an edited Default.
   */
  refetch?: string[];
}

export interface DeskGridLayoutsOptions {
  /** Same key the grid uses for its column prefs. */
  storageKey: string;
  catalog: MaybeRefOrGetter<DeskFieldCatalog>;
  /** The developer's columns. They are the shipped Default layout. */
  columns: MaybeRefOrGetter<DeskColumn[]>;
  formatters?: MaybeRefOrGetter<DeskFieldFormatters>;
  /**
   * For a page that saves its own filters (a filter panel, toggles) into layouts. Return whether
   * what the page shows differs from the active layout's saved view. Turns on the menu's
   * Save, Reset and New-from-current entries.
   */
  viewModified?: () => boolean;
}

const rawCache = new Map<string, SavedLayouts>();

function prefKey(storageKey: string): string {
  return `grid-layouts:${storageKey}`;
}

function readSaved(value: unknown): SavedLayouts {
  const empty: SavedLayouts = { version: 1, active: DESK_DEFAULT_LAYOUT_ID, layouts: [] };
  if (!value || typeof value !== 'object') return empty;
  const record = value as Partial<SavedLayouts>;
  const layouts = Array.isArray(record.layouts)
    ? record.layouts.filter((item): item is DeskGridLayout => Boolean(item && typeof item.id === 'string' && Array.isArray(item.columns)))
    : [];
  const active = typeof record.active === 'string' ? record.active : DESK_DEFAULT_LAYOUT_ID;
  const refetch = Array.isArray(record.refetch) ? record.refetch.filter((id): id is string => typeof id === 'string') : [];
  return { version: 1, active, layouts, ...(refetch.length ? { refetch } : {}) };
}

export function newLayoutId(prefix = 'layout'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export interface DeskGridViewState {
  filters: Record<string, string>;
  sortColumn: string;
  sortDescending: boolean;
}

/** The filter text and sort a layout opens with. Without a saved sort the list is newest first. */
export function layoutViewState(layout: DeskGridLayout | null | undefined): DeskGridViewState {
  const view = layout?.view;
  return {
    filters: { ...(view?.filters ?? {}) },
    sortColumn: view?.sort?.column ?? 'id',
    sortDescending: view?.sort ? view.sort.direction === 'desc' : true,
  };
}

/**
 * Named grid layouts for one list, saved in desk prefs. Gives the grid its columns and the
 * page a `DeskGridQueryState`; the page's adapter turns that into its own request.
 */
export function useDeskGridLayouts(options: DeskGridLayoutsOptions) {
  const key = prefKey(options.storageKey);
  const cached = rawCache.get(key);
  const saved = ref<SavedLayouts>(cached ?? readSaved(null));
  const prefsReady = ref(Boolean(cached));
  const hiddenReady = ref(false);
  const hidden = ref<string[]>([]);
  const filterText = reactive<Record<string, string>>({});
  const sortColumn = ref('id');
  const sortDescending = ref(true);
  /** What the grid's filter boxes start with. Changes only when a layout's view is applied. */
  const filterValues = shallowRef<Record<string, string>>({});
  /**
   * The active layout's saved filter-panel values and toggles. A new object each time a view is
   * applied (tab switch, save, reset), so the page can watch it and reload.
   */
  const viewPanel = shallowRef<{ panel: Record<string, unknown> | null; options: Record<string, boolean> }>({ panel: null, options: {} });

  const catalog = computed(() => toValue(options.catalog));
  const defaultColumns = computed(() => toValue(options.columns));
  const formatters = computed(() => toValue(options.formatters) ?? {});

  const defaultOverridden = computed(() => saved.value.layouts.some((layout) => layout.id === DESK_DEFAULT_LAYOUT_ID));

  const layouts = computed(() => {
    const rest = saved.value.layouts
      .filter((layout) => layout.id !== DESK_DEFAULT_LAYOUT_ID)
      .map((layout) => cleanLayout(layout, catalog.value));
    const savedDefault = saved.value.layouts.find((layout) => layout.id === DESK_DEFAULT_LAYOUT_ID);
    const builtin = savedDefault ? cleanLayout(savedDefault, catalog.value) : shippedLayout(defaultColumns.value, catalog.value);
    return [{ ...builtin, id: DESK_DEFAULT_LAYOUT_ID }, ...rest];
  });
  const activeLayout = computed(() => layouts.value.find((layout) => layout.id === saved.value.active) ?? layouts.value[0] ?? null);
  const active = computed(() => activeLayout.value?.id ?? DESK_DEFAULT_LAYOUT_ID);
  const menuLayouts = computed(() => layouts.value.filter((layout) => layout.kind === 'menu' && layout.id !== DESK_DEFAULT_LAYOUT_ID));
  const tabLayouts = computed(() => layouts.value.filter((layout) => layout.kind === 'tab' && layout.id !== DESK_DEFAULT_LAYOUT_ID));
  /** The active layout's note, shown above the grid. Empty when there is none. */
  const note = computed(() => activeLayout.value?.note ?? '');
  const hideActions = computed(() => activeLayout.value?.id !== DESK_DEFAULT_LAYOUT_ID && activeLayout.value?.hideActions === true);

  const columns = computed((): DeskColumn[] => {
    const layout = activeLayout.value;
    if (!layout) return [];
    const drawn = layoutColumns(layout, catalog.value, formatters.value);
    // Display flags of the developer's columns carry over to the same column in any layout.
    const menuIds = new Set(defaultColumns.value.filter((column) => column.textLayoutMenu).map((column) => column.id));
    const quietIds = new Set(defaultColumns.value.filter((column) => column.quiet).map((column) => column.id));
    const repeatsById = new Map(defaultColumns.value.filter((column) => column.repeats).map((column) => [column.id, column.repeats!]));
    const byId = new Map(defaultColumns.value.map((column) => [column.id, column]));
    return drawn.map((column) => {
      const own = byId.get(column.id);
      return {
        ...column,
        ...(menuIds.has(column.id) ? { textLayoutMenu: true } : {}),
        ...(quietIds.has(column.id) ? { quiet: true } : {}),
        ...(own?.zeros ? { zeros: own.zeros } : {}),
        ...(own?.tone ? { tone: own.tone } : {}),
        // The layout's own choice wins over the developer's.
        ...(!column.repeats && repeatsById.has(column.id) ? { repeats: repeatsById.get(column.id)! } : {}),
      };
    });
  });

  const infoById = computed(() => {
    const map = new Map<string, DeskColumnQueryInfo>();
    const layout = activeLayout.value;
    if (!layout) return map;
    for (const column of withLockedColumns(layout, catalog.value).columns) map.set(column.id, layoutColumnInfo(column, catalog.value));
    return map;
  });

  const gridStorageKey = computed(() =>
    active.value === DESK_DEFAULT_LAYOUT_ID ? options.storageKey : `${options.storageKey}@${active.value}`,
  );

  const filters = computed((): DeskGridQueryFilter[] => {
    const out: DeskGridQueryFilter[] = [];
    for (const [columnId, text] of Object.entries(filterText)) {
      if (!text.trim()) continue;
      const info = infoById.value.get(columnId);
      if (!info?.filterField) continue;
      out.push({ field: info.filterField, type: info.filterType, text });
    }
    return out;
  });

  const sort = computed(() => {
    const info = infoById.value.get(sortColumn.value);
    if (!info?.sortField) return null;
    return { field: info.sortField, direction: sortDescending.value ? ('desc' as const) : ('asc' as const) };
  });

  const query = computed((): DeskGridQueryState => {
    const uses: DeskFieldUse[] = [];
    const hiddenIds = new Set(hidden.value);
    for (const column of columns.value) {
      if (hiddenIds.has(column.id) && !column.locked) continue;
      if (column.visible && !column.visible()) continue;
      uses.push(...(infoById.value.get(column.id)?.uses ?? []));
    }
    if (sort.value) uses.push({ key: sort.value.field });
    for (const filter of filters.value) uses.push({ key: filter.field });
    return {
      layoutId: active.value,
      selection: selectionOf(uses, catalog.value),
      sort: sort.value,
      filters: filters.value,
    };
  });

  /** Layouts kept live: switching back to one shows the rows it last loaded. */
  const live = computed((): ReadonlySet<string> => {
    const off = new Set(saved.value.refetch ?? []);
    return new Set(layouts.value.map((layout) => layout.id).filter((id) => !off.has(id)));
  });

  /** Turn a layout's pin on or off. */
  async function togglePin(id: string): Promise<void> {
    const off = new Set(saved.value.refetch ?? []);
    if (off.has(id)) off.delete(id);
    else off.add(id);
    await persist({ ...saved.value, refetch: [...off] });
  }

  /** Root fields the request asks for. Actions check their condition fields against this. */
  const loadedFields = computed((): ReadonlySet<string> => new Set(query.value.selection.fields));

  const ready = computed(() => prefsReady.value && hiddenReady.value);

  const menu = computed(
    (): DeskGridLayoutMenuState => ({
      active: active.value,
      defaultOverridden: defaultOverridden.value,
      items: layouts.value.map((layout) => ({
        id: layout.id,
        name: layout.name,
        kind: layout.id === DESK_DEFAULT_LAYOUT_ID ? 'default' : layout.kind,
      })),
      ...(options.viewModified ? { view: { modified: options.viewModified() } } : {}),
    }),
  );

  async function persist(input: SavedLayouts): Promise<void> {
    // Saves that rebuild the record keep the pins; a removed layout's pin goes with it.
    const refetch = (input.refetch ?? saved.value.refetch ?? []).filter((id) => id === DESK_DEFAULT_LAYOUT_ID || input.layouts.some((layout) => layout.id === id));
    const next: SavedLayouts = { version: 1, active: input.active, layouts: input.layouts, ...(refetch.length ? { refetch } : {}) };
    saved.value = next;
    rawCache.set(key, next);
    await writeDeskPref(key, next);
  }

  /** The active layout's saved sort and filters replace what the user had. They are starting values only. */
  function applyView(): void {
    const state = layoutViewState(activeLayout.value);
    for (const id of Object.keys(filterText)) delete filterText[id];
    Object.assign(filterText, state.filters);
    filterValues.value = state.filters;
    sortColumn.value = state.sortColumn;
    sortDescending.value = state.sortDescending;
    const view = activeLayout.value?.view;
    viewPanel.value = { panel: view?.panel ? { ...view.panel } : null, options: { ...(view?.options ?? {}) } };
  }

  /**
   * Put what the page shows into the active layout's view and save it. Default becomes the
   * user's edit of Default, the same as editing its columns.
   */
  async function saveView(patch: Pick<DeskGridLayoutView, 'panel' | 'options'>): Promise<void> {
    const layout = activeLayout.value;
    if (!layout) return;
    const view: DeskGridLayoutView = { ...(layout.view ?? {}) };
    if (patch.panel !== undefined) view.panel = patch.panel;
    if (patch.options !== undefined) view.options = patch.options;
    await save({ ...cloneLayout(layout), view });
  }

  /** Throw away what the user changed on screen and open the active layout's view again. */
  function resetView(): void {
    applyView();
  }

  /** The grid remounts for another layout and reports its hidden columns again. */
  function resetHidden(): void {
    hiddenReady.value = false;
    hidden.value = [];
  }

  /** `persist` sets `saved` before it awaits, so the view is applied to the new active layout. */
  async function persistAndApply(next: SavedLayouts, apply: boolean): Promise<void> {
    const write = persist(next);
    if (apply) applyView();
    await write;
  }

  async function select(id: string): Promise<void> {
    const next = id === DESK_DEFAULT_LAYOUT_ID || saved.value.layouts.some((layout) => layout.id === id) ? id : DESK_DEFAULT_LAYOUT_ID;
    if (next === active.value) return;
    resetHidden();
    await persistAndApply({ ...saved.value, active: next }, true);
  }

  /** Insert or replace a layout and make it active. Its saved view applies right away. */
  async function save(layout: DeskGridLayout): Promise<void> {
    const clean = cleanLayout(layout, catalog.value);
    const exists = saved.value.layouts.some((item) => item.id === clean.id);
    const list = exists ? saved.value.layouts.map((item) => (item.id === clean.id ? clean : item)) : [...saved.value.layouts, clean];
    if (clean.id !== active.value) resetHidden();
    await persistAndApply({ version: 1, active: clean.id, layouts: list }, true);
  }

  async function remove(id: string): Promise<void> {
    if (id === DESK_DEFAULT_LAYOUT_ID) return;
    const wasActive = id === active.value;
    if (wasActive) resetHidden();
    await persistAndApply(
      {
        version: 1,
        active: id === saved.value.active ? DESK_DEFAULT_LAYOUT_ID : saved.value.active,
        layouts: saved.value.layouts.filter((layout) => layout.id !== id),
      },
      wasActive,
    );
  }

  /** Drop the saved edit of Default. The shipped columns show again. */
  async function resetDefault(): Promise<void> {
    if (!defaultOverridden.value) return;
    const wasActive = active.value === DESK_DEFAULT_LAYOUT_ID;
    if (wasActive) resetHidden();
    await persistAndApply(
      {
        version: 1,
        active: saved.value.active,
        layouts: saved.value.layouts.filter((layout) => layout.id !== DESK_DEFAULT_LAYOUT_ID),
      },
      wasActive,
    );
  }

  /**
   * Replace every saved layout at once, for an import of all layouts. A layout with the id
   * `default` is the user's edit of Default. The active layout stays when it still exists.
   */
  async function replaceAll(list: readonly DeskGridLayout[]): Promise<void> {
    const clean = list.map((layout) => cleanLayout(layout, catalog.value));
    const ids = new Set(clean.map((layout) => layout.id));
    const nextActive = saved.value.active === DESK_DEFAULT_LAYOUT_ID || ids.has(saved.value.active) ? saved.value.active : DESK_DEFAULT_LAYOUT_ID;
    if (nextActive !== active.value) resetHidden();
    await persistAndApply({ version: 1, active: nextActive, layouts: clean }, true);
  }

  /** Saved layouts as they would go back into `replaceAll`: Default only when the user edited it. */
  function savedLayouts(): DeskGridLayout[] {
    return layouts.value.filter((layout) => layout.id !== DESK_DEFAULT_LAYOUT_ID || defaultOverridden.value);
  }

  /** A copy of the active layout under a new id, not saved yet. */
  function duplicate(): DeskGridLayout {
    const layout = activeLayout.value ?? shippedLayout(defaultColumns.value, catalog.value);
    return { ...cloneLayout(layout), id: newLayoutId(), name: `Copy of ${layout.name}` };
  }

  function blank(): DeskGridLayout {
    return { id: newLayoutId(), name: 'New layout', kind: 'menu', columns: [] };
  }

  function onSort(columnId: string, action?: DeskGridSortAction): boolean {
    const next = applyDeskGridSort(columnId, action, columns.value, {
      sortColumn: sortColumn.value,
      sortDescending: sortDescending.value,
    });
    if (!next) return false;
    sortColumn.value = next.sortColumn;
    sortDescending.value = next.sortDescending;
    return true;
  }

  function onFilter(values: Record<string, string>): void {
    for (const id of Object.keys(filterText)) if (!(id in values)) delete filterText[id];
    Object.assign(filterText, values);
  }

  function onHidden(ids: string[]): void {
    hidden.value = ids;
    hiddenReady.value = true;
  }

  // Prefs are part of the gate before the first fetch, so the first request carries the saved view.
  applyView();

  onMounted(() => {
    if (rawCache.has(key)) return;
    void readDeskPref<unknown>(key).then((value) => {
      const next = readSaved(value);
      rawCache.set(key, next);
      saved.value = next;
      applyView();
      prefsReady.value = true;
    });
  });

  return {
    /** The list's key. Layout files carry it, so one list's layout cannot be imported into another. */
    storageKey: options.storageKey,
    ready,
    layouts,
    active,
    activeLayout,
    menuLayouts,
    tabLayouts,
    columns,
    gridStorageKey,
    query,
    loadedFields,
    menu,
    sortColumn,
    sortDescending,
    filterValues,
    viewPanel,
    hideActions,
    note,
    catalog,
    formatters,
    live,
    togglePin,
    select,
    save,
    remove,
    resetDefault,
    saveView,
    resetView,
    replaceAll,
    savedLayouts,
    duplicate,
    blank,
    onSort,
    onFilter,
    onHidden,
  };
}

export type DeskGridLayoutsApi = ReturnType<typeof useDeskGridLayouts>;
