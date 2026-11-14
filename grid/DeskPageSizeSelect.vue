<template>
  <div class="desk-page-size-wrap">
    <button
      ref="btn"
      type="button"
      class="desk-page-size"
      data-desk-field="page-size"
      :title="label"
      @click="toggle"
    >
      {{ label }}
    </button>
    <Teleport to="body">
      <div
        v-if="open"
        ref="panel"
        class="desk-page-size-menu"
        :style="{ top: `${top}px`, left: `${left}px`, minWidth: `${width}px` }"
        role="listbox"
        @mousedown.prevent
      >
        <button
          v-for="size in options"
          :key="pageSizeOptionKey(size)"
          type="button"
          role="option"
          class="hit"
          :class="{ active: pageSizeOptionKey(size) === pageSizeOptionKey(modelValue) }"
          @click="pick(size)"
        >
          {{ pageSizeLabel(size) }}
        </button>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import { placePopup } from '../menu/placePopup';
import { pageSizeLabel, type DeskPageSize } from './pageSize';

const modelValue = defineModel<DeskPageSize>({ required: true });
defineProps<{ options: readonly DeskPageSize[] }>();

const open = ref(false);
const btn = ref<HTMLButtonElement | null>(null);
const panel = ref<HTMLElement | null>(null);
const top = ref(0);
const left = ref(0);
const width = ref(120);

const label = computed(() => pageSizeLabel(modelValue.value));

function pageSizeOptionKey(size: DeskPageSize): string {
  return typeof size === 'number' ? `n:${size}` : size;
}

function place(): void {
  const rect = btn.value?.getBoundingClientRect();
  if (!rect) return;
  width.value = Math.max(rect.width, 148);
  const spot = placePopup(
    rect,
    { width: width.value, height: panel.value?.offsetHeight ?? 0 },
    { gap: 2, preferAbove: true },
  );
  top.value = spot.top;
  left.value = spot.left;
}

let placeRaf = 0;
function schedulePlace(): void {
  if (placeRaf) return;
  placeRaf = requestAnimationFrame(() => {
    placeRaf = 0;
    place();
  });
}

function onDocMouse(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Node)) return;
  if (btn.value?.contains(target) || panel.value?.contains(target)) return;
  open.value = false;
}

function startTracking(): void {
  window.addEventListener('resize', schedulePlace, { passive: true });
  window.addEventListener('scroll', schedulePlace, { capture: true, passive: true });
  document.addEventListener('mousedown', onDocMouse, true);
}

function stopTracking(): void {
  window.removeEventListener('resize', schedulePlace);
  window.removeEventListener('scroll', schedulePlace, true);
  document.removeEventListener('mousedown', onDocMouse, true);
}

function toggle(): void {
  open.value = !open.value;
}

function pick(size: DeskPageSize): void {
  modelValue.value = size;
  open.value = false;
}

watch(open, (isOpen) => {
  if (isOpen) {
    startTracking();
    void nextTick(() => {
      place();
      schedulePlace();
    });
    return;
  }
  stopTracking();
});

onUnmounted(() => {
  stopTracking();
  if (placeRaf) cancelAnimationFrame(placeRaf);
});
</script>
