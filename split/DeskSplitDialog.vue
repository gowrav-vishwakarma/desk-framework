<template>
  <DeskDialog v-model:open="open" panel-class="is-sheet" :keys="fillerKeys" @close="cancel" @accept="ok">
    <div class="desk-split">
      <h3>{{ title }}</h3>
      <slot name="toolbar" />
      <div class="desk-split-bar">
        <span>Target {{ shown(target) }}</span>
        <span>Entered {{ shown(check.entered) }}</span>
        <span :class="{ short: !check.ok || Boolean(failure || extra) || check.remaining > 0 }">{{ failure || extra || check.message || 'Assigned' }}</span>
        <button v-for="filler in fillers" :key="filler.id" type="button" @click="runFiller(filler)">{{ filler.label }}</button>
      </div>
      <div class="desk-split-grid">
        <DeskGrid
          name="split-lines"
          ref="gridRef"
          v-model:rows="gridRows"
          mode="entry"
          :columns="columns"
          :column-picker="false"
          :min-rows="1"
          :exit-on-blank="policy !== 'match'"
          :exit-when-blank="policy === 'match' ? '' : 'quantity'"
          :block-new-row="blockAnotherRow"
          :exit-to="focusOk"
          :new-row="newRow"
          :row-key="keyOf"
          :hint="hint"
          @dialog="onDialog"
        />
      </div>
      <slot name="aside" />
      <div>
        <DeskButton ref="okButton" data-desk-field="split-ok" data-form-save-btn :loading="saving" @click="ok">
          {{ saving ? 'Saving…' : 'OK' }}
        </DeskButton>
        <button type="button" data-desk-field="split-cancel" @click="cancel">Cancel</button>
      </div>
    </div>
    <DeskConfirmDialog
      v-model:open="confirmOpen"
      title="Change quantity"
      :message="confirmMessage"
      @yes="commit"
      @no="focusOk"
    />
  </DeskDialog>
</template>

<script setup lang="ts" generic="T extends DeskSplitRow">
import { computed, ref, watch } from 'vue';
import type { DeskGridApi } from '../grid/types';
import DeskButton from '../form/DeskButton.vue';
import type { DeskButtonApi } from '../form/deskTask';
import DeskConfirmDialog from '../form/DeskConfirmDialog.vue';
import DeskDialog from '../form/DeskDialog.vue';
import DeskGrid from '../grid/DeskGrid.vue';
import type { DeskColumn, DeskGridRow } from '../grid/types';
import type { DeskHandlerInput } from '../keys/layers';
import { splitCheck, splitEntered, type DeskSplitFiller, type DeskSplitMode, type DeskSplitPolicy, type DeskSplitRow } from './math';

const open = defineModel<boolean>('open', { required: true });
const rows = defineModel<T[]>('rows', { required: true });

const props = withDefaults(
  defineProps<{
    title: string;
    target: number;
    columns: DeskColumn[];
    mode?: DeskSplitMode;
    /** `match` keeps the target. `follow` and `confirm` let the rows set it. */
    policy?: DeskSplitPolicy;
    /** Builds a row for the unassigned quantity. `previous` is the last row, when there is one. */
    blank: (remaining: number, previous: T | undefined) => T;
    fillers?: DeskSplitFiller<T>[];
    /** Extra rejection on top of the quantity check. Return a message, or null when the rows are fine. */
    check?: (rows: T[]) => string | null;
    /**
     * Runs on OK before the rows are handed back, such as saving new masters the rows name.
     * It may update the rows. A message keeps the dialog open and is shown in the bar.
     */
    beforeDone?: (rows: T[]) => Promise<string | null>;
    rowKey?: (row: DeskGridRow) => string;
  }>(),
  { mode: 'atMost', policy: 'match', fillers: () => [] },
);

const emit = defineEmits<{
  done: [rows: T[]];
  cancel: [];
  dialog: [payload: { dialog: string; row: DeskGridRow; rowIndex: number; columnId: string }];
}>();

const gridRows = computed({
  get: () => rows.value as unknown as DeskGridRow[],
  set: (value: DeskGridRow[]) => {
    rows.value = value as unknown as T[];
  },
});

const check = computed(() => splitCheck(props.target, rows.value, props.mode, props.policy));
const extra = computed(() => props.check?.(rows.value) ?? null);
const confirmOpen = ref(false);
const confirmMessage = ref('');
const saving = ref(false);
const failure = ref('');

watch(rows, () => {
  if (!saving.value) failure.value = '';
}, { deep: true });

watch(open, (shown) => {
  if (shown) failure.value = '';
});
const hint = computed(() =>
  props.policy === 'match'
    ? 'Enter moves across · a short quantity adds a row · a matched quantity moves to OK'
    : 'Enter moves across · Enter on the last cell adds a row · Enter on an empty quantity moves to OK',
);

const fillerKeys = computed<Record<string, DeskHandlerInput>>(() => {
  const keys: Record<string, DeskHandlerInput> = {};
  for (const filler of props.fillers) {
    if (filler.actionId) keys[filler.actionId] = () => runFiller(filler);
  }
  return keys;
});

const okButton = ref<DeskButtonApi | null>(null);
const gridRef = ref<DeskGridApi | null>(null);

function focusColumn(columnId: string): void {
  gridRef.value?.focusCell(0, columnId);
}

defineExpose({ focusColumn });

function quantityMatched(): boolean {
  return check.value.ok && check.value.remaining <= 1e-6;
}

function blockAnotherRow(): boolean {
  return props.policy === 'match' && quantityMatched();
}

function focusOk(): boolean {
  okButton.value?.focus();
  return okButton.value != null;
}

function shown(value: number): string {
  const rounded = Math.round(value * 1e6) / 1e6;
  return String(rounded);
}

function keyOf(row: DeskGridRow): string {
  if (props.rowKey) return props.rowKey(row);
  return String(row.id ?? '');
}

function keptRows(): T[] {
  if (props.policy === 'match') return rows.value;
  return rows.value.filter((row) => Number(row.quantity) > 0);
}

function newRow(): DeskGridRow {
  const previous = rows.value[rows.value.length - 1];
  const remaining = props.policy === 'match'
    ? Math.max(0, props.target - rows.value.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0))
    : 0;
  const row = props.blank(remaining, previous) as unknown as DeskGridRow;
  if (props.policy !== 'match') row.quantity = null;
  return row;
}

function runFiller(filler: DeskSplitFiller<T>): void {
  rows.value = filler.fill(props.target, rows.value);
}

function onDialog(payload: { dialog: string; row: DeskGridRow; rowIndex: number; columnId: string }): void {
  emit('dialog', payload);
}

async function commit(): Promise<void> {
  const saved = keptRows();
  if (saved.length === 0 || saving.value) return;
  if (props.beforeDone) {
    saving.value = true;
    try {
      failure.value = (await props.beforeDone(saved)) ?? '';
    } catch (err) {
      failure.value = err instanceof Error ? err.message : 'Could not save.';
    } finally {
      saving.value = false;
    }
    if (failure.value) {
      focusOk();
      return;
    }
  }
  rows.value = saved;
  emit('done', saved);
  open.value = false;
}

function ok(): void {
  if (saving.value || !check.value.ok || extra.value) return;
  const saved = keptRows();
  if (saved.length === 0) return;
  if (props.policy === 'confirm' && Math.abs(splitEntered(saved) - props.target) > 1e-6) {
    confirmMessage.value = `Change item quantity from ${shown(props.target)} to ${shown(splitEntered(saved))}?`;
    confirmOpen.value = true;
    return;
  }
  void commit();
}

function cancel(): void {
  emit('cancel');
  open.value = false;
}
</script>
