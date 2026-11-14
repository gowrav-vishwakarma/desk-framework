<template>
  <DeskDialog v-model:open="open" panel-class="is-sheet" :keys="keys" @accept="onSave" @close="onDialogClose">
    <header class="desk-sheet-head">
      <h3>
        {{ title }}<template v-if="subtitle"> — {{ subtitle }}</template>
      </h3>
      <button type="button" class="desk-sheet-close" aria-label="Close" @click="requestClose">×</button>
    </header>
    <div class="desk-sheet-body">
      <DeskSettingsGrid
        ref="grid"
        :field-id="fieldId ?? ''"
        :rows="rows"
        :read="read"
        autofocus
        :exit-to="leaveGrid"
        @change="onChange"
      />
      <slot />
      <div class="desk-sheet-message">
        <slot name="message" />
        <p v-if="message" class="desk-error">{{ message }}</p>
      </div>
    </div>
    <div class="desk-footer-bar">
      <DeskButton
        ref="saveButton"
        data-desk-field="sheet-save"
        data-form-save-btn
        :loading="saving === true"
        :disabled="readonly === true"
        @click="onSave"
      >
        {{ saveLabel }}
      </DeskButton>
      <slot name="actions" />
      <button type="button" data-desk-field="sheet-cancel" @click="requestClose">{{ cancelLabel }}</button>
    </div>
  </DeskDialog>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import DeskSettingsGrid from '../grid/DeskSettingsGrid.vue';
import type { DeskSettingsRow } from '../grid/settings';
import type { DeskHandlerInput } from '../keys/layers';
import DeskButton from './DeskButton.vue';
import type { DeskButtonApi } from './deskTask';
import DeskDialog from './DeskDialog.vue';

/**
 * A datagrid form in a dialog: a title and close button, a settings sheet, and a pinned
 * Save / Cancel bar. Enter on the last cell focuses Save. The page owns the values.
 */
const open = defineModel<boolean>('open', { required: true });
const props = withDefaults(
  defineProps<{
    title: string;
    /** A short note after the title, such as Add or Edit. */
    subtitle?: string;
    rows: readonly DeskSettingsRow[];
    read: (key: string) => unknown;
    saving?: boolean;
    readonly?: boolean;
    saveLabel?: string;
    cancelLabel?: string;
    message?: string;
    /** `data-desk-field` of the settings grid, for focus targets. */
    fieldId?: string;
    /** Where Enter on the last cell goes, such as a grid below the sheet. Return false to fall back to Save. */
    exitTo?: () => boolean;
    /** Return false to keep the dialog open, for an unsaved-changes question. */
    beforeClose?: () => boolean | Promise<boolean>;
  }>(),
  { saving: false, readonly: false, saveLabel: 'Save', cancelLabel: 'Cancel' },
);
const emit = defineEmits<{ change: [key: string, value: unknown]; save: []; close: [] }>();

const grid = ref<{ commitOpen: () => void } | null>(null);
const saveButton = ref<DeskButtonApi | null>(null);
let closing = false;

function focusSave(): boolean {
  saveButton.value?.focus();
  return saveButton.value != null;
}

function leaveGrid(): boolean {
  return props.exitTo?.() === true || focusSave();
}

function onChange(key: string, value: unknown): void {
  emit('change', key, value);
}

function onSave(): void {
  if (props.saving || props.readonly) return;
  grid.value?.commitOpen();
  emit('save');
}

function finishClose(): void {
  closing = true;
  open.value = false;
  emit('close');
  closing = false;
}

async function requestClose(): Promise<void> {
  if (closing) return;
  const answer = props.beforeClose ? props.beforeClose() : true;
  if (!(await answer)) return;
  finishClose();
}

/** Escape and a click outside already closed the panel. Ask, and reopen when the page says to stay. */
function onDialogClose(): void {
  if (closing) return;
  const answer = props.beforeClose ? props.beforeClose() : true;
  if (answer === true) {
    emit('close');
    return;
  }
  open.value = true;
  if (answer === false) return;
  void answer.then((ok) => {
    if (!ok || closing) return;
    finishClose();
  });
}

const keys: Record<string, DeskHandlerInput> = {
  'action-cancel': () => void requestClose(),
};
</script>
