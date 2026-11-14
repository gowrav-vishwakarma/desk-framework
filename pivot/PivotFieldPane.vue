<template>
  <aside class="desk-pivot-pane" aria-label="Pivot fields">
    <div class="desk-pivot-pane-head">
      <strong>Pivot fields</strong>
      <button type="button" class="desk-pivot-icon" title="Hide the field pane" @click="emit('close')">✕</button>
    </div>
    <input v-model="query" type="search" class="desk-pivot-pane-search" placeholder="Search fields" data-desk-field="pivot-field-search" />
    <div
      class="desk-pivot-fields"
      :class="{ 'is-remove': drag && drag.area !== 'list' && overList }"
      @dragover.prevent="overFields"
      @dragleave="overList = false"
      @drop.prevent="dropOnList"
    >
      <div v-if="drag && drag.area !== 'list'" class="desk-pivot-fields-remove">Drop here to take the field out</div>
      <div
        v-for="field in listed"
        :key="field.id"
        class="desk-pivot-field"
        :class="{ 'is-used': used(field.id) }"
        draggable="true"
        :title="`${field.label}: drag to an area below, or tick to add`"
        @dragstart="startField(field, $event)"
        @dragend="endDrag"
        @dblclick="toggleField(field)"
      >
        <input type="checkbox" :checked="used(field.id)" :data-desk-field="`pivot-field:${field.id}`" @change="toggleField(field)" />
        <span class="desk-pivot-kind" :class="field.calc ? 'is-calc' : `is-${field.kind}`">{{ field.calc ? 'ƒx' : KIND[field.kind] }}</span>
        <span class="desk-pivot-field-label">{{ field.label }}</span>
        <span v-if="filteredField(field.id)" class="desk-pivot-funnel" title="Some items are filtered out">⧩</span>
        <button type="button" class="desk-pivot-icon" title="Add to an area" @click="openFieldMenu(field, $event)">▾</button>
      </div>
      <div v-if="!listed.length" class="desk-pivot-zone-empty">No field matches</div>
    </div>
    <button type="button" class="desk-pivot-calc-add" data-desk-field="pivot-calc-add" title="A formula over other fields' totals, such as GP %" @click="emit('calc', null)">
      ƒx Calculated field…
    </button>
    <div class="desk-pivot-pane-hint">Drag fields between the areas below</div>
    <div class="desk-pivot-zones">
      <section
        v-for="zone in PIVOT_AREAS"
        :key="zone.id"
        class="desk-pivot-zone"
        :data-desk-pivot-well="zone.id"
        :class="[`is-${zone.id}`, { 'is-over': over?.area === zone.id }]"
        @dragover.prevent="overZone(zone.id, $event)"
        @dragleave="leaveZone(zone.id, $event)"
        @drop.prevent="dropOnZone(zone.id)"
      >
        <header class="desk-pivot-zone-head">
          <span class="desk-pivot-zone-icon" aria-hidden="true">{{ ZONE_ICON[zone.id] }}</span>{{ zone.label }}
        </header>
        <div class="desk-pivot-zone-list">
          <template v-for="(item, index) in itemsOf(zone.id)" :key="`${zone.id}:${item.field}:${index}`">
            <div v-if="over?.area === zone.id && over.index === index" class="desk-pivot-drop-line" />
            <div
              class="desk-pivot-chip"
              :class="{ 'is-dragging': drag?.area === zone.id && drag.index === index }"
              draggable="true"
              tabindex="0"
              :data-desk-field="`pivot-chip:${zone.id}:${index}`"
              :title="`${chipLabel(zone.id, index)}: drag to move, click for options`"
              @dragstart="startChip(zone.id, index, $event)"
              @dragend="endDrag"
              @dragover.prevent.stop="overChip(zone.id, index, $event)"
              @drop.prevent.stop="dropOnZone(zone.id)"
              @click="openChipMenu(zone.id, index, $event)"
              @keydown="chipKey(zone.id, index, $event)"
            >
              <span class="desk-pivot-chip-label">{{ chipLabel(zone.id, index) }}</span>
              <span v-if="zone.id !== 'values' && pivotItemFiltered(item as PivotAxisItem)" class="desk-pivot-funnel" title="Some items are filtered out">⧩</span>
              <span v-if="zone.id === 'values' && (item as PivotValueItem).heat" class="desk-pivot-funnel" title="Colour scale">▦</span>
              <span class="desk-pivot-chip-caret" aria-hidden="true">▾</span>
            </div>
          </template>
          <div v-if="over?.area === zone.id && over.index >= itemsOf(zone.id).length" class="desk-pivot-drop-line" />
          <div v-if="!itemsOf(zone.id).length" class="desk-pivot-zone-empty">{{ ZONE_EMPTY[zone.id] }}</div>
        </div>
      </section>
    </div>
    <DeskContextMenu v-if="menu.state.value" :menu="menu.state.value.menu" :x="menu.state.value.x" :y="menu.state.value.y" @close="menu.close" />
  </aside>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { PopupAnchor } from '../menu/placePopup';
import DeskContextMenu from '../menu/DeskContextMenu.vue';
import { pivotClearFilters, pivotItemFiltered } from './pivotFilters';
import { useDeskContextMenu, type DeskFieldMenu, type DeskMenuGroup } from '../menu/fieldMenu';
import {
  pivotAddField,
  pivotAreaOf,
  pivotAxisLabel,
  pivotDefaultArea,
  pivotMoveItem,
  pivotRemoveField,
  pivotRemoveItem,
  pivotUsesField,
  pivotValueLabel,
} from './pivotLayout';
import {
  PIVOT_AGGREGATES,
  PIVOT_AREAS,
  PIVOT_DATE_GROUPS,
  PIVOT_SHOW_AS,
  PIVOT_SORTS,
  type PivotArea,
  type PivotAxisItem,
  type PivotField,
  type PivotLayout,
  type PivotValueItem,
} from './pivotTypes';

/** Excel's field list: tick or drag fields into Filters, Columns, Rows and Values. */
const props = defineProps<{ fields: PivotField[]; layout: PivotLayout }>();
const emit = defineEmits<{
  'update:layout': [layout: PivotLayout];
  /** Open the item filter of an axis field. */
  filter: [payload: { area: Exclude<PivotArea, 'values'>; index: number; anchor: PopupAnchor }];
  /** Write a new calculated field (null) or change one (its id). */
  calc: [id: string | null];
  close: [];
}>();

const KIND = { text: 'Abc', number: '123', date: 'Date' } as const;
const ZONE_ICON: Record<PivotArea, string> = { filters: '⧩', columns: '⫼', rows: '☰', values: 'Σ' };
const ZONE_EMPTY: Record<PivotArea, string> = {
  filters: 'Filter the whole pivot',
  columns: 'Items across the top',
  rows: 'Items down the side',
  values: 'Figures to total',
};

const byId = computed(() => new Map(props.fields.map((field) => [field.id, field])));
const query = ref('');
const listed = computed(() => {
  const text = query.value.trim().toLowerCase();
  return text ? props.fields.filter((field) => field.label.toLowerCase().includes(text)) : props.fields;
});

const used = (id: string) => pivotUsesField(props.layout, id);
const filteredField = (id: string) => (['rows', 'columns', 'filters'] as const).some((area) => props.layout[area].some((item) => item.field === id && pivotItemFiltered(item)));

function itemsOf(area: PivotArea): (PivotAxisItem | PivotValueItem)[] {
  return area === 'values' ? props.layout.values : props.layout[area];
}

function chipLabel(area: PivotArea, index: number): string {
  if (area === 'values') {
    const item = props.layout.values[index];
    return item ? pivotValueLabel(item, byId.value.get(item.field)) : '';
  }
  const item = props.layout[area][index];
  return item ? pivotAxisLabel(item, byId.value.get(item.field)) : '';
}

const change = (layout: PivotLayout) => emit('update:layout', layout);

function toggleField(field: PivotField): void {
  if (used(field.id)) change(pivotRemoveField(props.layout, field.id));
  else change(pivotAddField(props.layout, field, pivotDefaultArea(field)));
}

// Drag and drop. One drag at a time: from the field list or from an area chip.
const drag = ref<{ area: PivotArea | 'list'; index: number; field: string } | null>(null);
const over = ref<{ area: PivotArea; index: number } | null>(null);
const overList = ref(false);

function startField(field: PivotField, event: DragEvent): void {
  drag.value = { area: 'list', index: -1, field: field.id };
  event.dataTransfer?.setData('text/plain', field.label);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copyMove';
}

function startChip(area: PivotArea, index: number, event: DragEvent): void {
  const item = itemsOf(area)[index];
  if (!item) return;
  drag.value = { area, index, field: item.field };
  event.dataTransfer?.setData('text/plain', chipLabel(area, index));
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
}

function endDrag(): void {
  drag.value = null;
  over.value = null;
  overList.value = false;
}

function overZone(area: PivotArea, event: DragEvent): void {
  if (!drag.value) return;
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  // Over the empty part of a zone: drop at its end.
  if (over.value?.area !== area) over.value = { area, index: itemsOf(area).length };
}

/** Over a chip: before it in its top half, after it in its bottom half. */
function overChip(area: PivotArea, index: number, event: DragEvent): void {
  if (!drag.value) return;
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
  over.value = { area, index: event.clientY > box.top + box.height / 2 ? index + 1 : index };
}

function leaveZone(area: PivotArea, event: DragEvent): void {
  const next = event.relatedTarget;
  if (next instanceof Node && (event.currentTarget as HTMLElement).contains(next)) return;
  if (over.value?.area === area) over.value = null;
}

function dropOnZone(area: PivotArea): void {
  const source = drag.value;
  const target = over.value ?? { area, index: itemsOf(area).length };
  endDrag();
  if (!source) return;
  if (source.area === 'list') {
    const field = byId.value.get(source.field);
    if (field) change(pivotAddField(props.layout, field, target.area, target.index));
    return;
  }
  change(pivotMoveItem(props.layout, { area: source.area, index: source.index }, target, byId.value));
}

function overFields(event: DragEvent): void {
  if (!drag.value || drag.value.area === 'list') return;
  overList.value = true;
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
}

function dropOnList(): void {
  const source = drag.value;
  endDrag();
  if (source && source.area !== 'list') change(pivotRemoveItem(props.layout, source.area, source.index));
}

// Menus: one for a field in the list, one for a chip.
let pending: DeskFieldMenu | null = null;
const menu = useDeskContextMenu(() => pending);

function openAtTarget(event: Event, build: DeskFieldMenu): void {
  pending = build;
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
  menu.openAt(box.left, box.bottom + 2);
}

function openFieldMenu(field: PivotField, event: MouseEvent): void {
  event.stopPropagation();
  const current = pivotAreaOf(props.layout, field.id);
  if (field.calc) {
    // A calculated field goes to Values only; its formula is changed in its editor.
    const inValues = props.layout.values.some((item) => item.field === field.id);
    openAtTarget(event, {
      groups: () => [
        { id: 'add', label: field.label, mode: 'action', items: [{ id: 'values', label: inValues ? 'In Values' : 'Add to Values', disabled: inValues }] },
        { id: 'edit', mode: 'action', items: [{ id: 'edit', label: 'Edit formula…' }] },
        { id: 'remove', mode: 'action', items: [{ id: 'remove', label: 'Take out of Values', disabled: !inValues }] },
      ],
      choose: (group) => {
        if (group === 'edit') emit('calc', field.id);
        else if (group === 'remove') change(pivotRemoveField(props.layout, field.id));
        else change(pivotAddField(props.layout, field, 'values'));
      },
    });
    return;
  }
  openAtTarget(event, {
    groups: () => [
      {
        id: 'add',
        label: field.label,
        mode: 'action',
        items: PIVOT_AREAS.map((area) => ({
          id: area.id,
          label: area.id === 'values' ? `Add to Values (${field.kind === 'number' ? 'sum' : 'count'})` : current === area.id ? `In ${area.label}` : `Add to ${area.label}`,
          disabled: current === area.id,
        })),
      },
      { id: 'remove', mode: 'action', items: [{ id: 'remove', label: 'Take out of every area', disabled: !used(field.id) }] },
    ],
    choose: (group, id) => {
      if (group === 'remove') change(pivotRemoveField(props.layout, field.id));
      else change(pivotAddField(props.layout, field, id as PivotArea));
    },
  });
}

function move(area: PivotArea, index: number, to: number): void {
  if (to < 0 || to >= itemsOf(area).length || to === index) return;
  change(pivotMoveItem(props.layout, { area, index }, { area, index: to > index ? to + 1 : to }, byId.value));
}

function chipMenu(area: PivotArea, index: number): DeskFieldMenu {
  const count = itemsOf(area).length;
  const item = itemsOf(area)[index];
  const field = item ? byId.value.get(item.field) : undefined;
  return {
    groups: () => {
      const groups: DeskMenuGroup[] = [
        {
          id: 'order',
          label: chipLabel(area, index),
          mode: 'action',
          items: [
            { id: 'up', label: 'Move up', disabled: index === 0 },
            { id: 'down', label: 'Move down', disabled: index >= count - 1 },
            { id: 'first', label: 'Move to beginning', disabled: index === 0 },
            { id: 'last', label: 'Move to end', disabled: index >= count - 1 },
          ],
        },
      ];
      if (area === 'values' && field?.calc) {
        // Its formula decides the figure: no "summarise by".
        const value = props.layout.values[index];
        groups.push(
          { id: 'edit', mode: 'action', items: [{ id: 'edit', label: 'Edit formula…' }] },
          {
            id: 'showAs',
            label: 'Show values as',
            mode: 'radio',
            items: PIVOT_SHOW_AS.map((entry) => ({ id: entry.id, label: entry.label, checked: (value?.showAs ?? 'value') === entry.id })),
          },
          { id: 'heat', mode: 'check', items: [{ id: 'heat', label: 'Colour scale', checked: Boolean(value?.heat) }] },
        );
      } else if (area === 'values') {
        const value = props.layout.values[index];
        const numeric = field?.kind === 'number';
        groups.push(
          {
            id: 'aggregate',
            label: 'Summarise by',
            mode: 'radio',
            items: PIVOT_AGGREGATES.filter((entry) => numeric || entry.id === 'count' || entry.id === 'distinct').map((entry) => ({
              id: entry.id,
              label: entry.label,
              checked: value?.aggregate === entry.id,
            })),
          },
          {
            id: 'showAs',
            label: 'Show values as',
            mode: 'radio',
            items: PIVOT_SHOW_AS.map((entry) => ({ id: entry.id, label: entry.label, checked: (value?.showAs ?? 'value') === entry.id })),
          },
          { id: 'heat', mode: 'check', items: [{ id: 'heat', label: 'Colour scale', checked: Boolean(value?.heat) }] },
        );
      } else {
        const axis = props.layout[area][index];
        if (field?.kind === 'date') {
          groups.push({
            id: 'dateGroup',
            label: 'Group dates by',
            mode: 'radio',
            items: PIVOT_DATE_GROUPS.map((entry) => ({ id: entry.id, label: entry.label, checked: (axis?.dateGroup ?? 'day') === entry.id })),
          });
        }
        if (area !== 'filters') {
          groups.push({
            id: 'sort',
            label: 'Sort',
            mode: 'radio',
            items: PIVOT_SORTS.map((entry) => ({ id: entry.id, label: entry.label, checked: (axis?.sort ?? 'asc') === entry.id })),
          });
        }
        groups.push({
          id: 'filter',
          mode: 'action',
          items: [
            { id: 'filter', label: 'Filter items…' },
            { id: 'clear', label: 'Clear filter', disabled: !axis || !pivotItemFiltered(axis) },
          ],
        });
      }
      groups.push(
        {
          id: 'to',
          label: 'Move to',
          mode: 'action',
          items: PIVOT_AREAS.filter((entry) => entry.id !== area).map((entry) => ({ id: entry.id, label: entry.label, disabled: field?.calc === true })),
        },
        { id: 'remove', mode: 'action', items: [{ id: 'remove', label: 'Remove field', tone: 'danger' }] },
      );
      return groups;
    },
    choose: (group, id) => {
      const next = (patch: (layout: PivotLayout) => void) => {
        const copy = JSON.parse(JSON.stringify(props.layout)) as PivotLayout;
        patch(copy);
        change(copy);
      };
      if (group === 'order') move(area, index, id === 'up' ? index - 1 : id === 'down' ? index + 1 : id === 'first' ? 0 : count - 1);
      else if (group === 'edit' && item) emit('calc', item.field);
      else if (group === 'to') change(pivotMoveItem(props.layout, { area, index }, { area: id as PivotArea }, byId.value));
      else if (group === 'remove') change(pivotRemoveItem(props.layout, area, index));
      else if (area === 'values') {
        next((layout) => {
          const value = layout.values[index];
          if (!value) return;
          if (group === 'aggregate') value.aggregate = id as PivotValueItem['aggregate'];
          if (group === 'showAs') {
            if (id === 'value') delete value.showAs;
            else value.showAs = id as PivotValueItem['showAs'];
          }
          if (group === 'heat') {
            if (value.heat) delete value.heat;
            else value.heat = true;
          }
        });
      } else if (group === 'filter') {
        if (id === 'clear') next((layout) => pivotClearFilters(layout[area][index]!));
        else emit('filter', { area, index, anchor: chipAnchor(area, index) });
      } else {
        next((layout) => {
          const axis = layout[area][index];
          if (!axis) return;
          if (group === 'dateGroup') {
            if (id === 'day') delete axis.dateGroup;
            else axis.dateGroup = id as PivotAxisItem['dateGroup'];
            // Item keys change with the grouping, so the old filters no longer fit.
            pivotClearFilters(axis);
          }
          if (group === 'sort') axis.sort = id as PivotAxisItem['sort'];
        });
      }
    },
  };
}

function chipAnchor(area: PivotArea, index: number): PopupAnchor {
  const chip = document.querySelector(`[data-desk-field="pivot-chip:${area}:${index}"]`);
  const box = chip?.getBoundingClientRect();
  return box ? { left: box.left, top: box.top, bottom: box.bottom } : { left: 200, top: 200, bottom: 200 };
}

function openChipMenu(area: PivotArea, index: number, event: Event): void {
  openAtTarget(event, chipMenu(area, index));
}

function chipKey(area: PivotArea, index: number, event: KeyboardEvent): void {
  if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
    event.preventDefault();
    move(area, index, index + (event.key === 'ArrowUp' ? -1 : 1));
  } else if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault();
    change(pivotRemoveItem(props.layout, area, index));
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    openChipMenu(area, index, event);
  }
}
</script>
