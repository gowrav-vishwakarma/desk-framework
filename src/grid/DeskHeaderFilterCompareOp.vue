<template>
  <div ref="root" class="desk-header-filter-op">
    <button
      type="button"
      class="desk-header-filter-op-btn"
      :aria-expanded="open"
      aria-haspopup="listbox"
      :aria-label="ariaLabel"
      @mousedown.stop
      @click="toggle"
    >
      <span class="desk-header-filter-op-label">{{ label }}</span>
      <span class="desk-header-filter-op-caret" aria-hidden="true">▾</span>
    </button>
    <Teleport to="body">
      <div
        v-if="open"
        ref="menu"
        class="desk-header-filter-op-menu"
        role="listbox"
        :aria-label="ariaLabel"
        :style="menuStyle"
        @mousedown.stop
      >
        <button
          v-for="item in COMPARE_OPS"
          :key="item.id"
          type="button"
          role="option"
          class="desk-header-filter-op-item"
          :aria-selected="modelValue === item.id"
          @click="pick(item.id)"
        >
          {{ item.label }}
        </button>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import { placePopup } from '../menu/placePopup';
import { COMPARE_OPS, type CompareOp } from './headerFilter';

const props = defineProps<{
  modelValue: CompareOp;
  ariaLabel: string;
  /** Short wording on the button for a narrow panel. The list keeps the full names. */
  compact?: boolean | undefined;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: CompareOp] }>();

const root = ref<HTMLElement | null>(null);
const menu = ref<HTMLElement | null>(null);
const open = ref(false);
const menuTop = ref(0);
const menuLeft = ref(0);

const label = computed(() => {
  const item = COMPARE_OPS.find((op) => op.id === props.modelValue);
  if (!item) return props.modelValue;
  return props.compact ? item.short : item.label;
});
const menuStyle = computed(() => ({ top: `${menuTop.value}px`, left: `${menuLeft.value}px` }));

function placeMenu(): void {
  const anchor = root.value?.querySelector('button');
  const panel = menu.value;
  if (!anchor || !panel) return;
  const spot = placePopup(anchor.getBoundingClientRect(), { width: panel.offsetWidth, height: panel.offsetHeight });
  menuTop.value = spot.top;
  menuLeft.value = spot.left;
}

function close(): void {
  open.value = false;
}

function toggle(): void {
  open.value = !open.value;
  if (open.value) void nextTick(() => placeMenu());
}

function pick(id: CompareOp): void {
  emit('update:modelValue', id);
  close();
}

function onDocDown(event: Event): void {
  if (!open.value) return;
  const node = event.target;
  if (node instanceof Node && (root.value?.contains(node) || menu.value?.contains(node))) return;
  close();
}

watch(open, (isOpen) => {
  if (isOpen) document.addEventListener('mousedown', onDocDown);
  else document.removeEventListener('mousedown', onDocDown);
});

onUnmounted(() => {
  document.removeEventListener('mousedown', onDocDown);
});
</script>
