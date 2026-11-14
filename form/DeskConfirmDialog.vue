<template>
  <DeskDialog
    name="confirm"
    v-model:open="open"
    :initial-focus="tone === 'danger' ? 'confirm-no' : 'confirm-yes'"
    @close="no"
    @accept="onAccept"
  >
    <h3>{{ title }}</h3>
    <p>{{ message }}</p>
    <ul v-if="lines.length" class="desk-confirm-details">
      <li v-for="(line, index) in lines" :key="index">{{ line }}</li>
    </ul>
    <button type="button" data-desk-field="confirm-yes" data-form-save-btn :class="deskActionClass(tone ? { tone } : {})" @click="yes">
      {{ yesLabel }}
    </button>
    <button type="button" data-desk-field="confirm-no" @click="no">{{ noLabel }}</button>
  </DeskDialog>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import { deskActionClass } from '../grid/actionClass';
import type { DeskActionTone } from '../grid/types';
import DeskDialog from './DeskDialog.vue';

const open = defineModel<boolean>('open', { required: true });
const props = withDefaults(
  defineProps<{
    title: string;
    message: string;
    details?: readonly string[];
    yesLabel?: string;
    noLabel?: string;
    tone?: DeskActionTone;
  }>(),
  { details: () => [], yesLabel: 'Yes', noLabel: 'No' },
);
const emit = defineEmits<{ yes: []; no: [] }>();
const lines = computed(() => props.details ?? []);
let answered = false;

watch(open, (shown) => {
  if (shown) answered = false;
});

function answer(kind: 'yes' | 'no'): void {
  if (answered) return;
  answered = true;
  open.value = false;
  if (kind === 'yes') emit('yes');
  else emit('no');
}

function yes(): void {
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
