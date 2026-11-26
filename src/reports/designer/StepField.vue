<template>
  <div class="sf-field" :class="[`kind-${field.kind}`, { bad: problem }]">
    <label class="sf-label" :for="id">
      {{ field.label }}<span v-if="field.optional" class="sf-optional">optional</span>
      <span v-if="field.hint" class="sf-hint-icon" :title="field.hint">?</span>
    </label>

    <input
      v-if="field.kind === 'text'"
      :id="id"
      type="text"
      class="sf-input"
      :value="text(value)"
      :placeholder="field.placeholder ?? ''"
      :data-desk-field="fieldId"
      @input="set(($event.target as HTMLInputElement).value)"
    />

    <input
      v-else-if="field.kind === 'name'"
      :id="id"
      type="text"
      class="sf-input sf-name"
      :value="text(value)"
      :placeholder="field.placeholder ?? field.suggest?.(target) ?? 'name'"
      spellcheck="false"
      autocomplete="off"
      :data-desk-field="fieldId"
      @input="setName(($event.target as HTMLInputElement).value)"
    />

    <input
      v-else-if="field.kind === 'number'"
      :id="id"
      type="number"
      class="sf-input sf-number"
      :value="text(value)"
      :placeholder="field.placeholder ?? ''"
      :data-desk-field="fieldId"
      @input="setNumber(($event.target as HTMLInputElement).value)"
    />

    <label v-else-if="field.kind === 'bool'" class="sf-switch">
      <input
        :id="id"
        type="checkbox"
        :checked="value === true"
        :data-desk-field="fieldId"
        @change="set(($event.target as HTMLInputElement).checked || undefined)"
      />
      <span>{{ value === true ? 'Yes' : 'No' }}</span>
    </label>

    <span
      v-else-if="field.kind === 'choice' && segmented"
      class="cond-seg sf-seg"
      role="radiogroup"
      :aria-label="field.label"
    >
      <button
        v-for="option in field.options"
        :key="option.value"
        type="button"
        role="radio"
        :aria-checked="text(value) === option.value"
        :class="{ on: text(value) === option.value }"
        :title="option.help ?? ''"
        @click="set(option.value)"
      >
        {{ option.label }}
      </button>
    </span>
    <select
      v-else-if="field.kind === 'choice'"
      :id="id"
      class="sf-input"
      :value="text(value)"
      :data-desk-field="fieldId"
      @change="set(($event.target as HTMLSelectElement).value)"
    >
      <option
        v-for="option in field.options"
        :key="option.value"
        :value="option.value"
        :title="option.help ?? ''"
      >
        {{ option.label }}
      </option>
    </select>

    <PickButton
      v-else-if="field.kind === 'stage'"
      :model-value="text(value)"
      :items="stepItems(stages)"
      placeholder="Choose a step…"
      empty="There is no step before this one"
      show-sub
      :invalid="Boolean(problem)"
      :field-id="fieldId"
      @update:model-value="set"
    />

    <PickButton
      v-else-if="field.kind === 'column'"
      :model-value="text(value)"
      :items="columnItems(scopeColumns)"
      placeholder="Choose a column…"
      empty="Choose the step it reads first"
      show-sub
      :invalid="Boolean(problem)"
      :field-id="fieldId"
      @update:model-value="set"
    />

    <PickChips
      v-else-if="field.kind === 'columns'"
      :model-value="list"
      :items="columnItems(scopeColumns)"
      add-label="Choose columns"
      empty="Choose the step it reads first"
      :invalid="Boolean(problem)"
      :field-id="fieldId"
      @update:model-value="set"
    />

    <FormulaInput
      v-else-if="field.kind === 'formula'"
      :model-value="text(value)"
      :scope="scope"
      :prefer-column="field.preferColumn === true"
      :placeholder="field.placeholder ?? ''"
      :invalid="Boolean(problem)"
      :field-id="fieldId"
      @update:model-value="set"
    />

    <ConditionEditor
      v-else-if="field.kind === 'condition'"
      :model-value="text(value)"
      :scope="scope"
      :invalid="Boolean(problem)"
      :field-id="fieldId"
      :empty-text="
        field.optional ? 'No condition: every row counts.' : 'Add the rule rows must meet.'
      "
      @update:model-value="set"
    />

    <OrderList
      v-else-if="field.kind === 'order'"
      :items="orderItems"
      :scope="scope"
      :problems="childPaths"
      :field-id="fieldId"
      @update="set"
    />

    <MapList
      v-else-if="field.kind === 'map'"
      :value="mapValue"
      :targets="columns.self"
      :scope="scope"
      @update="set"
    />

    <FoldList
      v-else-if="field.kind === 'list'"
      :items="items"
      :blank="field.blank ?? (() => ({}))"
      :summary="(item) => field.summary?.(item) ?? ''"
      :problems="itemProblems"
      :add-label="`Add ${singular}`"
      :field-id="fieldId"
      @update="set"
    >
      <template #default="{ item, index }">
        <StepForm
          :fields="field.of ?? []"
          :target="item"
          :columns="columnsOfItem(item)"
          :stages="stages"
          :issues="issues"
          :path="`${path}${field.key}.${index}.`"
        />
      </template>
    </FoldList>

    <p v-if="problem" class="sf-problem"><StudioIcon name="warn" /> {{ problem }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Rdl2Stage } from '../language';
import type { Issue } from './checks';
import ConditionEditor from './ConditionEditor.vue';
import { readKey, text, writeKey, type ColumnsOf, type StudioField } from './fields';
import FoldList from './FoldList.vue';
import FormulaInput from './FormulaInput.vue';
import MapList from './MapList.vue';
import { cleanName } from './naming';
import OrderList, { type OrderItem } from './OrderList.vue';
import PickButton from './PickButton.vue';
import PickChips from './PickChips.vue';
import { columnItems, stepItems } from './pickItems';
import type { ColumnInfo } from './schema';
import type { NameScope } from './scope';
import StepForm from './StepForm.vue';
import StudioIcon from './StudioIcon.vue';
import { useReportDraftContext } from './useReportDraft';

/** One setting with the widget for its kind, and its problem under it. */
const props = defineProps<{
  field: StudioField;
  target: Record<string, unknown>;
  columns: Record<ColumnsOf, readonly ColumnInfo[]>;
  stages: readonly Rdl2Stage[];
  issues: readonly Issue[];
  path: string;
}>();

const draft = useReportDraftContext();
const at = computed(() => `${props.path}${props.field.key}`);
const id = computed(() => `sf-${at.value.replace(/\./g, '-')}`);
const fieldId = computed(() => `studio-${at.value}`);
const value = computed(() => readKey(props.target, props.field.key));
const list = computed(() => (Array.isArray(value.value) ? (value.value as string[]) : []));
const items = computed(() =>
  Array.isArray(value.value) ? (value.value as Record<string, unknown>[]) : [],
);
const orderItems = computed(() => (Array.isArray(value.value) ? (value.value as OrderItem[]) : []));
const mapValue = computed(() =>
  value.value && typeof value.value === 'object' && !Array.isArray(value.value)
    ? (value.value as Record<string, string>)
    : undefined,
);
const scopeColumns = computed(() => props.columns[props.field.columnsOf ?? 'from']);
const scope = computed((): NameScope => ({ columns: scopeColumns.value }));
const singular = computed(() => props.field.label.replace(/s$/, '').toLowerCase());

/** Choices short enough to show side by side. */
const segmented = computed(() => {
  const options = props.field.options ?? [];
  return options.length <= 4 && options.reduce((n, option) => n + option.label.length, 0) <= 44;
});

/** The first problem of this setting itself (list items show theirs on their rows). */
const problem = computed(() => {
  const own = props.issues.filter(
    (issue) =>
      issue.path === at.value ||
      (props.field.kind !== 'list' && issue.path?.startsWith(`${at.value}.`)),
  );
  return own[0]?.message ?? '';
});

const childPaths = computed(() =>
  props.issues.flatMap((issue) =>
    issue.path?.startsWith(`${at.value}.`) ? [issue.path.slice(at.value.length + 1)] : [],
  ),
);

function itemProblems(index: number): number {
  const prefix = `${at.value}.${index}`;
  return props.issues.filter(
    (issue) => issue.path === prefix || issue.path?.startsWith(`${prefix}.`),
  ).length;
}

/** An item that names the step it reads (a stacked part) reads that step's columns. */
function columnsOfItem(item: Record<string, unknown>): Record<ColumnsOf, readonly ColumnInfo[]> {
  return typeof item.from === 'string'
    ? { ...props.columns, from: draft.schemas.value.get(item.from) ?? [] }
    : props.columns;
}

function set(next: unknown): void {
  writeKey(props.target, props.field.key, next, props.field.optional === true);
}

function setNumber(raw: string): void {
  set(raw === '' ? undefined : Number(raw));
}

function setName(raw: string): void {
  set(cleanName(raw));
}
</script>
