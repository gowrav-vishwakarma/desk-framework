<template>
  <DeskToolbarMenu id="report-options" label="Report options" icon="settings" :menu="optionsMenu" />
  <DeskGridLayoutTabs :layouts="layouts.layouts.value" :active="layouts.active.value" :modified="viewModified" @select="layouts.select" />
  <DeskGridLayoutNote :note="layouts.note.value" />
  <p v-if="report.description" class="desk-muted desk-studio-description">{{ report.description }}</p>
  <p v-if="message" class="desk-error">{{ message }}</p>
  <p v-if="result?.meta.truncated" class="desk-error desk-studio-capped" role="alert">
    This page was too big, so some of its rows are left out. Show fewer per page, or narrow the filter.
  </p>
  <DeskFilterPanel v-model:values="values" :spec="spec" :shortcut="true" @apply="load(1)" @applied="grid?.focusFirstRow()" />
  <DeskStatCards :cards="cards" />
  <DeskGrid
    :key="`${layouts.gridStorageKey.value}|${gridFilter ? 'cell' : 'row'}`"
    ref="grid"
    :rows="shownRows"
    mode="list"
    :selection="gridFilter ? 'cell' : 'row'"
    :soft-cursor="gridFilter"
    initial
    field-id="report-grid"
    :storage-key="layouts.gridStorageKey.value"
    :show-filter="gridFilter"
    :filter-shortcut="false"
    :columns="gridColumns"
    :layout-designer="layouts.menu.value"
    :row-class="rowClass"
    :row-number="rowNumber"
    :totals="totalsLine"
    :foot-lines="footLines"
    :loading="loading"
    :page="page"
    :page-count="pageCount"
    :page-size="gridPageSize"
    :page-sizes="PAGE_SIZES"
    :page-size-choice="gridPageSizeChoice"
    :item-count="totalCount"
    :item-noun="itemNoun"
    :filter-values="columnFilters.start.value"
    @filter="columnFilters.onFilter"
    @page="load"
    @update:page-size-choice="onPageSizeChoice"
    @open="openRow"
    @open-page="openRow"
    @update:hidden="layouts.onHidden"
    @layout="designer.onCommand"
  >
    <template #status>{{ statusText }}</template>
  </DeskGrid>
  <DeskGridDesigner
    v-if="designer.open.value"
    :open="designer.open.value"
    :layout="designer.draft.value"
    :catalog="layouts.catalog.value"
    :formatters="layouts.formatters.value"
    :samples="rows.slice(0, 3)"
    :list-key="layouts.storageKey"
    :all-layouts="layouts.layouts.value"
    :is-new="designer.isNew.value"
    :panel-filter="panelFilter"
    @update:open="designer.setOpen"
    @save="designer.onSave"
    @delete="designer.onDelete"
    @import-all="designer.onImportAll"
  />
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { deskValue } from '../filter/describe';
import DeskFilterPanel from '../filter/DeskFilterPanel.vue';
import type { DeskFilterValues } from '../filter/types';
import { useDeskFilterLayouts } from '../filter/useDeskFilterLayouts';
import { useDeskColumnFilters } from '../grid/columnFilters';
import { useDeskAutomationNode } from '../automation/registry';
import DeskGrid from '../grid/DeskGrid.vue';
import DeskGridDesigner from '../grid/layout/DeskGridDesigner.vue';
import DeskGridLayoutNote from '../grid/layout/DeskGridLayoutNote.vue';
import DeskGridLayoutTabs from '../grid/layout/DeskGridLayoutTabs.vue';
import { deskPageSizesExcept, useDeskPageSize, type DeskPageSize } from '../grid/pageSize';
import type { DeskGridApi, DeskGridRow } from '../grid/types';
import DeskStatCards from '../layout/DeskStatCards.vue';
import DeskToolbarMenu from '../layout/DeskToolbarMenu.vue';
import { deskTogglesMenu } from '../menu/togglesMenu';
import { createDeskToggles } from '../storage/deskToggles';
import { reportColumnWhere } from './columnWhere';
import { reportsHost, reportsPeriod, useReportsPlace } from './host';
import type { Rdl2Report, Rdl2RunResult } from './language';
import { runReport } from './studioApi';
import { studioBands, studioCards, studioColumns, studioFilterFields, studioTotalColumns } from './studioColumns';
import { studioDefaults, studioFilterSpec, studioParams } from './studioFilter';
import { GROUP_HEAD, groupedRows, headingOf, pagedByOf, pagingPhrase } from './studioRows';
import { txt } from './text';

/**
 * Runs one RDL2 report: its parameters as the filter panel, saved tabs, grid filters sent to the
 * server, totals and group subtotals, and drill-down. The definition comes from the page or the designer.
 */
const props = defineProps<{
  report: Rdl2Report;
  /** Run this definition as is instead of by name (designer preview). */
  draft?: boolean;
  /** Parameter values that replace the tab's on the first run, from a drill-down. */
  initial?: Record<string, unknown> | null;
}>();

const router = useRouter();
const place = useReportsPlace();

const PAGE_SIZES = deskPageSizesExcept('infinite', 'dynamic');

const period = () => reportsPeriod(place);
const defaults = (): DeskFilterValues => studioDefaults(props.report, period());
// Read inside the panel's sentence, so it follows the page size the viewer picks.
const spec = studioFilterSpec(props.report, {
  defaults,
  period,
  ...(place.lookup ? { lookup: (preset: string) => place.lookup!(preset) } : {}),
  paging: () => pagingPhrase(props.report.output, pageSizeState.limit.value ?? 0, deskValue),
});

const values = ref<DeskFilterValues>(defaults());
const applied = ref<DeskFilterValues>(defaults());

const storageKey = `desk-report-${props.report.name}`;
const pageSizeState = useDeskPageSize({ storageKey, sizes: PAGE_SIZES, initial: props.report.output.pageSize || 100 });
const gridPageSize = computed(() => pageSizeState.effectivePageSize.value);
const gridPageSizeChoice = computed(() => pageSizeState.choice.value);

/** Shared by every report: one choice of how report grids move and filter. */
const toggles = createDeskToggles('report-view', [
  { id: 'gridFilter', label: 'Enable grid filter', default: true },
  // Off by default, so a report reads as designed until the user asks for blanks.
  { id: 'hideZero', label: 'Hide zero values', default: false },
]);
const optionsMenu = deskTogglesMenu(toggles, { label: 'Options', groupId: 'report-options' });
const gridFilter = computed(() => toggles.screen.gridFilter === true);

let pendingInitial = props.initial ?? null;
/**
 * The grid mounts after the report loads, so the page's initial focus has already run. Focus
 * its first cell once rows arrive: on the first load and whenever a saved tab opens.
 */
let focusPending = true;
const { layouts, designer, panelFilter, viewModified } = useDeskFilterLayouts({
  storageKey,
  columns: studioColumns(props.report, { hideZero: () => toggles.screen.hideZero === true }),
  spec,
  applied,
  toggles,
  ready: () => pageSizeState.ready.value,
  onOpen: (saved) => {
    values.value = pendingInitial ? { ...saved, ...pendingInitial } : saved;
    pendingInitial = null;
    focusPending = true;
    void load(1);
  },
});

const filterFields = studioFilterFields(props.report);
const columnFilters = useDeskColumnFilters({ onChange: () => void load(1) });
watch(gridFilter, (on) => {
  if (on || !columnFilters.active()) return;
  columnFilters.clear();
  void load(1);
});

const grid = ref<DeskGridApi | null>(null);
const rows = ref<DeskGridRow[]>([]);
const result = ref<Rdl2RunResult | null>(null);
const page = ref(1);
const pageCount = ref(1);
/** What pages count: groups when the report pages by group, else rows. */
const totalCount = ref(0);
const rowCount = ref(0);
/** How many of what pages count come before this page: the first row number is this + 1. */
const pageStart = ref(0);
const loading = ref(false);
const message = ref('');

const outputColumns = new Set(props.report.output.columns.map((column) => column.column));
/**
 * With `columnsOnDemand`, the output columns the grid shows (the open layout less hidden columns):
 * only these are worked out on the server, which adds what they, the sort, groups and cards read.
 * Without it (the default) every column comes at once, so showing one needs no run.
 */
const onDemand = props.report.output.columnsOnDemand === true;
const shownColumns = computed(() => (onDemand ? [...layouts.loadedFields.value].filter((field) => outputColumns.has(field)) : []));
/** Columns the rows on screen carry. */
let loadedColumns = new Set<string>();
// Showing a column the rows do not carry loads the page again; hiding one needs nothing.
watch(shownColumns, (shown) => {
  if (result.value && shown.some((column) => !loadedColumns.has(column))) void load(page.value);
});

useDeskAutomationNode({
  kind: 'report',
  name: () => props.report.name || 'report',
  read: () => ({
    name: props.report.name,
    title: props.report.title,
    count: result.value?.count ?? null,
    truncated: result.value?.meta.truncated === true,
    applied: applied.value,
    message: message.value || null,
  }),
  brief: () => ({ count: result.value?.count ?? null, message: message.value }),
  ops: () => ({
    run: { description: 'Run the report with the filter values now on the panel (page 1)', run: () => load(1) },
  }),
});

async function load(next = 1): Promise<void> {
  if (!pageSizeState.ready.value || !layouts.ready.value) return;
  loading.value = true;
  message.value = '';
  const limit = pageSizeState.limit.value ?? 0;
  try {
    if (next === 1) applied.value = { ...values.value };
    const where = gridFilter.value ? reportColumnWhere(columnFilters.start.value, filterFields) : null;
    const columns = shownColumns.value;
    const response = await runReport({
      ...(props.draft ? { definition: props.report } : { name: props.report.name }),
      params: studioParams(props.report, applied.value),
      ...(where ? { where } : {}),
      limit,
      offset: (next - 1) * (limit || 0),
      ...(columns.length ? { columns } : {}),
    });
    loadedColumns = new Set(columns.length ? columns : outputColumns);
    result.value = response;
    rows.value = response.rows.map((row, index) => ({ ...row, id: `${next}-${index}` }));
    page.value = next;
    pageStart.value = (next - 1) * (limit || 0);
    rowCount.value = response.count;
    // Paged by group, the server counts groups and each page holds whole ones.
    totalCount.value = response.groups ?? response.count;
    pageCount.value = limit ? Math.max(1, Math.ceil(totalCount.value / limit)) : 1;
    if (focusPending) {
      focusPending = false;
      await nextTick();
      grid.value?.focusFirstRow();
    }
  } catch (caught) {
    message.value = reportsHost().failure(caught);
  } finally {
    loading.value = false;
  }
}

function onPageSizeChoice(choice: DeskPageSize): void {
  pageSizeState.setChoice(choice);
  void load(1);
}

/** Group head lines, and row numbers for what the pages count (`studioRows.ts`). */
const view = computed(() => {
  const group = props.report.output.groups?.[0]?.column ?? '';
  const subtotals = (result.value?.totals as { __groups?: Record<string, Record<string, unknown>[]> } | null)?.__groups?.[group];
  // The server says it paged by group by counting groups.
  return groupedRows(props.report.output, rows.value, { subtotals, pageStart: pageStart.value, byGroup: result.value?.groups !== undefined });
});
const shownRows = computed(() => view.value.rows);

function rowNumber(row: DeskGridRow, index: number): number | string {
  return view.value.numbers.get(row.id) ?? pageStart.value + index + 1;
}

/** Figures above the grid, from the whole result. */
const cards = computed(() => studioCards(props.report, result.value?.totals));

/**
 * The layout's columns with their band headings over them. A band naming a period shows the
 * heading the run worked out for it, so it follows the dates of the run.
 */
const gridColumns = computed(() => {
  const bands = studioBands(props.report, result.value?.meta.periods);
  if (!bands.size) return layouts.columns.value;
  return layouts.columns.value.map((column) => {
    const band = bands.get(column.id);
    return band ? { ...column, group: band } : column;
  });
});

/** Lines under the totals (all without a category, new categories…), worked out by the server. */
const footLines = computed((): Record<string, unknown>[] => {
  const lines = (result.value?.totals as { __footers?: Record<string, unknown>[] } | null)?.__footers;
  return Array.isArray(lines) ? lines : [];
});

/** The totals line under the grid: the server's sums over every page, and the formula totals (GP %). */
const totalsLine = computed((): Record<string, unknown> | null => {
  const totals = result.value?.totals;
  const cols = studioTotalColumns(props.report);
  if (!totals || cols.length === 0) return null;
  const out: Record<string, unknown> = {};
  for (const col of cols) if (totals[col] !== undefined) out[col] = totals[col];
  return Object.keys(out).length ? out : null;
});

function rowClass(row: DeskGridRow): string {
  if (!props.report.output.groups?.length) return '';
  return row[GROUP_HEAD] === true ? 'desk-group-head' : 'desk-group-line';
}

/** Paged by group, the pager counts groups by the group column's heading: `Party group`. */
const itemNoun = computed((): readonly [string, string] | null => {
  const by = pagedByOf(props.report.output);
  if (result.value?.groups === undefined || !by) return null;
  const word = headingOf(props.report.output, by);
  return [`${word} group`, `${word} groups`];
});

// Totals are in the line under the grid.
const statusText = computed(() =>
  [
    `${rowCount.value.toLocaleString()} rows`,
    ...(result.value?.meta.truncated ? ['page too big, some rows left out: show fewer per page'] : []),
    ...(result.value ? [`${result.value.meta.ms} ms`] : []),
  ].join(' · '),
);

/** Enter: the first column that drills somewhere decides where the row goes. */
function openRow(row: DeskGridRow): void {
  if (row[GROUP_HEAD] === true) return;
  const target = props.report.output.columns.find((column) => column.drill)?.drill;
  if (!target) return;
  if ('voucher' in target && target.voucher) {
    const id = Number(row[target.voucher.id]);
    const type = txt(row[target.voucher.type]) || target.voucher.type;
    if (!id || !place.openRecord?.(type, id)) message.value = 'This row has no record page';
    return;
  }
  if ('report' in target) {
    const params: Record<string, unknown> = {};
    for (const [param, column] of Object.entries(target.params)) params[param] = row[column] ?? applied.value[column];
    void router.push({ path: place.path('run', target.report), query: { p: JSON.stringify(params) } });
  }
}

defineExpose({ reload: () => load(1) });
</script>

<style scoped>
.desk-studio-description {
  margin: 0 0 4px;
}
.desk-studio-capped {
  margin: 0 0 6px;
  padding: 6px 10px;
  border: 1px solid var(--desk-tone-danger);
  border-left-width: 4px;
  background: color-mix(in srgb, var(--desk-tone-danger) 10%, transparent);
  font-weight: 600;
}
</style>
