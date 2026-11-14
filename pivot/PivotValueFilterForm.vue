<template>
  <div class="desk-pivot-vf" data-desk-field="pivot-value-filter">
    <div v-if="!values.length" class="desk-pivot-popup-more">Add a field to Values to filter by its figures.</div>
    <template v-else>
      <div v-for="(filter, index) in filters" :key="index" class="desk-pivot-vf-row">
        <div class="desk-pivot-vf-line">
          <select v-if="values.length > 1" :value="filter.value" aria-label="Value" @change="patch(index, { value: text($event) })">
            <option v-for="value in values" :key="value.key" :value="value.key">{{ value.label }}</option>
          </select>
          <span v-else class="desk-pivot-vf-name" :title="values[0]?.label ?? ''">{{ values[0]?.label }}</span>
          <button type="button" class="desk-pivot-vf-remove" title="Remove this condition" @click="remove(index)">×</button>
        </div>
        <div class="desk-pivot-vf-line">
          <select :value="filter.op" aria-label="Condition" @change="patch(index, { op: text($event) as PivotCompare })">
            <option v-for="entry in PIVOT_COMPARES" :key="entry.id" :value="entry.id">{{ entry.label }}</option>
          </select>
          <template v-if="needsNumber(filter)">
            <input type="number" step="any" :value="filter.a" aria-label="Number" @input="patch(index, { a: number($event) })" />
            <template v-if="isRange(filter)">
              <span>and</span>
              <input type="number" step="any" :value="filter.b" aria-label="Second number" @input="patch(index, { b: number($event) })" />
            </template>
          </template>
        </div>
        <div class="desk-pivot-vf-line">
          <label v-if="needsNumber(filter)" class="desk-pivot-vf-check"><input type="checkbox" :checked="Boolean(filter.abs)" @change="patch(index, { abs: checked($event) })" /> Ignore sign</label>
        </div>
        <div class="desk-pivot-vf-line">
          <select :value="filter.of" aria-label="Of" @change="patch(index, { of: text($event) as PivotValueFilter['of'] })">
            <option value="total">in the {{ otherName }} total</option>
            <option value="cells">across the {{ otherName }}s</option>
          </select>
          <select v-if="filter.of === 'cells'" :value="filter.match ?? 'any'" aria-label="How many cells" @change="patch(index, { match: text($event) as PivotValueFilter['match'] })">
            <option v-for="entry in PIVOT_MATCHES" :key="entry.id" :value="entry.id">{{ entry.label }}</option>
          </select>
          <input v-if="filter.of === 'cells' && filter.match === 'atLeast'" type="number" min="1" :value="filter.n ?? 1" aria-label="How many" @input="patch(index, { n: number($event) })" />
        </div>
        <div v-if="filter.of === 'cells'" class="desk-pivot-vf-line">
          <label class="desk-pivot-vf-check">
            <input type="checkbox" :checked="chosenOpen.has(index)" @change="toggleChosen(index, checked($event))" />
            Only chosen {{ otherName }}s<span v-if="filter.among?.length"> ({{ filter.among.length }})</span>
          </label>
        </div>
        <div v-if="filter.of === 'cells' && chosenOpen.has(index)" class="desk-pivot-vf-chosen">
          <input v-model="search" class="desk-pivot-popup-search" type="search" :placeholder="`Search ${otherName}s`" />
          <div class="desk-pivot-popup-list">
            <label v-for="leaf in found" :key="leaf.id" class="desk-pivot-popup-item">
              <input type="checkbox" :checked="filter.among?.includes(leaf.id) ?? false" @change="pick(index, leaf.id, checked($event))" />
              <span class="desk-pivot-popup-label" :title="leaf.path.join(' / ')">{{ leaf.path.join(' / ') }}</span>
            </label>
            <div v-if="found.length >= LISTED" class="desk-pivot-popup-more">Type to narrow</div>
            <div v-if="!found.length" class="desk-pivot-popup-more">Nothing matches</div>
          </div>
        </div>
      </div>
      <button type="button" class="desk-pivot-vf-add" @click="add">{{ filters.length ? '+ And another condition' : '+ Add a condition' }}</button>

      <div class="desk-pivot-vf-row">
        <label class="desk-pivot-vf-check"><input type="checkbox" :checked="top !== null" @change="toggleTop(checked($event))" /> Top or bottom items</label>
        <template v-if="top">
          <div class="desk-pivot-vf-line">
            <select :value="top.dir" aria-label="Direction" @change="setTop({ dir: text($event) as PivotTopFilter['dir'] })">
              <option value="top">Top</option>
              <option value="bottom">Bottom</option>
            </select>
            <input type="number" min="1" :value="top.n" aria-label="How many" @input="setTop({ n: number($event) ?? 1 })" />
            <select :value="top.by" aria-label="Counted as" @change="setTop({ by: text($event) as PivotTopFilter['by'] })">
              <option value="items">items</option>
              <option value="percent">% of items</option>
              <option value="share">% of the total</option>
            </select>
          </div>
          <div v-if="values.length > 1" class="desk-pivot-vf-line">
            <select :value="top.value" aria-label="Ranked by" @change="setTop({ value: text($event) })">
              <option v-for="value in values" :key="value.key" :value="value.key">by {{ value.label }}</option>
            </select>
          </div>
        </template>
      </div>

      <label v-if="filters.length" class="desk-pivot-vf-check">
        <input type="checkbox" :checked="highlight" data-desk-field="pivot-highlight" @change="emit('update:highlight', checked($event))" />
        Highlight the cells that match the first condition
      </label>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { PIVOT_COMPARES, PIVOT_MATCHES } from './pivotFilters';
import type { PivotCompare, PivotTopFilter, PivotValueFilter } from './pivotTypes';

/** The "Values" tab of a field's filter: conditions on figures, top or bottom items, highlighting. */
const props = defineProps<{
  filters: PivotValueFilter[];
  top: PivotTopFilter | null;
  highlight: boolean;
  /** Values on the pivot, by `pivotValueKey`. */
  values: { key: string; label: string }[];
  /** Leaf items of the other axis, for "only chosen". */
  others: { id: string; path: string[] }[];
  /** "column" when filtering rows, "row" when filtering columns. */
  otherName: string;
}>();
const emit = defineEmits<{
  'update:filters': [filters: PivotValueFilter[]];
  'update:top': [top: PivotTopFilter | null];
  'update:highlight': [on: boolean];
}>();

const LISTED = 200;
const search = ref('');
/** Conditions whose chosen-items list is open (it opens by itself when items are already chosen). */
const chosenOpen = ref(new Set<number>(props.filters.flatMap((filter, index) => (filter.among?.length ? [index] : []))));
const found = computed(() => {
  const query = search.value.trim().toLowerCase();
  const all = query ? props.others.filter((leaf) => leaf.path.join(' / ').toLowerCase().includes(query)) : props.others;
  return all.slice(0, LISTED);
});

const text = (event: Event) => (event.target as HTMLInputElement | HTMLSelectElement).value;
const checked = (event: Event) => (event.target as HTMLInputElement).checked;
function number(event: Event): number | undefined {
  const raw = (event.target as HTMLInputElement).value;
  return raw.trim() === '' || !Number.isFinite(Number(raw)) ? undefined : Number(raw);
}
const needsNumber = (filter: PivotValueFilter) => filter.op !== 'blank' && filter.op !== 'notBlank';
const isRange = (filter: PivotValueFilter) => filter.op === 'between' || filter.op === 'notBetween';

function patch(index: number, change: Partial<PivotValueFilter>): void {
  emit(
    'update:filters',
    props.filters.map((filter, at) => (at === index ? { ...filter, ...change } : filter)),
  );
}

function add(): void {
  const first = props.values[0];
  if (!first) return;
  emit('update:filters', [...props.filters, { value: first.key, of: 'cells', match: 'any', op: 'gte', a: 2 }]);
}

function remove(index: number): void {
  emit('update:filters', props.filters.filter((_filter, at) => at !== index));
  chosenOpen.value = new Set();
}

function toggleChosen(index: number, on: boolean): void {
  const next = new Set(chosenOpen.value);
  if (on) next.add(index);
  else {
    next.delete(index);
    patch(index, { among: [] });
  }
  chosenOpen.value = next;
}

function pick(index: number, id: string, on: boolean): void {
  const current = props.filters[index]?.among ?? [];
  patch(index, { among: on ? [...current, id] : current.filter((entry) => entry !== id) });
}

function toggleTop(on: boolean): void {
  const first = props.values[0];
  emit('update:top', on && first ? { value: first.key, dir: 'top', by: 'items', n: 10 } : null);
}

function setTop(change: Partial<PivotTopFilter>): void {
  if (props.top) emit('update:top', { ...props.top, ...change });
}
</script>
