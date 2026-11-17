<template>
  <div class="desk-designer-section" @dragover.prevent @drop.prevent="onDropEnd">
    <header>
      <input
        type="text"
        :data-desk-field="`section-title:${section.id}`"
        :value="section.title"
        aria-label="Section title"
        @change="onRename"
        @keydown.enter.prevent="focusNextDeskField(`section-title:${section.id}`)"
      />
      <label class="desk-designer-section-open" title="Show this section's fields without clicking its strip">
        <input type="checkbox" :checked="section.open === true" @change="emit('toggleOpen', ($event.target as HTMLInputElement).checked)" /> Always open
      </label>
      <span class="desk-designer-section-tools">
        <button type="button" tabindex="-1" title="Move section up" :disabled="index === 0" @click="emit('move', -1)">↑</button>
        <button type="button" tabindex="-1" title="Move section down" :disabled="index >= count - 1" @click="emit('move', 1)">↓</button>
        <button type="button" tabindex="-1" class="is-danger" title="Delete section (its fields are hidden)" @click="emit('remove')">×</button>
      </span>
    </header>
    <div class="desk-designer-section-fields">
      <DesignerChip
        v-for="(slot, chipIndex) in section.fields"
        :key="slot.id"
        :id="slot.id"
        :label="nameOf(slot.id)"
        :hint="info(slot.id)?.hint"
        :locked="info(slot.id)?.locked === true"
        :gap="isGapId(slot.id)"
        :inset="inset.includes(slot.id)"
        :show-inset="labelStyle === 'placeholder'"
        :selected="selectedId === slot.id"
        :cols="slotCols(slot, labelStyle)"
        :custom-width="slot.cols !== undefined"
        :row-start="slot.row === true"
        @width="emit('width', { id: slot.id, cols: $event })"
        @move="emit('moveChip', { id: slot.id, dir: $event })"
        @hide="emit('hide', slot.id)"
        @toggle-inset="emit('toggleInset', slot.id)"
        @drop="emit('place', { id: $event, index: chipIndex })"
      />
      <div v-if="section.fields.length === 0" class="desk-designer-section-empty">Drop fields here</div>
    </div>
    <div class="desk-designer-section-foot">
      <button type="button" tabindex="-1" title="Add a blank box to leave a gap" @click="emit('addGap')">+ Blank space</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { focusNextDeskField } from '../../focus/useDeskFocus';
import { isGapId, slotCols, type DeskLabelStyle, type DeskLayoutFieldInfo, type DeskLayoutSection } from '../types';
import DesignerChip from './DesignerChip.vue';

const props = defineProps<{
  section: DeskLayoutSection;
  index: number;
  count: number;
  labelStyle: DeskLabelStyle;
  inset: readonly string[];
  info: (id: string) => DeskLayoutFieldInfo | undefined;
  /** Field shown in the designer's side panel. */
  selectedId?: string | null | undefined;
}>();
const emit = defineEmits<{
  rename: [title: string];
  toggleOpen: [open: boolean];
  move: [dir: -1 | 1];
  remove: [];
  moveChip: [payload: { id: string; dir: -1 | 1 }];
  hide: [id: string];
  toggleInset: [id: string];
  place: [payload: { id: string; index: number }];
  width: [payload: { id: string; cols: number }];
  addGap: [];
}>();

function nameOf(id: string): string {
  if (isGapId(id)) return 'Blank space';
  return props.info(id)?.label ?? id;
}

function onRename(event: Event): void {
  emit('rename', (event.target as HTMLInputElement).value);
}

function onDropEnd(event: DragEvent): void {
  const id = event.dataTransfer?.getData('text/plain');
  if (id) emit('place', { id, index: props.section.fields.length });
}
</script>
