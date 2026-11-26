<template>
  <div class="map-list">
    <div v-for="([name, value], index) in entries" :key="index" class="map-row">
      <PickButton
        compact
        :model-value="name"
        :items="targetItems"
        placeholder="Column…"
        @update:model-value="(next) => rename(index, next)"
      />
      <span class="desk-muted">=</span>
      <FormulaInput
        class="map-value"
        :model-value="value"
        :scope="scope"
        placeholder="-amount"
        @update:model-value="(next) => setValue(index, next)"
      />
      <button type="button" class="studio-icon-btn danger" title="Remove" @click="removeAt(index)">
        <StudioIcon name="close" />
      </button>
    </div>
    <button type="button" class="studio-chip-btn" @click="add">
      <StudioIcon name="plus" /> Set a column
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import FormulaInput from './FormulaInput.vue';
import PickButton from './PickButton.vue';
import { columnItems } from './pickItems';
import type { ColumnInfo } from './schema';
import type { NameScope } from './scope';
import StudioIcon from './StudioIcon.vue';

/**
 * Columns given a value by formula, such as `amount = -amount` for credit notes stacked under
 * sales. `targets` are the columns the result must have; `scope` is what the formulas may read.
 */
const props = defineProps<{
  value: Record<string, string> | undefined;
  targets: readonly ColumnInfo[];
  scope: NameScope;
}>();
const emit = defineEmits<{ update: [value: Record<string, string> | undefined] }>();

const entries = computed(() => Object.entries(props.value ?? {}));
const targetItems = computed(() => columnItems(props.targets));

function write(list: [string, string][]): void {
  const out: Record<string, string> = {};
  for (const [name, value] of list) out[name] = value;
  emit('update', list.length ? out : undefined);
}

function rename(index: number, name: string): void {
  if (entries.value.some(([other], at) => other === name && at !== index)) return;
  write(
    entries.value.map(([current, value], at) => (at === index ? [name, value] : [current, value])),
  );
}

function setValue(index: number, value: string): void {
  write(
    entries.value.map(([name, current], at) => (at === index ? [name, value] : [name, current])),
  );
}

function removeAt(index: number): void {
  write(entries.value.filter((_entry, at) => at !== index));
}

/** A new entry for the first target column not set yet. */
function add(): void {
  const taken = new Set(entries.value.map(([name]) => name));
  const next = props.targets.find((col) => !taken.has(col.name))?.name ?? '';
  if (taken.has(next)) return;
  write([...entries.value, [next, '']]);
}
</script>
