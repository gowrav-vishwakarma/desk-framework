<template>
  <Teleport to="body">
    <div
      ref="root"
      class="desk-header-column-menu"
      role="menu"
      :aria-label="`Column ${header}`"
      :style="style"
      @mousedown.stop
      @keydown="onKey"
    >
      <div class="desk-header-column-menu-title">{{ header }}</div>
      <button v-if="showFilter" type="button" class="desk-header-column-menu-item" role="menuitem" @click="emit('filter')">
        Filter…
      </button>
      <template v-if="showSort">
        <button type="button" class="desk-header-column-menu-item" role="menuitem" @click="emit('sort', 'asc')">
          Sort ascending
        </button>
        <button type="button" class="desk-header-column-menu-item" role="menuitem" @click="emit('sort', 'desc')">
          Sort descending
        </button>
        <button
          v-if="sortActive"
          type="button"
          class="desk-header-column-menu-item"
          role="menuitem"
          @click="emit('sort', 'clear')"
        >
          Clear sort
        </button>
      </template>
      <div v-if="showSort && showTextLayout" class="desk-header-column-menu-sep" role="separator" />
      <template v-if="showTextLayout">
        <div class="desk-context-menu-label">Cell text</div>
        <button
          v-for="item in TEXT_LAYOUT_ITEMS"
          :key="item.id"
          type="button"
          class="desk-header-column-menu-item desk-header-column-menu-checkitem"
          role="menuitemradio"
          :aria-checked="textLayout === item.id"
          @click="emit('text-layout', item.id)"
        >
          <span class="desk-grid-menu-check">{{ textLayout === item.id ? '✓' : '' }}</span>
          <span>{{ item.label }}</span>
        </button>
      </template>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { claimDeskKey } from '../focus/useDeskFocus';
import type { DeskColumnTextLayout, DeskGridSortAction } from './types';

const TEXT_LAYOUT_ITEMS: { id: DeskColumnTextLayout; label: string }[] = [
  { id: 'wrap', label: 'Wrap text' },
  { id: 'clip', label: 'Clip (cut off)' },
  { id: 'ellipsis-end', label: 'Ellipsis at end' },
  { id: 'ellipsis-middle', label: 'Ellipsis in middle' },
];

const props = defineProps<{
  header: string;
  x: number;
  y: number;
  showFilter: boolean;
  showSort: boolean;
  showTextLayout: boolean;
  sortActive: boolean;
  textLayout: DeskColumnTextLayout;
}>();

const emit = defineEmits<{
  filter: [];
  sort: [action: DeskGridSortAction];
  'text-layout': [layout: DeskColumnTextLayout];
  close: [];
}>();

const root = ref<HTMLElement | null>(null);
const panelTop = ref(props.y);
const panelLeft = ref(props.x);

const style = computed(() => ({ top: `${panelTop.value}px`, left: `${panelLeft.value}px` }));

function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    claimDeskKey(event);
    event.preventDefault();
    emit('close');
  }
}

function onDocDown(event: Event): void {
  const node = event.target;
  if (node instanceof Node && root.value?.contains(node)) return;
  emit('close');
}

onMounted(() => {
  document.addEventListener('mousedown', onDocDown);
  void nextTick(() => {
    const box = root.value?.getBoundingClientRect();
    if (box) {
      panelTop.value = Math.max(4, Math.min(props.y, window.innerHeight - box.height - 4));
      panelLeft.value = Math.max(4, Math.min(props.x, window.innerWidth - box.width - 4));
    }
    root.value?.querySelector('button')?.focus();
  });
});

onUnmounted(() => {
  document.removeEventListener('mousedown', onDocDown);
});
</script>
