<template>
  <button
    type="button"
    class="desk-section-strip"
    :class="{ 'is-open': open, 'is-problem': problem }"
    :data-desk-field="fieldId"
    :title="full"
    :aria-expanded="open"
    @click="emit('open')"
    @keydown.enter.exact.prevent="focusNextDeskField(fieldId)"
    @keydown.enter.shift.prevent="focusPrevDeskField(fieldId)"
    @keydown.tab.prevent="onTab"
  >
    <strong>{{ title }}</strong>
    <span v-if="summary">: {{ summary }}</span>
    <span v-else class="is-empty">: —</span>
  </button>
</template>

<script setup lang="ts">
import { focusNextDeskField, focusPrevDeskField } from '../focus/useDeskFocus';
import { sectionFieldId } from './useZoneKeys';

const props = defineProps<{
  sectionId: string;
  title: string;
  summary: string;
  full: string;
  problem: boolean;
  open: boolean;
}>();
const emit = defineEmits<{ open: [] }>();
const fieldId = sectionFieldId(props.sectionId);

function onTab(event: KeyboardEvent): void {
  if (event.shiftKey) focusPrevDeskField(fieldId);
  else focusNextDeskField(fieldId, 'tab');
}
</script>
