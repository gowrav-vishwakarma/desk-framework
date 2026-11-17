<template>
  <button
    type="button"
    class="desk-designer-chip"
    :class="{ 'is-locked': locked, 'is-inset': inset, 'is-selected': selected, 'is-row-start': rowStart, 'is-resizing': resizing, 'is-gap': gap }"
    :style="cols ? { '--desk-slot-cols': String(cols) } : undefined"
    :data-desk-field="fieldId"
    draggable="true"
    @dragstart="onDragStart"
    @dragover.prevent
    @drop.stop.prevent="onDrop"
    @keydown="onKey"
  >
    <span class="desk-designer-chip-label">{{ label }}<span v-if="locked" class="desk-designer-chip-lock" title="Always on the form">🔒</span></span>
    <span v-if="hint" class="hint">{{ hint }}</span>
    <span v-if="showInset" class="hint">{{ inset ? 'label inside' : 'placeholder' }}</span>
    <span v-if="cols" class="desk-designer-chip-width" :class="{ 'is-custom': customWidth }" aria-hidden="true">{{ cols }}/12</span>
    <span
      v-if="cols"
      class="desk-designer-chip-resize"
      title="Drag to change the width"
      aria-hidden="true"
      @pointerdown.stop.prevent="startResize"
      @click.stop
    />
  </button>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { focusNextDeskField, focusPrevDeskField } from '../../focus/useDeskFocus';

const props = defineProps<{
  id: string;
  label: string;
  hint?: string | undefined;
  locked?: boolean | undefined;
  inset?: boolean | undefined;
  showInset?: boolean | undefined;
  hidden?: boolean | undefined;
  /** The field the designer's side panel shows. */
  selected?: boolean | undefined;
  /** Width in twelfths of the row. Omit for a chip outside the form grid, such as a hidden field. */
  cols?: number | undefined;
  /** A blank box: it only leaves a gap on the form. */
  gap?: boolean | undefined;
  /** The width is the field's own, not the label style's default. */
  customWidth?: boolean | undefined;
  /** Starts a new row on the form. */
  rowStart?: boolean | undefined;
}>();
const emit = defineEmits<{
  move: [dir: -1 | 1];
  hide: [];
  restore: [];
  toggleInset: [];
  drop: [id: string];
  /** A new width in twelfths, from the drag handle or Alt+Left / Alt+Right. */
  width: [cols: number];
}>();

const resizing = ref(false);

/** Drag the right edge: one column of the section's grid per twelfth. */
function startResize(event: PointerEvent): void {
  const chip = (event.currentTarget as HTMLElement).closest('.desk-designer-chip');
  const grid = chip?.parentElement;
  if (!grid || !props.cols) return;
  const step = grid.getBoundingClientRect().width / 12;
  if (step <= 0) return;
  const startX = event.clientX;
  const start = props.cols;
  let last = start;
  resizing.value = true;
  const move = (next: PointerEvent): void => {
    const cols = Math.min(12, Math.max(1, start + Math.round((next.clientX - startX) / step)));
    if (cols === last) return;
    last = cols;
    emit('width', cols);
  };
  const stop = (): void => {
    resizing.value = false;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', stop);
    window.removeEventListener('pointercancel', stop);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', stop);
  window.addEventListener('pointercancel', stop);
}

const fieldId = `chip:${props.id}${props.hidden ? ':hidden' : ''}`;

function onDragStart(event: DragEvent): void {
  event.dataTransfer?.setData('text/plain', props.id);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
}

function onDrop(event: DragEvent): void {
  const id = event.dataTransfer?.getData('text/plain');
  if (id) emit('drop', id);
}

function onKey(event: KeyboardEvent): void {
  if (event.altKey && props.cols && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
    // Alt+Left / Alt+Right are Back / Forward in the browser; here they change the width.
    event.preventDefault();
    event.stopPropagation();
    emit('width', Math.min(12, Math.max(1, props.cols + (event.key === 'ArrowRight' ? 1 : -1))));
    return;
  }
  if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
    event.preventDefault();
    emit('move', event.key === 'ArrowUp' ? -1 : 1);
    return;
  }
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault();
    emit('hide');
    return;
  }
  if ((event.key === 'l' || event.key === 'L') && props.showInset && !event.ctrlKey && !event.altKey && !event.metaKey) {
    event.preventDefault();
    emit('toggleInset');
    return;
  }
  if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
  event.preventDefault();
  if (props.hidden) emit('restore');
  else if (event.shiftKey) focusPrevDeskField(fieldId);
  else focusNextDeskField(fieldId);
}
</script>
