<template>
  <div class="pick-chips" :class="{ invalid }">
    <span
      v-for="(value, index) in modelValue"
      :key="value"
      class="pick-chip"
      :class="{ unknown: !byValue.has(value), dragging: dragged === index }"
      draggable="true"
      :title="
        byValue.get(value)?.hint ?? (byValue.has(value) ? '' : `${value} is not available here`)
      "
      @dragstart="dragged = index"
      @dragend="dragged = null"
      @dragover.prevent
      @drop.prevent="drop(index)"
    >
      <span
        v-if="byValue.get(value)?.icon"
        class="pick-chip-icon"
        :class="`tone-${byValue.get(value)?.tone ?? ''}`"
        ><StudioIcon :name="byValue.get(value)!.icon!"
      /></span>
      <StudioIcon v-else name="warn" class="tone-danger" />
      {{ byValue.get(value)?.label ?? value }}
      <button
        type="button"
        class="pick-chip-remove"
        :title="`Remove ${value}`"
        @click="remove(value)"
      >
        <StudioIcon name="close" />
      </button>
    </span>
    <button
      ref="adder"
      type="button"
      class="pick-chip-add"
      :data-desk-field="fieldId"
      @click="open = !open"
    >
      <StudioIcon name="plus" /> {{ modelValue.length ? '' : addLabel }}
    </button>
    <StudioPopup v-model:open="open" :anchor="adder" :width="280">
      <PickList
        :items="items"
        :selected="modelValue"
        multi
        :empty="empty ?? ''"
        :searchable="items.length > 6"
        @pick="toggle"
      />
    </StudioPopup>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { PickItem } from './pickItems';
import PickList from './PickList.vue';
import StudioIcon from './StudioIcon.vue';
import StudioPopup from './StudioPopup.vue';

/** Pick several values in order, such as the columns to group by. Drag a chip to reorder. */
const props = withDefaults(
  defineProps<{
    modelValue: readonly string[];
    items: readonly PickItem[];
    addLabel?: string | undefined;
    empty?: string | undefined;
    invalid?: boolean | undefined;
    fieldId?: string | undefined;
  }>(),
  { addLabel: 'Add', empty: 'Nothing to choose yet' },
);
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>();

const open = ref(false);
const adder = ref<HTMLButtonElement | null>(null);
const dragged = ref<number | null>(null);
const byValue = computed(() => new Map(props.items.map((item) => [item.value, item])));

function toggle(value: string): void {
  emit(
    'update:modelValue',
    props.modelValue.includes(value)
      ? props.modelValue.filter((item) => item !== value)
      : [...props.modelValue, value],
  );
}

function remove(value: string): void {
  emit(
    'update:modelValue',
    props.modelValue.filter((item) => item !== value),
  );
}

function drop(index: number): void {
  const from = dragged.value;
  dragged.value = null;
  if (from === null || from === index) return;
  const next = [...props.modelValue];
  const [item] = next.splice(from, 1);
  next.splice(index, 0, item!);
  emit('update:modelValue', next);
}
</script>

<style scoped>
.pick-chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  min-height: 26px;
}
.pick-chips.invalid .pick-chip-add {
  border-color: var(--desk-error);
}
.pick-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 2px 1px 7px;
  border: 1px solid var(--desk-grid-line);
  border-radius: 12px;
  background: var(--desk-header-bg);
  cursor: grab;
}
.pick-chip.unknown {
  border-color: var(--desk-error);
  background: var(--desk-invalid-bg);
}
.pick-chip.dragging {
  opacity: 0.4;
}
.pick-chip-remove {
  display: inline-flex;
  border: 0;
  border-radius: 50%;
  padding: 2px;
  background: transparent;
  color: var(--desk-muted);
  cursor: pointer;
}
.pick-chip-remove:hover {
  background: var(--desk-hover-bg);
  color: var(--desk-text);
}
.pick-chip-add {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border: 1px dashed var(--desk-grid-line);
  border-radius: 12px;
  background: transparent;
  color: var(--desk-muted);
  font: inherit;
  cursor: pointer;
}
.pick-chip-add:hover,
.pick-chip-add:focus-visible {
  border-color: var(--desk-cursor);
  color: var(--desk-text);
}
</style>
