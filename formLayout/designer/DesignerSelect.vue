<template>
  <component :is="bare ? 'span' : 'label'" :class="bare ? undefined : 'desk-designer-style'">
    <span v-if="!bare">{{ label }}</span>
    <span ref="anchor" class="desk-designer-pick">
      <button type="button" :data-desk-field="fieldId" :aria-expanded="open" v-bind="bare ? { 'aria-label': label } : {}" @mousedown="onPress" @keydown="onKey">
        {{ buttonLabel || current }}
      </button>
    </span>
  </component>
  <Teleport to="body">
    <div v-if="open" ref="menu" class="desk-designer-menu" :style="menuStyle" @mousedown.prevent>
      <button
        v-for="(choice, index) in choices"
        :key="choice.value"
        type="button"
        :class="{ on: index === active }"
        @mouseenter="active = index"
        @click="pick(choice.value)"
      >
        {{ choice.label }}
      </button>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import type { DeskLayoutOptionChoice } from '../types';

const props = withDefaults(
  defineProps<{
    label: string;
    fieldId: string;
    value: string;
    choices: readonly DeskLayoutOptionChoice[];
    /** The button only, so it can sit on the end of another field. */
    bare?: boolean;
    /** Shown on the button instead of the selected choice. */
    buttonLabel?: string;
  }>(),
  { bare: false, buttonLabel: '' },
);
const emit = defineEmits<{ change: [value: string] }>();

const anchor = ref<HTMLElement | null>(null);
const menu = ref<HTMLElement | null>(null);
const open = ref(false);
const active = ref(0);
const menuStyle = ref<{ top: string; left: string; width: string }>({ top: '0px', left: '0px', width: '160px' });

const current = computed(() => props.choices.find((choice) => choice.value === props.value)?.label ?? props.value);

function place(): void {
  const rect = anchor.value?.getBoundingClientRect();
  if (!rect) return;
  const width = Math.max(rect.width, 180);
  const height = menu.value?.offsetHeight ?? props.choices.length * 24 + 4;
  let top = rect.bottom;
  if (top + height > window.innerHeight - 8 && rect.top - height >= 8) top = rect.top - height;
  let left = rect.left;
  if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
  menuStyle.value = { top: `${top}px`, left: `${left}px`, width: `${width}px` };
}

function show(): void {
  const index = props.choices.findIndex((choice) => choice.value === props.value);
  active.value = index >= 0 ? index : 0;
  place();
  open.value = true;
  void nextTick(place);
}

function hide(): void {
  open.value = false;
}

function onPress(event: MouseEvent): void {
  event.preventDefault();
  if (open.value) hide();
  else show();
  anchor.value?.querySelector('button')?.focus();
}

function pick(value: string): void {
  hide();
  if (value !== props.value) emit('change', value);
  anchor.value?.querySelector('button')?.focus();
}

function onDoc(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Node)) return;
  if (anchor.value?.contains(target) || menu.value?.contains(target)) return;
  hide();
}

function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape' && open.value) {
    event.preventDefault();
    event.stopPropagation();
    hide();
    return;
  }
  if (!open.value) {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      show();
    }
    return;
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    event.stopPropagation();
    const step = event.key === 'ArrowDown' ? 1 : -1;
    const last = props.choices.length - 1;
    active.value = active.value + step < 0 ? last : active.value + step > last ? 0 : active.value + step;
    return;
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    event.stopPropagation();
    const choice = props.choices[active.value];
    if (choice) pick(choice.value);
  }
}

watch(open, (shown) => {
  if (!shown) {
    document.removeEventListener('mousedown', onDoc, true);
    return;
  }
  document.addEventListener('mousedown', onDoc, true);
});

onBeforeUnmount(() => document.removeEventListener('mousedown', onDoc, true));
</script>
