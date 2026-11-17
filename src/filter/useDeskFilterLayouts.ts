import { computed, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue';
import { catalogFromColumns } from '../grid/layout/catalogFromColumns';
import { useDeskGridDesigner } from '../grid/layout/useDeskGridDesigner';
import { useDeskGridLayouts } from '../grid/layout/useDeskGridLayouts';
import type { DeskCatalogField } from '../grid/layout/types';
import type { DeskColumn } from '../grid/types';
import type { DeskToggles } from '../storage/deskToggles';
import { deskSavedFilter, freezeDeskFilter, sameDeskFilter, thawDeskFilter } from './saved';
import type { DeskFilterSpec, DeskFilterValues } from './types';

export interface DeskFilterLayoutsOptions<V extends DeskFilterValues> {
  /** Key for the layouts and the grid's column prefs. */
  storageKey: string;
  /** The page's own columns: the Default layout, and the fields the designer offers. */
  columns: readonly DeskColumn[];
  /** Row keys every layout needs, such as the id a row action reads. `id` is always included. */
  always?: readonly string[];
  /** More fields for rules and extra columns, such as numbers behind formatted text. */
  extraFields?: readonly DeskCatalogField[];
  spec: DeskFilterSpec<V>;
  /** The values the shown rows were loaded with. Save and the modified mark compare against these. */
  applied: Ref<V>;
  /** Page toggles a tab saves with its filter. */
  toggles?: DeskToggles;
  /** Other things the first load waits for, such as the page size. */
  ready?: MaybeRefOrGetter<boolean>;
  /** A tab's saved view opened (first load, tab switch, save, reset). Set the filter and reload. */
  onOpen: (values: V) => void;
}

/**
 * Grid layouts for a page that filters through `DeskFilterPanel`: each tab keeps its filter values
 * and toggles, the layout menu saves and resets them, and the designer shows the filter fields.
 * The page keeps its own fetch. Bind the result to `DeskGridLayoutTabs`, `DeskGrid` and
 * `DeskGridDesigner` as the README's "Filter panel in layout tabs" shows.
 */
export function useDeskFilterLayouts<V extends DeskFilterValues>(options: DeskFilterLayoutsOptions<V>) {
  const { spec, applied, toggles } = options;
  const derived = catalogFromColumns(options.columns, ['id', ...(options.always ?? [])]);
  const catalog = { ...derived.catalog, fields: [...derived.catalog.fields, ...(options.extraFields ?? [])] };

  const layouts = useDeskGridLayouts({
    storageKey: options.storageKey,
    catalog,
    columns: [...options.columns],
    formatters: derived.formatters,
    viewModified: () => viewModified.value,
  });

  /** Each toggle as the open tab saved it, or the user's remembered choice. */
  function savedToggle(id: string): boolean {
    return layouts.viewPanel.value.options[id] ?? toggles?.remembered(id) ?? false;
  }

  /** What the open tab saved, as values for today. */
  const savedValues = computed(() => thawDeskFilter(spec, layouts.viewPanel.value.panel));

  /** The filter or a toggle on screen differs from what the open tab saved. */
  const viewModified = computed(
    () =>
      !sameDeskFilter(spec, applied.value, savedValues.value) ||
      (toggles?.items.some((item) => toggles.screen[item.id] !== savedToggle(item.id)) ?? false),
  );

  function currentView(): { panel: Record<string, unknown>; options: Record<string, boolean> } {
    const saved: Record<string, boolean> = {};
    for (const item of toggles?.items ?? []) saved[item.id] = toggles?.screen[item.id] === true;
    return { panel: freezeDeskFilter(spec, applied.value), options: saved };
  }

  const designer = useDeskGridDesigner(layouts, { currentView });
  const panelFilter = deskSavedFilter(spec);

  const allReady = (): boolean => layouts.ready.value && (options.ready === undefined || toValue(options.ready));

  function openView(): void {
    if (!allReady()) return;
    if (toggles) for (const item of toggles.items) toggles.screen[item.id] = savedToggle(item.id);
    options.onOpen(savedValues.value);
  }

  // A tab switch, a save or Reset to saved hands over a new view object.
  watch(() => layouts.viewPanel.value, openView);
  watch(allReady, (ready) => {
    if (ready) openView();
  });

  // Remembered choices load after the first paint. A tab that did not save a toggle follows them.
  if (toggles) {
    watch(
      () => toggles.items.map((item) => toggles.remembered(item.id)),
      () => {
        for (const item of toggles.items) {
          if (layouts.viewPanel.value.options[item.id] === undefined) toggles.screen[item.id] = toggles.remembered(item.id);
        }
      },
    );
  }

  return { layouts, designer, panelFilter, viewModified, ready: computed(allReady) };
}

export type DeskFilterLayoutsApi = ReturnType<typeof useDeskFilterLayouts>;
