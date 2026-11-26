<template>
  <div class="fold-list">
    <div
      v-for="(item, index) in items"
      :key="keyOf(item, index)"
      class="fold-item"
      :class="{ open: isOpen(item), bad: problemsOf(index) > 0 }"
    >
      <div
        class="fold-head"
        role="button"
        tabindex="0"
        :aria-expanded="isOpen(item)"
        @click="toggle(item)"
        @keydown.enter.self.prevent="toggle(item)"
        @keydown.space.self.prevent="toggle(item)"
      >
        <StudioIcon :name="isOpen(item) ? 'open' : 'right'" class="fold-caret" />
        <span class="fold-summary">
          <slot name="summary" :item="item" :index="index">{{ summaryOf(item, index) }}</slot>
        </span>
        <span v-if="problemsOf(index)" class="fold-bad" :title="`${problemsOf(index)} to fix`"
          ><StudioIcon name="warn" /> {{ problemsOf(index) }}</span
        >
        <span class="fold-tools" @click.stop>
          <slot name="tools" :item="item" :index="index" />
          <button
            type="button"
            class="studio-icon-btn"
            title="Move up"
            :disabled="index === 0"
            @click="move(index, -1)"
          >
            <StudioIcon name="up" />
          </button>
          <button
            type="button"
            class="studio-icon-btn"
            title="Move down"
            :disabled="index === items.length - 1"
            @click="move(index, 1)"
          >
            <StudioIcon name="down" />
          </button>
          <button
            v-if="copyable"
            type="button"
            class="studio-icon-btn"
            title="Duplicate"
            @click="duplicate(index)"
          >
            <StudioIcon name="copy" />
          </button>
          <button
            type="button"
            class="studio-icon-btn danger"
            title="Remove"
            @click="remove(index)"
          >
            <StudioIcon name="close" />
          </button>
        </span>
      </div>
      <div v-if="isOpen(item)" class="fold-body">
        <slot :item="item" :index="index" />
      </div>
    </div>
    <p v-if="!items.length && emptyText" class="fold-empty desk-muted">{{ emptyText }}</p>
    <div class="fold-add">
      <button type="button" class="studio-chip-btn" :data-desk-field="fieldId" @click="add">
        <StudioIcon name="plus" /> {{ addLabel }}
      </button>
      <slot name="add" />
    </div>
  </div>
</template>

<script setup lang="ts" generic="T extends object">
import { shallowRef, toRaw } from 'vue';
import StudioIcon from './StudioIcon.vue';

/**
 * A list shown as one line per item; one item opens at a time to edit. New items open. Changes to
 * the list itself (add, move, remove) come back as a new array with `update`.
 */
const props = withDefaults(
  defineProps<{
    items: readonly T[];
    summary?: ((item: T, index: number) => string) | undefined;
    /** Problems in an item, for its marker. */
    problems?: ((index: number) => number) | undefined;
    blank: () => T;
    addLabel?: string | undefined;
    emptyText?: string | undefined;
    copyable?: boolean | undefined;
    fieldId?: string | undefined;
  }>(),
  { addLabel: 'Add', emptyText: '', copyable: true },
);
const emit = defineEmits<{ update: [items: T[]] }>();

/** The open item, unwrapped: the store hands items back wrapped, so compare what is inside. */
const opened = shallowRef<T | null>(null);

function summaryOf(item: T, index: number): string {
  return props.summary?.(item, index) ?? '';
}

function problemsOf(index: number): number {
  return props.problems?.(index) ?? 0;
}
const keys = new WeakMap<object, number>();
let lastKey = 0;

/** A key that follows the item when the list is reordered. */
function keyOf(item: T, index: number): string {
  if (typeof item !== 'object') return `i${index}`;
  const raw = toRaw(item);
  let key = keys.get(raw);
  if (key === undefined) {
    lastKey += 1;
    key = lastKey;
    keys.set(raw, key);
  }
  return `k${key}`;
}

function isOpen(item: T): boolean {
  return opened.value !== null && toRaw(item) === opened.value;
}

function toggle(item: T): void {
  opened.value = isOpen(item) ? null : toRaw(item);
}

function add(): void {
  const item = props.blank();
  emit('update', [...props.items, item]);
  opened.value = item;
}

function remove(index: number): void {
  const item = props.items[index];
  if (item && isOpen(item)) opened.value = null;
  emit(
    'update',
    props.items.filter((_item, at) => at !== index),
  );
}

function move(index: number, by: -1 | 1): void {
  const next = [...props.items];
  const [item] = next.splice(index, 1);
  next.splice(index + by, 0, item!);
  emit('update', next);
}

function duplicate(index: number): void {
  const copy = JSON.parse(JSON.stringify(toRaw(props.items[index]))) as T;
  const next = [...props.items];
  next.splice(index + 1, 0, copy);
  emit('update', next);
  opened.value = copy;
}

defineExpose({ open: (item: T) => (opened.value = toRaw(item)) });
</script>
