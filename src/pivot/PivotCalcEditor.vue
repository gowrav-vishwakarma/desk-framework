<template>
  <DeskDialog
    v-model:open="open"
    panel-class="is-wide"
    initial-focus="pivot-calc-label"
    @accept="save"
  >
    <div class="desk-pivot-calc">
      <h3>{{ calc ? 'Edit calculated field' : 'New calculated field' }}</h3>
      <p class="desk-muted">
        A formula over other fields' totals, worked out in every cell: a category's GP % is its
        gross profit over its sales, never a sum of percentages.
      </p>
      <label class="desk-pivot-calc-row">
        <span>Name</span>
        <input v-model="label" type="text" data-desk-field="pivot-calc-label" placeholder="GP %" />
      </label>
      <label class="desk-pivot-calc-row">
        <span>Formula</span>
        <input
          ref="box"
          v-model="formula"
          type="text"
          class="desk-pivot-calc-formula"
          :class="{ 'is-wrong': problem }"
          data-desk-field="pivot-calc-formula"
          placeholder="[Gross profit] / [Taxable value] * 100"
          spellcheck="false"
        />
      </label>
      <p v-if="problem" class="desk-error desk-pivot-calc-check">
        <span class="desk-pivot-calc-at"
          >{{ formula.slice(0, problem.at)
          }}<mark>{{ formula.slice(problem.at, problem.at + 1) || ' ' }}</mark></span
        >
        {{ problem.error }}
      </p>
      <p v-else-if="preview !== null" class="desk-pivot-calc-check">
        Grand total over the loaded rows: <strong>{{ preview }}</strong>
      </p>
      <div class="desk-pivot-calc-insert">
        <span class="desk-muted">Insert</span>
        <button
          v-for="op in OPERATORS"
          :key="op.text"
          type="button"
          class="desk-pivot-calc-op"
          :title="op.title"
          @click="insert(op.text)"
        >
          {{ op.label }}
        </button>
      </div>
      <div class="desk-pivot-calc-fields">
        <button
          v-for="field in numberFields"
          :key="field.id"
          type="button"
          :data-desk-field="`pivot-calc-field:${field.id}`"
          @click="insert(`[${field.label}]`)"
        >
          {{ field.label }}
        </button>
        <span v-if="!numberFields.length" class="desk-muted"
          >This report has no number fields.</span
        >
      </div>
      <div class="desk-pivot-calc-row">
        <span>Show as</span>
        <label><input v-model="format" type="radio" value="number" /> Number</label>
        <label><input v-model="format" type="radio" value="percent" /> Percent (12.50%)</label>
      </div>
      <p class="desk-muted desk-pivot-calc-examples">
        Average rate: <code>[Taxable value] / [Qty]</code> · Margin on cost:
        <code>([Taxable value] - [Purchase cost]) / [Purchase cost] * 100</code>
      </p>
      <div class="desk-footer-bar">
        <button type="button" data-desk-field="pivot-calc-save" :disabled="!ready" @click="save">
          {{ calc ? 'Save' : 'Add to Values' }}
        </button>
        <button v-if="calc" type="button" @click="remove">Delete field</button>
        <button type="button" data-desk-field="pivot-calc-cancel" @click="open = false">Cancel</button>
      </div>
    </div>
  </DeskDialog>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { formatDeskDecimal } from '../currency/money';
import DeskDialog from '../form/DeskDialog.vue';
import {
  evaluatePivotFormula,
  parsePivotFormula,
  pivotCalcId,
  type PivotCalcField,
} from './pivotCalc';
import { pivotFieldSum } from './pivotCube';
import type { PivotField } from './pivotTypes';

/** Write or change a calculated field: a formula over other fields' sums. */
const open = defineModel<boolean>('open', { required: true });
const props = defineProps<{
  /** The pivot's own fields (calculated ones included, which a formula may not use). */
  fields: readonly PivotField[];
  facts: readonly Record<string, unknown>[];
  /** The facts are grouped rows with these key columns. */
  grouped?: ReadonlySet<string> | undefined;
  /** The field being changed; null for a new one. */
  calc: PivotCalcField | null;
  /** Ids of the calculated fields already there. */
  taken: readonly string[];
}>();
const emit = defineEmits<{ save: [calc: PivotCalcField]; remove: [id: string] }>();

const OPERATORS = [
  { label: '+', text: ' + ', title: 'Add' },
  { label: '−', text: ' - ', title: 'Subtract' },
  { label: '×', text: ' * ', title: 'Multiply' },
  { label: '÷', text: ' / ', title: 'Divide (by zero leaves the cell empty)' },
  { label: '( )', text: '()', title: 'Brackets' },
  { label: '× 100', text: ' * 100', title: 'As a percentage' },
] as const;

const label = ref('');
const formula = ref('');
const format = ref<'number' | 'percent'>('number');
const box = ref<HTMLInputElement | null>(null);

watch(open, (shown) => {
  if (!shown) return;
  label.value = props.calc?.label ?? '';
  formula.value = props.calc?.formula ?? '';
  format.value = props.calc?.format ?? 'number';
});

const numberFields = computed(() =>
  props.fields.filter((field) => field.kind === 'number' && !field.calc),
);
const parsed = computed(() => parsePivotFormula(formula.value, props.fields));
const problem = computed(() => (formula.value.trim() && !parsed.value.ok ? parsed.value : null));
const ready = computed(() => label.value.trim() !== '' && parsed.value.ok);

/** The formula over every loaded row, as its grand total will read. */
const preview = computed((): string | null => {
  const result = parsed.value;
  if (!result.ok) return null;
  const sums = result.formula.refs.map((ref) => pivotFieldSum(props.facts, ref, props.grouped));
  const value = evaluatePivotFormula(result.formula, sums);
  if (value === null) return 'empty (a division by zero)';
  return format.value === 'percent'
    ? `${formatDeskDecimal(value, 2)}%`
    : formatDeskDecimal(value, 2);
});

/** Put text at the cursor; brackets go round the selection. */
function insert(text: string): void {
  const input = box.value;
  const start = input?.selectionStart ?? formula.value.length;
  const end = input?.selectionEnd ?? start;
  const picked = formula.value.slice(start, end);
  const piece = text === '()' ? `(${picked})` : text;
  formula.value = `${formula.value.slice(0, start)}${piece}${formula.value.slice(end)}`;
  const caret = start + (text === '()' && !picked ? 1 : piece.length);
  void nextTick(() => {
    input?.focus();
    input?.setSelectionRange(caret, caret);
  });
}

function save(): void {
  const result = parsed.value;
  if (!ready.value || !result.ok) return;
  const name = label.value.trim();
  emit('save', {
    id: props.calc?.id ?? pivotCalcId(name, props.taken),
    label: name,
    formula: formula.value.trim(),
    refs: result.formula.refs,
    format: format.value,
  });
  open.value = false;
}

function remove(): void {
  if (props.calc) emit('remove', props.calc.id);
  open.value = false;
}
</script>
