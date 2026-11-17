<template>
  <Teleport to="body">
    <div ref="root" class="desk-pivot-popup" role="dialog" :aria-label="title" :style="style" @keydown="onKey">
      <div class="desk-pivot-popup-title">{{ title }}</div>
      <div v-if="sortable" class="desk-pivot-popup-sorts">
        <button
          v-for="option in PIVOT_SORTS"
          :key="option.id"
          type="button"
          :class="{ on: (sort ?? 'asc') === option.id }"
          @click="emit('sort', option.id)"
        >
          {{ option.label }}
        </button>
      </div>
      <div v-if="showValues" class="desk-pivot-popup-tabs" role="tablist">
        <button type="button" role="tab" :class="{ on: tab === 'items' }" :aria-selected="tab === 'items'" @click="tab = 'items'">Items</button>
        <button type="button" role="tab" :class="{ on: tab === 'values' }" :aria-selected="tab === 'values'" data-desk-field="pivot-filter-values-tab" @click="tab = 'values'">
          Values<span v-if="activeValueRules" class="desk-pivot-popup-dot" aria-hidden="true"> ●</span>
        </button>
      </div>
      <PivotValueFilterForm
        v-if="showValues && tab === 'values'"
        v-model:filters="draftFilters"
        v-model:top="draftTop"
        v-model:highlight="draftHighlight"
        :values="values ?? []"
        :others="others ?? []"
        :other-name="otherName ?? 'column'"
      />
      <template v-else>
      <div class="desk-pivot-popup-rule">
        <select v-model="ruleOp" aria-label="Label rule">
          <option value="">No label rule</option>
          <option v-for="entry in PIVOT_LABEL_OPS" :key="entry.id" :value="entry.id">Label {{ entry.label }}</option>
        </select>
        <input v-if="ruleOp" v-model="ruleText" type="text" placeholder="text" data-desk-field="pivot-label-rule" />
      </div>
      <input ref="search" v-model="query" class="desk-pivot-popup-search" type="search" placeholder="Search items" data-desk-field="pivot-filter-search" />
      <label class="desk-pivot-popup-all">
        <input ref="allBox" type="checkbox" :checked="allShown" @change="toggleShown" />
        {{ query ? 'Select all found' : 'Select all' }}
        <span class="desk-pivot-popup-count">{{ checked.size }} of {{ items.length }}</span>
      </label>
      <div class="desk-pivot-popup-list">
        <label v-for="item in shown" :key="item.key" class="desk-pivot-popup-item">
          <input type="checkbox" :checked="checked.has(item.key)" @change="toggle(item.key)" />
          <span class="desk-pivot-popup-label" :title="item.label">{{ item.label }}</span>
          <span class="desk-pivot-popup-count">{{ item.count }}</span>
          <button type="button" class="desk-pivot-popup-only" title="Only this item" @click.prevent="only(item.key)">only</button>
        </label>
        <div v-if="found.length > shown.length" class="desk-pivot-popup-more">{{ found.length - shown.length }} more: type to narrow</div>
        <div v-if="!found.length" class="desk-pivot-popup-more">Nothing matches</div>
      </div>
      </template>
      <div class="desk-pivot-popup-actions">
        <button v-if="hasRules" type="button" data-desk-field="pivot-filter-clear" @click="clearAll">Clear all</button>
        <button type="button" :disabled="!checked.size" data-desk-field="pivot-filter-ok" @click="apply">OK</button>
        <button type="button" data-desk-field="pivot-filter-cancel" @click="emit('close')">Cancel</button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watchEffect } from 'vue';
import { claimDeskKey } from '../focus/useDeskFocus';
import { placePopup, type PopupAnchor } from '../menu/placePopup';
import { cleanPivotLabel, cleanPivotTop, cleanPivotValueFilters, PIVOT_LABEL_OPS } from './pivotFilters';
import PivotValueFilterForm from './PivotValueFilterForm.vue';
import { PIVOT_SORTS, type PivotLabelRule, type PivotSort, type PivotTopFilter, type PivotValueFilter } from './pivotTypes';

/** What OK sends back: the ticked-out items, and the rules (a missing one means none). */
export interface PivotFilterApply {
  exclude: string[];
  label: PivotLabelRule | null;
  valueFilters: PivotValueFilter[];
  top: PivotTopFilter | null;
  /** Mark the cells that meet the first value condition. */
  highlight: boolean;
}

/** Excel's field dropdown: sort order, then the items to keep, each with how many rows it has. */
const props = defineProps<{
  title: string;
  items: { key: string; label: string; count: number }[];
  exclude: string[];
  anchor: PopupAnchor;
  sortable: boolean;
  sort?: PivotSort | undefined;
  label?: PivotLabelRule | undefined;
  /** Rows and Columns only: the Values tab. */
  showValues?: boolean | undefined;
  valueFilters?: PivotValueFilter[] | undefined;
  top?: PivotTopFilter | undefined;
  highlighted?: boolean | undefined;
  values?: { key: string; label: string }[] | undefined;
  others?: { id: string; path: string[] }[] | undefined;
  otherName?: string | undefined;
}>();
const emit = defineEmits<{ apply: [payload: PivotFilterApply]; sort: [sort: PivotSort]; close: [] }>();

const tab = ref<'items' | 'values'>('items');
const ruleOp = ref<string>(props.label?.op ?? '');
const ruleText = ref(props.label?.text ?? '');
const draftFilters = ref<PivotValueFilter[]>((props.valueFilters ?? []).map((filter) => ({ ...filter })));
const draftTop = ref<PivotTopFilter | null>(props.top ? { ...props.top } : null);
const draftHighlight = ref(Boolean(props.highlighted));
const activeValueRules = computed(() => draftFilters.value.length > 0 || draftTop.value !== null);
const hasRules = computed(() => props.exclude.length > 0 || Boolean(ruleOp.value) || activeValueRules.value);

const SHOWN = 500;
const root = ref<HTMLElement | null>(null);
const search = ref<HTMLInputElement | null>(null);
const allBox = ref<HTMLInputElement | null>(null);
const query = ref('');
const checked = ref(new Set(props.items.map((item) => item.key).filter((key) => !props.exclude.includes(key))));
const place = ref({ top: props.anchor.bottom, left: props.anchor.left });
const style = computed(() => ({ top: `${place.value.top}px`, left: `${place.value.left}px` }));

const found = computed(() => {
  const text = query.value.trim().toLowerCase();
  return text ? props.items.filter((item) => item.label.toLowerCase().includes(text)) : props.items;
});
const shown = computed(() => found.value.slice(0, SHOWN));
const allShown = computed(() => found.value.length > 0 && found.value.every((item) => checked.value.has(item.key)));
const someShown = computed(() => found.value.some((item) => checked.value.has(item.key)));
watchEffect(() => {
  if (allBox.value) allBox.value.indeterminate = someShown.value && !allShown.value;
});

function replace(next: Set<string>): void {
  checked.value = next;
}

function toggle(key: string): void {
  const next = new Set(checked.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  replace(next);
}

function only(key: string): void {
  replace(new Set([key]));
}

/** With a search, ticks or unticks the items found; without, all of them. */
function toggleShown(): void {
  const next = new Set(checked.value);
  const on = !allShown.value;
  for (const item of found.value) {
    if (on) next.add(item.key);
    else next.delete(item.key);
  }
  replace(next);
}

function apply(): void {
  emit('apply', {
    exclude: props.items.map((item) => item.key).filter((key) => !checked.value.has(key)),
    label: ruleOp.value ? cleanPivotLabel({ op: ruleOp.value, text: ruleText.value }) : null,
    valueFilters: props.showValues ? cleanPivotValueFilters(draftFilters.value) : [],
    top: props.showValues ? cleanPivotTop(draftTop.value) : null,
    highlight: props.showValues ? draftHighlight.value && draftFilters.value.length > 0 : false,
  });
}

/** Every item ticked, no rules: what Clear all means. */
function clearAll(): void {
  emit('apply', { exclude: [], label: null, valueFilters: [], top: null, highlight: false });
}

function onKey(event: KeyboardEvent): void {
  claimDeskKey(event);
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    emit('close');
  } else if (event.key === 'Enter' && event.target === search.value) {
    event.preventDefault();
    if (checked.value.size) apply();
  }
}

function onDocDown(event: Event): void {
  const node = event.target;
  if (node instanceof Node && root.value?.contains(node)) return;
  emit('close');
}

onMounted(() => {
  document.addEventListener('mousedown', onDocDown, true);
  void nextTick(() => {
    const box = root.value?.getBoundingClientRect();
    if (box) place.value = placePopup(props.anchor, { width: box.width, height: box.height });
    search.value?.focus();
  });
});

onUnmounted(() => document.removeEventListener('mousedown', onDocDown, true));
</script>
