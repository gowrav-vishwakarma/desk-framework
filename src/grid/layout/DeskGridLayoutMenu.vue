<template>
  <div class="desk-page-size-wrap desk-grid-layout-wrap">
    <button
      ref="btn"
      type="button"
      class="desk-page-size desk-grid-layout-button"
      data-desk-field="grid-layout"
      :title="`Layout: ${activeName}`"
      aria-haspopup="menu"
      :aria-expanded="open"
      @click="open = !open"
    >
      <svg viewBox="0 0 14 14" aria-hidden="true">
        <rect x="1" y="2" width="12" height="10" rx="1" fill="none" stroke="currentColor" stroke-width="1.2" />
        <path d="M1 5h12M5 5v7M9 5v7" fill="none" stroke="currentColor" stroke-width="1.2" />
      </svg>
      <span>{{ activeName }}</span>
    </button>
    <Teleport to="body">
      <div
        v-if="open"
        ref="panel"
        class="desk-page-size-menu desk-grid-layout-menu"
        :style="{ top: `${top}px`, left: `${left}px`, minWidth: `${width}px` }"
        role="menu"
        @mousedown.prevent
      >
        <button
          v-for="item in state.items"
          :key="item.id"
          type="button"
          role="menuitemradio"
          class="hit"
          :class="{ active: item.id === state.active }"
          :aria-checked="item.id === state.active"
          @click="run({ action: 'select', id: item.id })"
        >
          {{ item.name }}<span v-if="item.kind === 'tab'" class="desk-grid-layout-kind"> (tab)</span>
        </button>
        <hr />
        <template v-if="state.view">
          <button type="button" role="menuitem" class="hit" data-desk-field="grid-layout-save-view" @click="run({ action: 'save-view' })">
            Save current filters to this layout
          </button>
          <button v-if="state.view.modified" type="button" role="menuitem" class="hit" @click="run({ action: 'reset-view' })">Reset to saved filters</button>
          <button type="button" role="menuitem" class="hit" @click="run({ action: 'new-from-view' })">New tab from current filters...</button>
          <hr />
        </template>
        <button type="button" role="menuitem" class="hit" @click="run({ action: 'new' })">New layout...</button>
        <button type="button" role="menuitem" class="hit" @click="run({ action: 'edit' })">Edit this layout...</button>
        <button type="button" role="menuitem" class="hit" @click="run({ action: 'duplicate' })">Duplicate</button>
        <button v-if="canReset" type="button" role="menuitem" class="hit" @click="run({ action: 'reset' })">Reset to default</button>
        <button v-if="!isDefault" type="button" role="menuitem" class="hit" data-desk-field="grid-layout-delete" @click="run({ action: 'delete' })">Delete</button>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import { placePopup } from '../../menu/placePopup';
import { DESK_DEFAULT_LAYOUT_ID, type DeskGridLayoutCommand, type DeskGridLayoutMenuState } from './types';

const props = defineProps<{ state: DeskGridLayoutMenuState }>();
const emit = defineEmits<{ command: [command: DeskGridLayoutCommand] }>();

const open = ref(false);
const btn = ref<HTMLButtonElement | null>(null);
const panel = ref<HTMLElement | null>(null);
const top = ref(0);
const left = ref(0);
const width = ref(160);

const isDefault = computed(() => props.state.active === DESK_DEFAULT_LAYOUT_ID);
const canReset = computed(() => isDefault.value && props.state.defaultOverridden);
const activeName = computed(() => props.state.items.find((item) => item.id === props.state.active)?.name ?? 'Default');

function run(command: DeskGridLayoutCommand): void {
  open.value = false;
  emit('command', command);
}

function place(): void {
  const rect = btn.value?.getBoundingClientRect();
  if (!rect) return;
  width.value = Math.max(rect.width, 180);
  const spot = placePopup(rect, { width: width.value, height: panel.value?.offsetHeight ?? 0 }, { gap: 2, preferAbove: true });
  top.value = spot.top;
  left.value = spot.left;
}

function onDocMouse(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Node)) return;
  if (btn.value?.contains(target) || panel.value?.contains(target)) return;
  open.value = false;
}

function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') open.value = false;
}

function stopTracking(): void {
  window.removeEventListener('resize', place);
  window.removeEventListener('scroll', place, true);
  document.removeEventListener('mousedown', onDocMouse, true);
  document.removeEventListener('keydown', onKey, true);
}

watch(open, (isOpen) => {
  if (!isOpen) {
    stopTracking();
    return;
  }
  window.addEventListener('resize', place, { passive: true });
  window.addEventListener('scroll', place, { capture: true, passive: true });
  document.addEventListener('mousedown', onDocMouse, true);
  document.addEventListener('keydown', onKey, true);
  void nextTick(place);
});

onUnmounted(stopTracking);
</script>
