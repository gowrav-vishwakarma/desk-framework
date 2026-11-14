<template>
  <div ref="rootEl" class="desk-pivot" :class="{ 'no-pane': !showPane }" @keydown="onKey">
    <div class="desk-pivot-main">
      <div class="desk-pivot-toolbar" role="toolbar" aria-label="Pivot">
        <button type="button" :disabled="!history.length" title="Undo the last layout change (Ctrl+Z)" @click="undo">↶ Undo</button>
        <span class="desk-pivot-sep" />
        <div class="desk-pivot-segment" role="group" aria-label="Layout">
          <button type="button" :class="{ on: layout.form === 'compact' }" title="One indented label column" @click="set({ form: 'compact' })">Compact</button>
          <button type="button" :class="{ on: layout.form === 'tabular' }" title="One column per row field" @click="set({ form: 'tabular' })">Tabular</button>
        </div>
        <label><input type="checkbox" :checked="layout.subtotals" @change="set({ subtotals: !layout.subtotals })" /> Subtotals</label>
        <label><input type="checkbox" :checked="layout.rowTotals" @change="set({ rowTotals: !layout.rowTotals })" /> Total row</label>
        <label><input type="checkbox" :checked="layout.columnTotals" @change="set({ columnTotals: !layout.columnTotals })" /> Total column</label>
        <span class="desk-pivot-sep" />
        <template v-if="layout.rows.length > 1">
          <span class="desk-pivot-muted">Show</span>
          <div class="desk-pivot-segment" role="group" aria-label="Row levels">
            <button v-for="level in layout.rows.length" :key="level" type="button" :title="`Rows down to ${rowFieldLabels[level - 1]}`" @click="showLevel(level)">{{ level }}</button>
          </div>
        </template>
        <button type="button" title="Expand every row and column" @click="expandAll">⊞ Expand</button>
        <button type="button" title="Collapse every row and column" @click="collapseAll">⊟ Collapse</button>
        <button type="button" :disabled="!layout.rows.length && !layout.columns.length" title="Rows become columns and columns rows" @click="change(pivotSwapAxes(layout))">⇄ Swap</button>
        <span class="desk-pivot-sep" />
        <label>
          Chart
          <select v-model="chartType" data-desk-field="pivot-chart">
            <option value="off">Off</option>
            <option value="bar">Bars</option>
            <option value="stacked">Stacked bars</option>
            <option value="line">Lines</option>
            <option value="pie">Pie</option>
          </select>
        </label>
        <button type="button" :disabled="!layout.values.length" title="Download the pivot as it shows" @click="exportXlsx">Excel</button>
        <button type="button" :class="{ on: showPane }" title="Show or hide the field list" @click="showPane = !showPane">Fields</button>
        <button type="button" title="Back to the starting layout" @click="reset">Reset</button>
        <span v-if="highlighting" class="desk-pivot-matchbar" data-desk-field="pivot-matches">
          <button type="button" title="Previous highlighted cell (Shift+F3)" @click="table?.prevMatch()">▲</button>
          <span>{{ matchInfo.count ? `Match ${matchInfo.at || '–'} of ${matchInfo.count.toLocaleString()}` : 'Matches' }}</span>
          <button type="button" title="Next highlighted cell (F3)" @click="table?.nextMatch()">▼</button>
        </span>
        <span class="desk-pivot-status">{{ status }}</span>
      </div>

      <div v-if="layout.filters.length" class="desk-pivot-filterbar">
        <span class="desk-pivot-axis-name">Filters</span>
        <button
          v-for="(item, index) in layout.filters"
          :key="item.field"
          type="button"
          class="desk-pivot-field-button"
          :class="{ 'is-filtered': pivotItemFiltered(item) }"
          @click="openFilter('filters', index, $event)"
        >
          {{ pivotAxisLabel(item, byId.get(item.field)) }}: <strong>{{ filterSummary(item) }}</strong> <span aria-hidden="true">▾</span>
        </button>
      </div>

      <div v-if="activeRules.length" class="desk-pivot-hint desk-pivot-rules" data-desk-field="pivot-rules">
        <span v-for="rule in activeRules" :key="`${rule.area}:${rule.index}`" class="desk-pivot-rule">
          <strong>{{ rule.name }}</strong>: {{ rule.text.join(' and ') }}
          <button type="button" title="Clear these rules" @click="clearRules(rule.area, rule.index)">Clear</button>
        </span>
      </div>

      <PivotChart v-if="chartKind && layout.values.length" :view="view" :cube="cube" :value-labels="valueLabels" :type="chartKind" />

      <div v-if="!layout.rows.length && !layout.columns.length && !layout.values.length" class="desk-pivot-empty">
        <div class="desk-pivot-empty-art" aria-hidden="true">
          <div class="is-corner" />
          <div class="is-cols">Columns</div>
          <div class="is-rows">Rows</div>
          <div class="is-values">Σ Values</div>
        </div>
        <p><strong>Build the pivot from the field list.</strong></p>
        <p>Tick a field, or drag it into Rows, Columns, Values or Filters. For example: a party in Rows, a date in Columns, an amount in Values.</p>
        <button v-if="!showPane" type="button" @click="showPane = true">Show fields</button>
      </div>
      <template v-else>
        <div v-if="!layout.values.length" class="desk-pivot-hint">Add a field to Values to see figures.</div>
        <div v-if="view.hiddenColumns" class="desk-pivot-hint">
          {{ view.hiddenColumns }} column items are not shown. Collapse a column field, filter it, or move it to Rows.
        </div>
        <PivotTable
          ref="table"
          :view="view"
          :cube="cube"
          :layout="layout"
          :fields="byId"
          :value-labels="valueLabels"
          :row-field-labels="rowFieldLabels"
          :column-field-labels="columnFieldLabels"
          @toggle-row="toggleRow"
          @toggle-col="toggleCol"
          @drill="drill"
          @field="openFilterAt($event.area, $event.index, $event.anchor)"
          @widths="set({ widths: $event })"
          @matches="matchInfo = $event"
        />
      </template>
    </div>

    <PivotFieldPane
      v-if="showPane"
      :fields="allFields"
      :layout="layout"
      @update:layout="change"
      @filter="openFilterAt($event.area, $event.index, $event.anchor)"
      @calc="openCalc"
      @close="showPane = false"
    />
    <PivotCalcEditor v-model:open="calcOpen" :fields="allFields" :facts="facts" :grouped="groupedKeys" :calc="calcEditing" :taken="calcIds" @save="saveCalc" @remove="removeCalc" />

    <PivotFieldFilter
      v-if="filter && filterItem"
      :key="`${filter.area}:${filter.index}`"
      :title="pivotAxisLabel(filterItem, byId.get(filterItem.field))"
      :items="filterKeys"
      :exclude="filterItem.exclude ?? []"
      :anchor="filter.anchor"
      :sortable="filter.area !== 'filters'"
      :sort="filterItem.sort"
      :label="filterItem.label"
      :show-values="filter.area !== 'filters'"
      :value-filters="filterItem.valueFilters"
      :top="filterItem.top"
      :highlighted="filterHighlighted"
      :values="valueChoices"
      :others="popupOthers"
      :other-name="filter.area === 'rows' ? 'column' : 'row'"
      @apply="applyFilter"
      @sort="applySort"
      @close="filter = null"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue';
import { useDeskAutomationNode } from '../automation/registry';
import { pivotOps, pivotReadout } from './pivotAutomation';
import { readDeskPrefOrLocal, writeDeskPref } from '../storage/deskPrefs';
import type { PopupAnchor } from '../menu/placePopup';
import { formatDeskDecimal } from '../currency/money';
import PivotCalcEditor from './PivotCalcEditor.vue';
import { pivotCalcAsField, type PivotCalcField } from './pivotCalc';
import PivotChart from './PivotChart.vue';
import { buildPivotCube, pivotItemKeys, type PivotNode } from './pivotCube';
import { exportPivotXlsx } from './pivotExport';
import PivotFieldFilter, { type PivotFilterApply } from './PivotFieldFilter.vue';
import PivotFieldPane from './PivotFieldPane.vue';
import { pivotFilterSummary, pivotItemFiltered } from './pivotFilters';
import { clonePivotLayout, defaultPivotLayout, normalizePivotLayout, pivotAxisLabel, pivotSwapAxes, pivotValueKey, pivotValueLabel, type PivotAxisArea } from './pivotLayout';
import PivotTable from './PivotTable.vue';
import type { PivotAxisItem, PivotChartType, PivotField, PivotLayout, PivotSort } from './pivotTypes';
import { buildPivotView } from './pivotView';
import './desk-pivot.css';

/**
 * An Excel-style pivot over plain rows: a field list with Filters, Columns, Rows and Values
 * areas, and a table with expandable groups, subtotals, totals, shares, a colour scale, a chart
 * and a spreadsheet export. Double-click (or Enter on) a figure to drill to its rows.
 * The layout is saved per `storageKey` as it changes.
 */
const props = withDefaults(
  defineProps<{
    fields: PivotField[];
    facts: readonly Record<string, unknown>[];
    storageKey: string;
    /** Fields of the starting layout. Without it: the first text field down, the first number summed. */
    defaults?: { rows?: string[]; columns?: string[]; values?: string[] } | undefined;
    fileName?: string | undefined;
    /** First month of the financial year for FY and quarter grouping. */
    fyStartMonth?: number | undefined;
    /** The starting layout, such as a saved pivot's; Reset goes back to it. Without it: `defaults`. */
    start?: PivotLayout | undefined;
    /** Keep the user's changes per `storageKey` and open with them. Off: always open with `start`. */
    remember?: boolean | undefined;
    /** The facts are grouped rows of a summary run with these key columns (`PivotCubeOptions.grouped`). */
    grouped?: readonly string[] | undefined;
    /** Name in the automation tree. */
    name?: string | undefined;
  }>(),
  { fileName: 'pivot', fyStartMonth: 4, remember: true },
);
const rootEl = ref<HTMLElement | null>(null);
const emit = defineEmits<{
  drill: [payload: { facts: Record<string, unknown>[]; title: string }];
  /** The layout on screen, at first and after every change: the page loads the fields it uses. */
  layout: [layout: PivotLayout];
}>();

/** The page's fields and the layout's calculated fields. */
const allFields = computed(() => [
  ...props.fields,
  ...(layout.value.calculated ?? []).map((calc) => pivotCalcAsField(calc, (value, kind) => (kind === 'percent' ? `${formatDeskDecimal(value, 2)}%` : formatDeskDecimal(value, 2)))),
]);
const byId = computed(() => new Map(allFields.value.map((field) => [field.id, field])));
const startLayout = () => (props.start ? clonePivotLayout(props.start) : defaultPivotLayout(props.fields, props.defaults ?? {}));
const layout = ref<PivotLayout>(startLayout());
const history = ref<PivotLayout[]>([]);
const collapsedRows = shallowRef(new Set<string>());
const collapsedCols = shallowRef(new Set<string>());
const showPane = ref(true);
const chartType = ref<PivotChartType | 'off'>('off');
const chartKind = computed<PivotChartType | null>(() => (chartType.value === 'off' ? null : chartType.value));
const fyStart = computed(() => props.fyStartMonth ?? 4);
let touched = false;

const prefKey = computed(() => `pivot:${props.storageKey}`);

function change(next: PivotLayout): void {
  history.value = [...history.value.slice(-49), clonePivotLayout(layout.value)];
  layout.value = next;
  touched = true;
  if (props.remember) void writeDeskPref(prefKey.value, { v: 2, layout: next });
}

function set(patch: Partial<PivotLayout>): void {
  change({ ...clonePivotLayout(layout.value), ...patch });
}

function undo(): void {
  const previous = history.value[history.value.length - 1];
  if (!previous) return;
  history.value = history.value.slice(0, -1);
  layout.value = previous;
  if (props.remember) void writeDeskPref(prefKey.value, { v: 2, layout: previous });
}

function reset(): void {
  change(startLayout());
  collapsedRows.value = new Set();
  collapsedCols.value = new Set();
}

watch(
  () => props.storageKey,
  () => {
    touched = false;
    layout.value = startLayout();
    history.value = [];
    if (!props.remember) return;
    void readDeskPrefOrLocal<unknown>(prefKey.value, props.storageKey).then((saved) => {
      const restored = normalizePivotLayout(saved, props.fields);
      if (restored && !touched) layout.value = restored;
    });
  },
  { immediate: true },
);

watch(layout, (next) => emit('layout', next), { immediate: true });

// Calculated fields: written in their editor, kept in the layout.
const calcOpen = ref(false);
const calcEditing = ref<PivotCalcField | null>(null);
const calcIds = computed(() => (layout.value.calculated ?? []).map((calc) => calc.id));

function openCalc(id: string | null): void {
  calcEditing.value = id ? (layout.value.calculated?.find((calc) => calc.id === id) ?? null) : null;
  calcOpen.value = true;
}

/** A new field goes straight to Values; a changed one keeps its place. */
function saveCalc(calc: PivotCalcField): void {
  const next = clonePivotLayout(layout.value);
  const list = next.calculated ?? [];
  const at = list.findIndex((item) => item.id === calc.id);
  if (at >= 0) list[at] = calc;
  else {
    list.push(calc);
    next.values.push({ field: calc.id, aggregate: 'sum' });
  }
  next.calculated = list;
  change(next);
}

function removeCalc(id: string): void {
  const next = clonePivotLayout(layout.value);
  next.calculated = (next.calculated ?? []).filter((calc) => calc.id !== id);
  next.values = next.values.filter((item) => item.field !== id);
  if (!next.calculated.length) delete next.calculated;
  change(next);
}

const groupedKeys = computed(() => (props.grouped ? new Set(props.grouped) : undefined));
const cube = computed(() => buildPivotCube(props.facts, layout.value, byId.value, { fyStartMonth: fyStart.value, grouped: groupedKeys.value }));
const valueLabels = computed(() => layout.value.values.map((item) => pivotValueLabel(item, byId.value.get(item.field))));
const rowFieldLabels = computed(() => layout.value.rows.map((item) => pivotAxisLabel(item, byId.value.get(item.field))));
const columnFieldLabels = computed(() => layout.value.columns.map((item) => pivotAxisLabel(item, byId.value.get(item.field))));
const view = computed(() => buildPivotView(cube.value, layout.value, collapsedRows.value, collapsedCols.value, { valueLabels: valueLabels.value }));

const count = (n: number) => n.toLocaleString();
const status = computed(() => {
  const all = groupedKeys.value ? props.facts.reduce((total, fact) => total + (Number(fact.__rows) || 0), 0) : props.facts.length;
  const kept = cube.value.rowCount;
  const source = kept === all ? `${count(all)} rows` : `${count(kept)} of ${count(all)} rows`;
  const stats = cube.value.filterStats.map((stat) => `${byId.value.get(stat.field)?.label ?? stat.field}: ${count(stat.kept)} of ${count(stat.total)}`);
  return `${source} → ${count(view.value.rows.length)} lines × ${count(view.value.columns.length)} figures${stats.length ? ` · ${stats.join(' · ')}` : ''}`;
});

// Expand and collapse.
function toggle(target: typeof collapsedRows, id: string): void {
  const next = new Set(target.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  target.value = next;
}

const toggleRow = (id: string) => toggle(collapsedRows, id);
const toggleCol = (id: string) => toggle(collapsedCols, id);

function parents(root: PivotNode, minDepth: number): Set<string> {
  const out = new Set<string>();
  const walk = (node: PivotNode) => {
    if (!node.children.length) return;
    if (node.depth >= minDepth) out.add(node.id);
    node.children.forEach(walk);
  };
  root.children.forEach(walk);
  return out;
}

function expandAll(): void {
  collapsedRows.value = new Set();
  collapsedCols.value = new Set();
}

function collapseAll(): void {
  collapsedRows.value = parents(cube.value.rowRoot, 1);
  collapsedCols.value = parents(cube.value.colRoot, 1);
}

/** Rows open down to the given field level. */
function showLevel(level: number): void {
  collapsedRows.value = parents(cube.value.rowRoot, level);
}

// Item filters and sort, from a chip, the filter bar or a header button.
const filter = ref<{ area: PivotAxisArea; index: number; anchor: PopupAnchor } | null>(null);
const filterItem = computed<PivotAxisItem | null>(() => (filter.value ? (layout.value[filter.value.area][filter.value.index] ?? null) : null));
const filterKeys = computed(() => (filterItem.value ? pivotItemKeys(props.facts, filterItem.value, byId.value.get(filterItem.value.field), fyStart.value, Boolean(groupedKeys.value)) : []));

function openFilterAt(area: PivotAxisArea, index: number, anchor: PopupAnchor): void {
  filter.value = { area, index, anchor };
}

function openFilter(area: PivotAxisArea, index: number, event: MouseEvent): void {
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
  openFilterAt(area, index, { left: box.left, top: box.top, bottom: box.bottom });
}

function patchItem(patch: (item: PivotAxisItem) => void): void {
  const at = filter.value;
  if (!at) return;
  const next = clonePivotLayout(layout.value);
  const item = next[at.area][at.index];
  if (!item) return;
  patch(item);
  change(next);
}

function applyFilter(payload: PivotFilterApply): void {
  const at = filter.value;
  const next = at ? clonePivotLayout(layout.value) : null;
  const item = at && next ? next[at.area][at.index] : undefined;
  if (!at || !next || !item) return;
  const before = item.valueFilters?.[0];
  if (payload.exclude.length) item.exclude = payload.exclude;
  else delete item.exclude;
  if (payload.label) item.label = payload.label;
  else delete item.label;
  if (payload.valueFilters.length) item.valueFilters = payload.valueFilters;
  else delete item.valueFilters;
  if (payload.top) item.top = payload.top;
  else delete item.top;
  // Highlight follows the first value condition: its test goes on that value, or comes off it.
  const first = payload.valueFilters[0];
  const target = next.values.find((value) => pivotValueKey(value) === (first ?? before)?.value);
  if (target) {
    if (payload.highlight && first) {
      const { op, a, b, abs } = first;
      target.highlight = { op, ...(a === undefined ? {} : { a }), ...(b === undefined ? {} : { b }), ...(abs ? { abs } : {}) };
    } else delete target.highlight;
  }
  change(next);
  filter.value = null;
}

const valueChoices = computed(() => layout.value.values.map((item, index) => ({ key: pivotValueKey(item), label: valueLabels.value[index] ?? item.field })));
const filterHighlighted = computed(() => {
  const key = filterItem.value?.valueFilters?.[0]?.value;
  return key !== undefined && layout.value.values.some((item) => pivotValueKey(item) === key && item.highlight);
});

// The rules on Rows, Columns and Filters fields, as text with a Clear button each.
const activeRules = computed(() => {
  const labels = new Map(layout.value.values.map((item, index) => [pivotValueKey(item), valueLabels.value[index] ?? item.field]));
  const out: { area: PivotAxisArea; index: number; name: string; text: string[] }[] = [];
  for (const area of ['rows', 'columns', 'filters'] as const) {
    layout.value[area].forEach((item, index) => {
      const text = pivotFilterSummary(item, (key) => labels.get(key) ?? key, area === 'rows' ? 'column' : 'row');
      if (text.length) out.push({ area, index, name: pivotAxisLabel(item, byId.value.get(item.field)), text });
    });
  }
  return out;
});

function clearRules(area: PivotAxisArea, index: number): void {
  const next = clonePivotLayout(layout.value);
  const item = next[area][index];
  if (!item) return;
  const key = item.valueFilters?.[0]?.value;
  for (const value of next.values) if (pivotValueKey(value) === key) delete value.highlight;
  delete item.label;
  delete item.valueFilters;
  delete item.top;
  change(next);
}

const table = ref<{ nextMatch: () => void; prevMatch: () => void } | null>(null);
const matchInfo = ref({ count: 0, at: 0 });
const highlighting = computed(() => layout.value.values.some((item) => item.highlight));
// The popup's "only chosen" list: built once per cube, not on every draw.
const popupOthers = computed(() => (filter.value && filter.value.area !== 'filters' ? cube.value.otherLeaves(filter.value.area) : []));

function applySort(sort: PivotSort): void {
  patchItem((item) => (item.sort = sort));
}

function filterSummary(item: PivotAxisItem): string {
  const out = item.exclude?.length ?? 0;
  if (!out) {
    const rules = pivotFilterSummary(item, (key) => key, 'row');
    return rules.length ? rules.join(' and ') : 'All';
  }
  const keys = pivotItemKeys(props.facts, item, byId.value.get(item.field), fyStart.value, Boolean(groupedKeys.value));
  const kept = keys.filter((key) => !item.exclude!.includes(key.key));
  if (kept.length === 1) return kept[0]!.label;
  return `${kept.length} of ${keys.length}`;
}

// Drill: the rows behind a figure, named by the items it sits on.
function drill(row: PivotNode, col: PivotNode): void {
  const names: string[] = [];
  const name = (node: PivotNode, items: PivotAxisItem[]) => {
    const path: PivotNode[] = [];
    for (let at: PivotNode | null = node; at && at.depth > 0; at = at.parent) path.unshift(at);
    path.forEach((step, index) => {
      const item = items[index];
      if (item) names.push(`${pivotAxisLabel(item, byId.value.get(item.field))}: ${step.label}`);
    });
  };
  name(row, layout.value.rows);
  name(col, layout.value.columns);
  emit('drill', { facts: cube.value.factsAt(row, col), title: names.join(' · ') || 'All rows' });
}

function exportXlsx(): void {
  exportPivotXlsx(view.value, cube.value, layout.value, { rowFields: rowFieldLabels.value, corner: valueLabels.value.length === 1 ? (valueLabels.value[0] ?? '') : 'Values' }, props.fileName ?? 'pivot');
}

const automationApi = {
  fields: () => allFields.value,
  layout: () => layout.value,
  change,
  undo,
  reset,
  view: () => view.value,
  cube: () => cube.value,
  valueLabels: () => valueLabels.value,
  status: () => status.value,
  expandAll,
  collapseAll,
  showLevel,
  toggleRow,
  toggleCol,
  setChart: (type: PivotChartType | 'off') => {
    chartType.value = type;
  },
  chart: () => chartType.value,
  drill,
  exportXlsx,
  historyLength: () => history.value.length,
};

useDeskAutomationNode({
  kind: 'pivot',
  name: () => props.name ?? props.storageKey,
  el: () => rootEl.value,
  read: (options) => pivotReadout(automationApi, options?.rows),
  brief: () => ({ layout: JSON.stringify(layout.value), status: status.value, chart: chartType.value }),
  ops: () => pivotOps(automationApi),
});

function onKey(event: KeyboardEvent): void {
  const target = event.target;
  const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
  if (!typing && (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z' && history.value.length) {
    event.preventDefault();
    undo();
  }
}
</script>
