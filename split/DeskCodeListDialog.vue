<template>
  <DeskDialog v-model:open="open" panel-class="is-sheet" initial-focus="code-list" @close="cancel" @accept="ok">
    <div class="desk-split">
      <h3>{{ title }}</h3>
      <p v-if="cap > 0">{{ filled }} of {{ cap }}</p>
      <p v-if="problem" class="short">{{ problem }}</p>
      <div v-if="allowRange" class="desk-code-range" @focusin="onRangeFocus">
        <label>Prefix <input v-model="prefix" data-desk-field="code-prefix" /></label>
        <label>From <input v-model="from" data-desk-field="code-from" inputmode="numeric" /></label>
        <label>To <input v-model="to" data-desk-field="code-to" inputmode="numeric" /></label>
        <label>Digits <input v-model="pad" data-desk-field="code-pad" inputmode="numeric" /></label>
        <button type="button" @click="generate">Generate</button>
      </div>
      <div class="desk-split-grid">
        <DeskGrid
          v-model:rows="gridRows"
          field-id="code-list"
          initial
          mode="entry"
          :columns="gridColumns"
          :column-picker="false"
          :min-rows="1"
          exit-on-blank
          exit-when-blank="code"
          :block-new-row="atCap"
          :exit-to="focusOk"
          :new-row="blank"
          :row-key="rowKey"
          hint="Scan or type a code and press Enter · Enter on an empty code moves to OK · paste a list · Ctrl+D fills down"
        />
      </div>
      <div>
        <button ref="okButton" type="button" data-desk-field="code-list-ok" data-form-save-btn @click="ok">OK</button>
        <button type="button" data-desk-field="code-list-cancel" @click="cancel">Cancel</button>
      </div>
    </div>
  </DeskDialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import DeskDialog from '../form/DeskDialog.vue';
import { selectDeskControl } from '../focus/useDeskFocus';
import DeskGrid from '../grid/DeskGrid.vue';
import type { DeskColumn, DeskGridRow } from '../grid/types';
import { appendCodes, codesFromText, codesInRange, duplicateCodes, newCodeRow, type DeskCodeRow } from './codes';

const open = defineModel<boolean>('open', { required: true });
const rows = defineModel<DeskCodeRow[]>('rows', { required: true });

const props = withDefaults(
  defineProps<{
    title: string;
    /** 0 means no cap. */
    max?: number;
    allowRange?: boolean;
    /** Columns after the code. The row already has `id` and `code`. */
    extraColumns?: DeskColumn[];
  }>(),
  { max: 0, allowRange: true, extraColumns: () => [] },
);

const emit = defineEmits<{ done: [rows: DeskCodeRow[]]; cancel: [] }>();

function onRangeFocus(event: FocusEvent): void {
  selectDeskControl(event.target);
}

const okButton = ref<HTMLButtonElement | null>(null);
const prefix = ref('');
const from = ref('1');
const to = ref('1');
const pad = ref('0');
const notice = ref('');

const cap = computed(() => props.max ?? 0);
const filled = computed(() => rows.value.filter((row) => row.code.trim()).length);
const duplicates = computed(() => duplicateCodes(rows.value));
const problem = computed(() => {
  if (duplicates.value.length) return `Duplicate: ${duplicates.value.slice(0, 3).join(', ')}`;
  if (props.max > 0 && filled.value > props.max) return `At most ${props.max} codes.`;
  return notice.value;
});

const gridRows = computed({
  get: () => rows.value as unknown as DeskGridRow[],
  set: (value: DeskGridRow[]) => {
    rows.value = value as unknown as DeskCodeRow[];
  },
});

const gridColumns = computed<DeskColumn[]>(() => [
  {
    id: 'code',
    header: 'Code',
    width: 220,
    editor: 'text',
    commit: (row, text) => {
      const pasted = codesFromText(text);
      if (pasted.length <= 1) {
        row.code = text.trim();
        return;
      }
      const merged = appendCodes(
        rows.value.filter((item) => item.id !== row.id),
        pasted,
        props.max,
      );
      row.code = '';
      rows.value = merged.rows;
      notice.value = merged.capped ? `Stopped at ${props.max} codes.` : '';
    },
    error: (row) => {
      const raw = row.code;
      const code = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
      if (!code) return null;
      const count = rows.value.filter((item) => item.code.trim().toLowerCase() === code).length;
      return count > 1 ? 'Duplicate' : null;
    },
  },
  ...props.extraColumns,
]);

function rowKey(row: DeskGridRow): string {
  return String(row.id ?? '');
}

function atCap(): boolean {
  return cap.value > 0 && filled.value >= cap.value;
}

function focusOk(): boolean {
  okButton.value?.focus();
  return okButton.value != null;
}

function blank(): DeskGridRow {
  return newCodeRow() as unknown as DeskGridRow;
}

function generate(): void {
  const start = Number(from.value);
  const end = Number(to.value);
  const width = Number(pad.value);
  const merged = appendCodes(rows.value, codesInRange(prefix.value, start, end, width), props.max);
  rows.value = merged.rows.length ? merged.rows : rows.value;
  notice.value = merged.capped ? `Stopped at ${props.max} codes.` : merged.duplicates.length ? 'Some codes were already in the list.' : '';
}

function ok(): void {
  if (problem.value && (duplicates.value.length || (props.max > 0 && filled.value > props.max))) return;
  emit('done', rows.value.filter((row) => row.code.trim()));
  open.value = false;
}

function cancel(): void {
  emit('cancel');
  open.value = false;
}
</script>

<style scoped>
.short { color: var(--desk-error, #a40000); }
</style>
