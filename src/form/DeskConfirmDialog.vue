<template>
  <DeskDialog
    name="confirm"
    v-model:open="open"
    :initial-focus="fields.length ? `confirm-${fields[0]!.id}` : tone === 'danger' ? 'confirm-no' : 'confirm-yes'"
    @close="no"
    @accept="onAccept"
  >
    <h3>{{ title }}</h3>
    <p>{{ message }}</p>
    <ul v-if="lines.length" class="desk-confirm-details">
      <li v-for="(line, index) in lines" :key="index">{{ line }}</li>
    </ul>
    <DeskField
      v-for="(field, index) in fields"
      :key="field.id"
      v-model="values[field.id]"
      :field-id="`confirm-${field.id}`"
      :label="field.label"
      :kind="field.kind ?? 'text'"
      :required="field.required === true"
      :initial="index === 0"
    />
    <p v-if="missing" class="desk-error">{{ missing }}</p>
    <button type="button" data-desk-field="confirm-yes" data-form-save-btn :class="deskActionClass(tone ? { tone } : {})" @click="yes">
      {{ yesLabel }}
    </button>
    <button type="button" data-desk-field="confirm-no" @click="no">{{ noLabel }}</button>
  </DeskDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { deskActionClass } from '../grid/actionClass';
import type { DeskActionTone } from '../grid/types';
import DeskDialog from './DeskDialog.vue';
import DeskField from './DeskField.vue';
import type { DeskConfirmField } from './confirm';

const open = defineModel<boolean>('open', { required: true });
const props = withDefaults(
  defineProps<{
    title: string;
    message: string;
    details?: readonly string[];
    yesLabel?: string;
    noLabel?: string;
    tone?: DeskActionTone;
    /** Values asked with the question; typed into `values` (the request's own object). */
    fields?: readonly DeskConfirmField[];
    values?: Record<string, string>;
  }>(),
  { details: () => [], yesLabel: 'Yes', noLabel: 'No', fields: () => [], values: () => ({}) },
);
const emit = defineEmits<{ yes: []; no: [] }>();
const lines = computed(() => props.details ?? []);
let answered = false;
const missing = ref('');

watch(open, (shown) => {
  if (shown) {
    answered = false;
    missing.value = '';
  }
});

function answer(kind: 'yes' | 'no'): void {
  if (answered) return;
  answered = true;
  open.value = false;
  if (kind === 'yes') emit('yes');
  else emit('no');
}

function yes(): void {
  const empty = props.fields.filter((field) => field.required && !String(props.values[field.id] ?? '').trim());
  if (empty.length) {
    missing.value = `${empty.map((field) => field.label).join(', ')}: required`;
    return;
  }
  answer('yes');
}

function no(): void {
  answer('no');
}

/** Ctrl+S confirms a normal question. A danger question waits for the OK button. */
function onAccept(): void {
  if (props.tone === 'danger') return;
  yes();
}
</script>
