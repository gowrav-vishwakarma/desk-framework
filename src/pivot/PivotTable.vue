<template>
  <div
    ref="scroller"
    class="desk-pivot-scroll"
    tabindex="0"
    data-desk-field="pivot-table"
    role="grid"
    :aria-rowcount="view.rows.length"
    @scroll="onScroll"
    @keydown="onKey"
  >
    <table class="desk-pivot-table" :style="{ width: `${tableWidth}px` }">
      <colgroup>
        <col v-for="index in L" :key="`l${index}`" :style="{ width: `${labelWidthAt(index - 1)}px` }" />
        <col v-for="(column, index) in view.columns" :key="column.id" :style="{ width: `${widths[index]}px` }" />
      </colgroup>
      <thead>
        <!-- Excel's top row: the value name, and the column fields as buttons. -->
        <tr v-if="C > 0" class="desk-pivot-head-top">
          <th :colspan="L" class="desk-pivot-corner desk-pivot-sticky" :style="stickyLeft(0)">
            <span class="desk-pivot-corner-value">{{ V === 1 ? valueLabels[0] : V > 1 ? 'Values' : '' }}</span>
          </th>
          <th :colspan="Math.max(1, view.columns.length)" class="desk-pivot-axis-bar">
            <span class="desk-pivot-axis-name">Columns</span>
            <button
              v-for="(label, index) in columnFieldLabels"
              :key="`c${index}`"
              type="button"
              class="desk-pivot-field-button"
              :class="{ 'is-filtered': isFiltered('columns', index) }"
              :title="`Sort or filter ${label}`"
              @click="openField('columns', index, $event)"
            >
              {{ label }} <span aria-hidden="true">▾</span>
            </button>
          </th>
        </tr>
        <tr v-for="(cells, level) in headRows" :key="`h${level}`">
          <template v-if="level === 0">
            <th v-if="tabular && headRows.length > 1" :colspan="L" :rowspan="headRows.length - 1" class="desk-pivot-corner desk-pivot-sticky" :style="stickyLeft(0)" />
            <th
              v-if="!tabular"
              :rowspan="headRows.length"
              class="desk-pivot-corner desk-pivot-sticky desk-pivot-corner-rows"
              :style="stickyLeft(0)"
            >
              <ul class="desk-pivot-row-fields">
                <li v-for="(label, index) in rowFieldLabels" :key="`r${index}`" :style="{ paddingLeft: `${index * 10}px` }">
                  <button type="button" class="desk-pivot-field-button" :class="{ 'is-filtered': isFiltered('rows', index) }" :title="`Sort or filter ${label}`" @click="openField('rows', index, $event)">
                    {{ label }} <span aria-hidden="true">▾</span>
                  </button>
                </li>
                <li v-if="!rowFieldLabels.length" class="desk-pivot-muted">Rows</li>
              </ul>
              <span class="desk-pivot-resize" title="Drag to widen; double-click to fit" @pointerdown.stop.prevent="startResize({ label: 0 }, $event)" @dblclick.stop="fit({ label: 0 })" />
            </th>
          </template>
          <template v-if="tabular && level === headRows.length - 1">
            <th v-for="(label, index) in rowFieldLabels" :key="`t${index}`" class="desk-pivot-corner desk-pivot-sticky" :style="stickyLeft(index)">
              <button type="button" class="desk-pivot-field-button" :class="{ 'is-filtered': isFiltered('rows', index) }" @click="openField('rows', index, $event)">
                {{ label }} <span aria-hidden="true">▾</span>
              </button>
              <span class="desk-pivot-resize" title="Drag to widen; double-click to fit" @pointerdown.stop.prevent="startResize({ label: index }, $event)" @dblclick.stop="fit({ label: index })" />
            </th>
          </template>
          <th
            v-for="cell in cells"
            :key="cell.id"
            :colspan="cell.colspan"
            :rowspan="cell.rowspan"
            class="desk-pivot-col-head"
            :class="[`is-${cell.kind}`, { 'is-group': cell.colspan > 1 && cell.kind === 'item' }]"
            :title="cell.label"
          >
            <button v-if="cell.canToggle && cell.node" type="button" class="desk-pivot-toggle" :title="cell.expanded ? 'Collapse' : 'Expand'" @click="emit('toggleCol', cell.node.id)">
              {{ cell.expanded ? '−' : '+' }}
            </button>
            {{ cell.label }}
            <span
              v-if="leafColumn(cell, level) !== null"
              class="desk-pivot-resize"
              title="Drag to widen this value's columns; double-click to fit"
              @pointerdown.stop.prevent="startResize({ column: leafColumn(cell, level)! }, $event)"
              @dblclick.stop="fit({ column: leafColumn(cell, level)! })"
            />
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="padTop > 0" class="desk-pivot-pad" :style="{ height: `${padTop}px` }"><td :colspan="L + view.columns.length" /></tr>
        <tr
          v-for="entry in visible"
          :key="entry.row.id"
          class="desk-pivot-row"
          :class="[`is-${entry.row.kind}`, { 'is-parent': entry.row.canToggle && entry.row.expanded, 'is-active-row': active.r === entry.index }]"
        >
          <template v-if="tabular">
            <td
              v-for="level in L"
              :key="`l${level}`"
              class="desk-pivot-label desk-pivot-sticky"
              :class="{ 'is-active': active.r === entry.index && active.c === -1, 'is-repeat': level - 1 < entry.row.firstNew }"
              :style="stickyLeft(level - 1)"
              @click="select(entry.index, -1)"
              @dblclick="drill(entry.row.node, colRoot)"
            >
              <template v-if="level - 1 < entry.row.labels.length && level - 1 >= entry.row.firstNew">
                <button v-if="toggleAt(entry.row, level - 1)" type="button" class="desk-pivot-toggle" @click.stop="emit('toggleRow', toggleAt(entry.row, level - 1)!.id)">
                  {{ entry.row.kind === 'item' && level - 1 === entry.row.depth && !entry.row.expanded ? '+' : '−' }}
                </button>
                <span class="desk-pivot-text" :title="entry.row.labels[level - 1] ?? ''">{{ entry.row.labels[level - 1] }}</span>
              </template>
            </td>
          </template>
          <td
            v-else
            class="desk-pivot-label desk-pivot-sticky"
            :class="{ 'is-active': active.r === entry.index && active.c === -1 }"
            :style="{ ...stickyLeft(0), paddingLeft: `${6 + entry.row.depth * 16}px` }"
            @click="select(entry.index, -1)"
            @dblclick="drill(entry.row.node, colRoot)"
          >
            <button v-if="entry.row.canToggle" type="button" class="desk-pivot-toggle" :title="entry.row.expanded ? 'Collapse' : 'Expand'" @click.stop="emit('toggleRow', entry.row.node.id)">
              {{ entry.row.expanded ? '−' : '+' }}
            </button>
            <span v-else-if="R > 1" class="desk-pivot-toggle-space" />
            <span class="desk-pivot-text" :title="entry.row.label">{{ entry.row.label }}</span>
          </td>
          <td
            v-for="(column, c) in view.columns"
            :key="column.id"
            class="desk-pivot-num"
            :class="cellClass(entry.row, column, entry.index, c)"
            :style="heatStyle(entry.row, column)"
            @click="select(entry.index, c)"
            @dblclick="drill(entry.row.node, column.node)"
          >
            {{ entry.row.showValues ? text(entry.row, column) : '' }}
          </td>
        </tr>
        <tr v-if="padBottom > 0" class="desk-pivot-pad" :style="{ height: `${padBottom}px` }"><td :colspan="L + view.columns.length" /></tr>
      </tbody>
      <tfoot v-if="grand">
        <tr class="desk-pivot-row is-grand" :class="{ 'is-active-row': active.r === body.length }">
          <td
            :colspan="L"
            class="desk-pivot-label desk-pivot-sticky"
            :class="{ 'is-active': active.r === body.length && active.c === -1 }"
            :style="stickyLeft(0)"
            @click="select(body.length, -1)"
            @dblclick="drill(grand.node, colRoot)"
          >
            <span class="desk-pivot-text">{{ grand.label }}</span>
          </td>
          <td
            v-for="(column, c) in view.columns"
            :key="column.id"
            class="desk-pivot-num"
            :class="cellClass(grand, column, body.length, c)"
            @click="select(body.length, c)"
            @dblclick="drill(grand.node, column.node)"
          >
            {{ text(grand, column) }}
          </td>
        </tr>
      </tfoot>
    </table>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { claimDeskKey } from '../focus/useDeskFocus';
import type { PopupAnchor } from '../menu/placePopup';
import type { PivotCube, PivotNode } from './pivotCube';
import { pivotItemFiltered, pivotTest } from './pivotFilters';
import { pivotCellText } from './pivotFormat';
import { pivotValueKey } from './pivotLayout';
import type { PivotField, PivotLayout, PivotWidths } from './pivotTypes';
import type { PivotHeaderCell, PivotView, PivotViewColumn, PivotViewRow } from './pivotView';

const props = defineProps<{
  view: PivotView;
  cube: PivotCube;
  layout: PivotLayout;
  fields: ReadonlyMap<string, PivotField>;
  valueLabels: string[];
  rowFieldLabels: string[];
  columnFieldLabels: string[];
}>();
const emit = defineEmits<{
  toggleRow: [id: string];
  toggleCol: [id: string];
  drill: [row: PivotNode, col: PivotNode];
  field: [payload: { area: 'rows' | 'columns'; index: number; anchor: PopupAnchor }];
  /** Widths the user dragged or fitted, for the layout. */
  widths: [widths: PivotWidths];
  /** Cells meeting a value's highlight: how many, and which one the selection is on (1-based, 0 if none). */
  matches: [info: { count: number; at: number }];
}>();

const scroller = ref<HTMLElement | null>(null);
const L = computed(() => props.view.labelColumns);
const R = computed(() => props.layout.rows.length);
const C = computed(() => props.layout.columns.length);
const V = computed(() => props.layout.values.length);
const tabular = computed(() => L.value > 1);
const colRoot = computed(() => props.cube.colRoot);
const headRows = computed(() => (props.view.header.length ? props.view.header : [[]]));

/** The grand total row sits in the footer, always in sight. */
const grand = computed(() => {
  const last = props.view.rows[props.view.rows.length - 1];
  return last?.kind === 'grand' && R.value > 0 ? last : null;
});
const body = computed(() => (grand.value ? props.view.rows.slice(0, -1) : props.view.rows));

// Widths: what the user dragged (kept in the layout), else labels at a default and each value's
// columns wide enough for the widest figure shown (the grand total and the first rows).
type ResizeTarget = { label: number } | { column: number };
/** The width being dragged, shown at once and saved on release. */
const dragging = ref<{ target: ResizeTarget; width: number } | null>(null);
const FIT_ROWS = 300;
const MAX_FIT = 400;

const valueKeyOf = (column: PivotViewColumn) => {
  const item = props.layout.values[column.valueIndex];
  return item ? pivotValueKey(item) : '';
};

function labelWidthAt(level: number): number {
  const drag = dragging.value;
  if (drag && 'label' in drag.target && drag.target.label === level) return drag.width;
  return props.layout.widths?.labels?.[level] ?? (tabular.value ? 150 : 260);
}

/** Pixels per character of the table's font: digits are about 0.62 em. */
function charWidth(): number {
  const size = scroller.value ? Number.parseFloat(getComputedStyle(scroller.value).fontSize) : NaN;
  return (Number.isFinite(size) ? size : 13) * 0.62;
}

/** Each value's fitted width: its widest figure in the grand total and the first rows, or its header word. */
const fitted = computed(() => {
  const per = charWidth();
  const sample = [...(grand.value ? [grand.value] : []), ...body.value.slice(0, FIT_ROWS)];
  return props.view.columns.map((column) => {
    let longest = 0;
    for (const row of sample) if (row.showValues) longest = Math.max(longest, text(row, column).length);
    const header = props.view.header.flat().find((cell) => cell.node === column.node && cell.kind !== 'value')?.label ?? '';
    const word = Math.max(...header.split(/\s+/).map((part) => part.length), (props.valueLabels[column.valueIndex] ?? '').length / 2);
    return Math.round(Math.min(MAX_FIT, Math.max(80, longest * per + 24, word * per + 22)));
  });
});

const widths = computed(() =>
  props.view.columns.map((column, index) => {
    const drag = dragging.value;
    const key = valueKeyOf(column);
    if (drag && 'column' in drag.target && valueKeyOf(props.view.columns[drag.target.column]!) === key) return drag.width;
    return props.layout.widths?.values?.[key] ?? fitted.value[index] ?? 100;
  }),
);
const labelWidths = computed(() => Array.from({ length: L.value }, (_, level) => labelWidthAt(level)));
const tableWidth = computed(() => labelWidths.value.reduce((sum, width) => sum + width, 0) + widths.value.reduce((sum, width) => sum + width, 0));

function stickyLeft(level: number): Record<string, string> {
  return { left: `${labelWidths.value.slice(0, level).reduce((sum, width) => sum + width, 0)}px` };
}

/**
 * Where each header cell starts, across the merged rows; a cell that reaches the last header row
 * over one column is that column's own header, where it is resized.
 */
const headerStarts = computed(() => {
  const starts = new Map<string, number>();
  const busy: number[] = [];
  headRows.value.forEach((cells) => {
    let col = 0;
    for (const cell of cells) {
      while ((busy[col] ?? 0) > 0) col += 1;
      starts.set(cell.id, col);
      for (let i = 0; i < cell.colspan; i += 1) busy[col + i] = cell.rowspan;
      col += cell.colspan;
    }
    for (let i = 0; i < busy.length; i += 1) if (busy[i]) busy[i] = busy[i]! - 1;
  });
  return starts;
});

function leafColumn(cell: PivotHeaderCell, level: number): number | null {
  if (cell.colspan !== 1 || level + cell.rowspan !== headRows.value.length) return null;
  const start = headerStarts.value.get(cell.id);
  return start === undefined || start >= props.view.columns.length ? null : start;
}

function save(target: ResizeTarget, width: number | null): void {
  const next: PivotWidths = { labels: [...(props.layout.widths?.labels ?? [])], values: { ...(props.layout.widths?.values ?? {}) } };
  if ('label' in target) {
    while (next.labels!.length <= target.label) next.labels!.push(null);
    next.labels![target.label] = width;
  } else {
    const column = props.view.columns[target.column];
    if (!column) return;
    if (width === null) delete next.values![valueKeyOf(column)];
    else next.values![valueKeyOf(column)] = width;
  }
  emit('widths', next);
}

function startResize(target: ResizeTarget, event: PointerEvent): void {
  const startX = event.clientX;
  const start = 'label' in target ? labelWidthAt(target.label) : (widths.value[target.column] ?? 100);
  dragging.value = { target, width: start };
  const move = (next: PointerEvent) => {
    dragging.value = { target, width: Math.round(Math.min(1000, Math.max(50, start + next.clientX - startX))) };
  };
  const stop = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', stop);
    const width = dragging.value?.width ?? start;
    dragging.value = null;
    if (width !== start) save(target, width);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', stop);
}

/** Double-click: back to the width that fits. */
function fit(target: ResizeTarget): void {
  save(target, null);
}

// Only rows near the viewport are drawn; padding rows keep the scroll height.
const ROW = ref(24);
const OVERSCAN = 15;
const scrollTop = ref(0);
const height = ref(600);
const start = computed(() => Math.max(0, Math.floor(scrollTop.value / ROW.value) - OVERSCAN));
const end = computed(() => Math.min(body.value.length, start.value + Math.ceil(height.value / ROW.value) + OVERSCAN * 2));
const visible = computed(() => body.value.slice(start.value, end.value).map((row, offset) => ({ row, index: start.value + offset })));
const padTop = computed(() => start.value * ROW.value);
const padBottom = computed(() => (body.value.length - end.value) * ROW.value);

function onScroll(): void {
  scrollTop.value = scroller.value?.scrollTop ?? 0;
}

function measure(): void {
  const el = scroller.value;
  if (!el) return;
  height.value = el.clientHeight || 600;
  const row = el.querySelector<HTMLElement>('tbody tr.desk-pivot-row');
  if (row?.offsetHeight) ROW.value = row.offsetHeight;
}

onMounted(() => {
  measure();
  if (typeof ResizeObserver !== 'undefined' && scroller.value) new ResizeObserver(measure).observe(scroller.value);
});
watch(() => props.view, () => void nextTick(measure));

// Figures.
function text(row: PivotViewRow | null, column: PivotViewColumn): string {
  if (!row) return '';
  const item = props.layout.values[column.valueIndex];
  return pivotCellText(props.cube.shown(row.node, column.node, column.valueIndex), item, item ? props.fields.get(item.field) : undefined);
}

/** Per value with a colour scale: the largest and smallest item figure. */
const heat = computed(() =>
  props.layout.values.map((item, index) => {
    if (!item.heat) return null;
    let min = 0;
    let max = 0;
    for (const row of body.value) {
      if (row.kind !== 'item' || (row.canToggle && row.expanded)) continue;
      for (const column of props.view.columns) {
        if (column.valueIndex !== index || column.kind !== 'item') continue;
        const value = props.cube.shown(row.node, column.node, index) ?? 0;
        if (value < min) min = value;
        if (value > max) max = value;
      }
    }
    return { min, max };
  }),
);

function heatStyle(row: PivotViewRow, column: PivotViewColumn): Record<string, string> | undefined {
  const range = heat.value[column.valueIndex];
  if (!range || row.kind !== 'item' || column.kind !== 'item' || !row.showValues || (row.canToggle && row.expanded)) return undefined;
  const value = props.cube.shown(row.node, column.node, column.valueIndex);
  if (!value) return undefined;
  const share = value > 0 ? (range.max ? value / range.max : 0) : range.min ? value / range.min : 0;
  const tone = value > 0 ? 'var(--desk-tone-success)' : 'var(--desk-tone-danger)';
  return { background: `color-mix(in srgb, ${tone} ${Math.round(6 + share * 38)}%, transparent)` };
}

const isFiltered = (area: 'rows' | 'columns', index: number): boolean => {
  const item = props.layout[area][index];
  return item ? pivotItemFiltered(item) : false;
};

/** True for a cell its value's highlight condition marks. Drawn cells only: cheap on a huge grid. */
function isMatch(row: PivotViewRow, column: PivotViewColumn): boolean {
  const test = props.layout.values[column.valueIndex]?.highlight;
  if (!test || row.kind !== 'item' || column.kind !== 'item' || !row.showValues || (row.canToggle && row.expanded)) return false;
  return pivotTest(test, props.cube.shown(row.node, column.node, column.valueIndex));
}

// All highlighted cells in reading order, as `row * columns + column`. A scan of the whole grid, so it
// runs only once the user jumps (F3 or the arrows), never while drawing.
const wanted = ref(false);
const matchKeys = computed<number[]>(() => {
  const tests = props.layout.values.map((item) => item.highlight ?? null);
  if (!wanted.value || !tests.some(Boolean)) return [];
  const width = props.view.columns.length;
  const out: number[] = [];
  body.value.forEach((row, r) => {
    if (row.kind !== 'item' || (row.canToggle && row.expanded) || !row.showValues) return;
    props.view.columns.forEach((column, c) => {
      const test = tests[column.valueIndex];
      if (test && column.kind === 'item' && pivotTest(test, props.cube.shown(row.node, column.node, column.valueIndex))) out.push(r * width + c);
    });
  });
  return out;
});
const matchSet = computed(() => new Set(matchKeys.value));

function cellClass(row: PivotViewRow, column: PivotViewColumn, r: number, c: number): Record<string, boolean> {
  const value = row.showValues ? props.cube.shown(row.node, column.node, column.valueIndex) : null;
  return {
    'is-match': isMatch(row, column),
    [`is-col-${column.kind}`]: true,
    'is-negative': value !== null && value < 0,
    'is-zero': value === 0,
    'is-active': active.value.r === r && active.value.c === c,
  };
}

/** Tabular form: the node a label cell's toggle opens or closes. */
function toggleAt(row: PivotViewRow, level: number): PivotNode | null {
  let node: PivotNode | null = row.node;
  while (node && node.depth - 1 > level) node = node.parent;
  if (!node || node.depth - 1 !== level || !node.children.length) return null;
  // A parent's toggle shows on its first line only, and on its total line.
  if (row.kind === 'item' && level < row.depth && level < row.firstNew) return null;
  return node;
}

// Selection and keys: arrows move, Enter drills (or toggles on a label), + and − expand and collapse.
const active = ref({ r: 0, c: -1 });
const rowCount = computed(() => body.value.length + (grand.value ? 1 : 0));
const rowAt = (r: number): PivotViewRow | null => (r < body.value.length ? (body.value[r] ?? null) : grand.value);

function select(r: number, c: number): void {
  active.value = { r, c };
  scroller.value?.focus({ preventScroll: true });
}

function drill(row: PivotNode, col: PivotNode): void {
  emit('drill', row, col);
}

function openField(area: 'rows' | 'columns', index: number, event: MouseEvent): void {
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
  emit('field', { area, index, anchor: { left: box.left, top: box.top, bottom: box.bottom } });
}

function reveal(): void {
  const el = scroller.value;
  if (!el) return;
  const head = el.querySelector('thead')?.getBoundingClientRect().height ?? 0;
  const foot = el.querySelector('tfoot')?.getBoundingClientRect().height ?? 0;
  if (active.value.r < body.value.length) {
    const top = active.value.r * ROW.value;
    const room = el.clientHeight - head - foot;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + ROW.value > el.scrollTop + room) el.scrollTop = top + ROW.value - room;
  }
  // Across: the label columns stay at the left, so a figure must clear them, not just the edge.
  const c = active.value.c;
  if (c < 0) {
    el.scrollLeft = 0;
    return;
  }
  const sticky = labelWidths.value.reduce((sum, width) => sum + width, 0);
  const left = sticky + widths.value.slice(0, c).reduce((sum, width) => sum + width, 0);
  const right = left + (widths.value[c] ?? 0);
  if (left - sticky < el.scrollLeft) el.scrollLeft = left - sticky;
  else if (right > el.scrollLeft + el.clientWidth) el.scrollLeft = right - el.clientWidth;
}

function onKey(event: KeyboardEvent): void {
  if (event.target !== scroller.value) return;
  const { r, c } = active.value;
  const last = props.view.columns.length - 1;
  const page = Math.max(1, Math.floor(height.value / ROW.value) - 3);
  let next: { r: number; c: number } | null = null;
  const row = rowAt(r);
  switch (event.key) {
    case 'ArrowDown':
      next = { r: Math.min(rowCount.value - 1, r + 1), c };
      break;
    case 'ArrowUp':
      next = { r: Math.max(0, r - 1), c };
      break;
    case 'ArrowRight':
      if (c === -1 && row?.canToggle && !row.expanded && row.kind === 'item' && !event.ctrlKey) {
        emit('toggleRow', row.node.id);
        break;
      }
      next = { r, c: Math.min(last, c + 1) };
      break;
    case 'ArrowLeft':
      if (c === -1 && row?.canToggle && row.expanded) {
        emit('toggleRow', row.node.id);
        break;
      }
      next = { r, c: Math.max(-1, c - 1) };
      break;
    case 'PageDown':
      next = { r: Math.min(rowCount.value - 1, r + page), c };
      break;
    case 'PageUp':
      next = { r: Math.max(0, r - page), c };
      break;
    case 'Home':
      next = event.ctrlKey ? { r: 0, c: -1 } : { r, c: -1 };
      break;
    case 'End':
      next = event.ctrlKey ? { r: rowCount.value - 1, c: last } : { r, c: last };
      break;
    case 'F3':
      jumpMatch(event.shiftKey ? -1 : 1);
      break;
    case '+':
    case '-':
    case ' ':
      if (row?.canToggle && (event.key === ' ' || (event.key === '+') !== row.expanded)) emit('toggleRow', row.node.id);
      break;
    case 'Enter': {
      if (!row) return;
      const column = props.view.columns[c];
      if (c === -1 && row.canToggle && !event.shiftKey) emit('toggleRow', row.node.id);
      else drill(row.node, column?.node ?? colRoot.value);
      break;
    }
    default:
      return;
  }
  claimDeskKey(event);
  event.preventDefault();
  if (next) {
    active.value = next;
    reveal();
  }
}

/** Moves the selection to the next (or previous) highlighted cell, wrapping round. */
function jumpMatch(direction: 1 | -1): void {
  wanted.value = true;
  const list = matchKeys.value;
  if (!list.length) return;
  const here = active.value.r * props.view.columns.length + (active.value.c < 0 ? -0.5 : active.value.c);
  const found = direction === 1 ? list.find((key) => key > here) : [...list].reverse().find((key) => key < here);
  const key = found ?? (direction === 1 ? list[0]! : list[list.length - 1]!);
  const width = Math.max(1, props.view.columns.length);
  active.value = { r: Math.floor(key / width), c: key % width };
  reveal();
  scroller.value?.focus({ preventScroll: true });
}

watch(
  [matchKeys, active],
  () => {
    const key = active.value.r * props.view.columns.length + (active.value.c < 0 ? -0.5 : active.value.c);
    emit('matches', { count: matchKeys.value.length, at: matchSet.value.has(key) ? matchKeys.value.indexOf(key) + 1 : 0 });
  },
  { immediate: true },
);

defineExpose({ nextMatch: () => jumpMatch(1), prevMatch: () => jumpMatch(-1) });

// Keep the selection on the table after a collapse shortens it.
watch(rowCount, (count) => {
  if (active.value.r >= count) active.value = { r: Math.max(0, count - 1), c: active.value.c };
});
</script>
