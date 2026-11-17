<template>
  <Teleport to="body">
    <div ref="root" class="desk-header-filter" role="dialog" :aria-label="`Filter ${header}`" :style="style" @mousedown.stop @keydown="onKey">
      <div class="desk-header-filter-title">{{ header }}</div>
      <DeskFilterEditor ref="editor" :kind="kind" :value="value" :choices="choices" @chip="emit('apply', $event)" />
      <div class="desk-header-filter-actions">
        <button type="button" data-desk-field="header-filter-clear" @click="emit('apply', '')">Clear</button>
        <button type="button" data-desk-field="header-filter-apply" @click="apply">Apply</button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { claimDeskKey } from '../focus/useDeskFocus';
import { placePopup } from '../menu/placePopup';
import DeskFilterEditor from './DeskFilterEditor.vue';
import type { HeaderFilterKind } from './headerFilter';

const props = defineProps<{
  header: string;
  kind: HeaderFilterKind;
  value: string;
  x: number;
  y: number;
  /** A column with fixed values picks from them instead of typing. */
  choices?: readonly { value: string; label: string }[] | undefined;
}>();
const emit = defineEmits<{ apply: [text: string]; close: [] }>();

const root = ref<HTMLElement | null>(null);
const panelTop = ref(props.y);
const panelLeft = ref(props.x);

const editor = ref<{ compose: () => string } | null>(null);

const style = computed(() => ({ top: `${panelTop.value}px`, left: `${panelLeft.value}px` }));

function apply(): void {
  emit('apply', editor.value?.compose() ?? props.value);
}

function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    claimDeskKey(event);
    event.preventDefault();
    emit('close');
    return;
  }
  if (event.key !== 'Enter') return;
  claimDeskKey(event);
  event.preventDefault();
  apply();
}

function onDocDown(event: Event): void {
  const node = event.target;
  if (node instanceof Node && root.value?.contains(node)) return;
  emit('close');
}

function placePanel(): void {
  const box = root.value?.getBoundingClientRect();
  if (!box) return;
  const margin = 8;
  const spot = placePopup({ left: props.x, top: props.y, bottom: props.y }, box, { margin, gap: 6 });
  let top = spot.top;
  if (window.innerHeight < 720 && top < 72) {
    top = Math.min(Math.max(margin, window.innerHeight - box.height - margin), 72);
  }
  panelLeft.value = spot.left;
  panelTop.value = top;
}

onMounted(() => {
  document.addEventListener('mousedown', onDocDown);
  void nextTick(() => {
    placePanel();
    root.value?.querySelector('input')?.focus();
  });
});

onUnmounted(() => {
  document.removeEventListener('mousedown', onDocDown);
});
</script>
