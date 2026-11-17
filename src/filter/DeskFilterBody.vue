<template>
  <DeskForm :issues="issues" @save="applyTask.run">
    <div class="desk-filter-body" @keydown.capture="onEscape">
      <div data-desk-section="filter-fields">
        <DeskSettingsGrid
          ref="grid"
          :rows="rows"
          :read="read"
          field-id="desk-filter"
          initial
          autofocus
          ctrl-arrows
          enter-jump
          @change="change"
        />
      </div>
      <div class="desk-footer-bar" data-desk-section="filter-actions">
        <DeskButton data-desk-field="desk-filter-apply" :task="applyTask">Apply (Ctrl+S)</DeskButton>
        <button type="button" data-desk-field="desk-filter-cancel" @click="emit('cancel')">Cancel (Esc)</button>
      </div>
    </div>
  </DeskForm>
</template>

<script setup lang="ts" generic="V extends DeskFilterValues">
import { computed, onUnmounted, ref } from 'vue';
import DeskButton from '../form/DeskButton.vue';
import { useDeskTask } from '../form/deskTask';
import DeskForm from '../form/DeskForm.vue';
import type { DeskIssue } from '../form/issues';
import DeskSettingsGrid from '../grid/DeskSettingsGrid.vue';
import { sectionRows } from '../grid/settings';
import { useDeskLayer } from '../keys/useDeskLayer';
import type { DeskFilterSpec, DeskFilterValues } from './types';

const props = defineProps<{ spec: DeskFilterSpec<V>; initial: V }>();
const emit = defineEmits<{ apply: [values: V]; cancel: [] }>();

const draft = ref<V>({ ...props.initial });
const checked = ref(false);
const grid = ref<{ commitOpen: () => void } | null>(null);

const rows = computed(() => sectionRows('filter', props.spec.title ?? 'Filter', props.spec.fields));
const issues = computed((): DeskIssue[] => (checked.value ? (props.spec.validate?.(draft.value) ?? []) : []));

function read(key: string): unknown {
  return draft.value[key];
}

function change(key: string, value: unknown): void {
  draft.value[key] = value;
  props.spec.onChange?.(draft.value, key);
}

function apply(): void {
  grid.value?.commitOpen();
  checked.value = true;
  if ((props.spec.validate?.(draft.value) ?? []).length > 0) return;
  emit('apply', { ...draft.value });
}

function cancel(): void {
  emit('cancel');
}

/**
 * Escape discards the draft and closes, from any cell, even one that is being edited. An open list
 * or calendar closes first, so Escape never throws away a filter while the user is still picking.
 */
function onEscape(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
  if (document.querySelector('.desk-suggest, .desk-calendar-pop, .desk-lookup-menu, .desk-currency-pop')) return;
  event.preventDefault();
  event.stopPropagation();
  cancel();
}

// This panel takes Ctrl+S and Escape from the page while it is open, and gives them back when it closes.
const layer = useDeskLayer();
const saved = {
  save: layer?.handlers.get('action-save'),
  cancel: layer?.handlers.get('action-cancel'),
  form: layer?.handlers.get('action-form-save'),
};
/** The button, Ctrl+S and Enter share one run. */
const applyTask = useDeskTask(apply);

useDeskLayer({ handlers: { 'action-save': () => void applyTask.run(), 'action-form-save': () => void applyTask.run(), 'action-cancel': cancel } });
onUnmounted(() => {
  if (!layer) return;
  if (saved.save) layer.handlers.set('action-save', saved.save);
  if (saved.cancel) layer.handlers.set('action-cancel', saved.cancel);
  if (saved.form) layer.handlers.set('action-form-save', saved.form);
});
</script>
