<template>
  <div class="cond-rule" :class="{ incomplete: !ruleComplete(rule) }">
    <span class="cond-field">
      <template v-if="fieldMode === 'formula'">
        <FormulaInput
          class="cond-formula"
          :model-value="rule.field"
          :scope="scope"
          placeholder="coalesce(status, '')"
          @update:model-value="(field) => patch({ field })"
        />
        <button
          type="button"
          class="studio-icon-btn"
          title="Test a column instead"
          @click="fieldMode = 'pick'"
        >
          <StudioIcon name="number" />
        </button>
      </template>
      <PathButton
        v-else-if="scope.model"
        ref="fieldPick"
        compact
        :model-value="rule.field"
        :model="scope.model"
        :catalog="draft.catalog.value"
        placeholder="Choose a field…"
        @update:model-value="setField"
      />
      <PickButton
        v-else
        ref="fieldPick"
        compact
        :model-value="rule.field"
        :items="columnItems(scope.columns)"
        placeholder="Choose a column…"
        empty="The step this one reads has no columns yet"
        @update:model-value="setField"
      >
        <template #footer="{ close }">
          <button type="button" class="pick-footer-btn" @click="useFormula(close)">
            <StudioIcon name="formula" /> Test a formula instead
          </button>
        </template>
      </PickButton>
    </span>

    <select
      class="cond-op"
      :value="rule.op"
      :disabled="!rule.field"
      :aria-label="'Comparison'"
      @change="setOp(($event.target as HTMLSelectElement).value as ConditionOp)"
    >
      <option v-for="item in operators" :key="item.op" :value="item.op">{{ item.label }}</option>
    </select>

    <template v-if="rule.field">
      <ConditionValueInput
        v-if="takes === 'one' || takes === 'two'"
        :value="rule.value"
        :type="valueType"
        :values="values"
        :scope="scope"
        :text-only="textOnly"
        @update="(value) => patch({ value })"
      />
      <template v-if="takes === 'two'">
        <span class="cond-and">and</span>
        <ConditionValueInput
          :value="rule.value2"
          :type="valueType"
          :values="values"
          :scope="scope"
          @update="(value2) => patch({ value2 })"
        />
      </template>
      <ConditionListInput
        v-if="takes === 'list'"
        :rule="rule"
        :type="valueType"
        :values="values"
        @update="patch"
      />
    </template>

    <span class="cond-tools">
      <button
        type="button"
        class="studio-icon-btn"
        title="Write this rule as a formula"
        @click="emit('formula')"
      >
        <StudioIcon name="formula" />
      </button>
      <button
        type="button"
        class="studio-icon-btn danger"
        title="Remove this rule"
        @click="emit('remove')"
      >
        <StudioIcon name="close" />
      </button>
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import ConditionListInput from './ConditionListInput.vue';
import ConditionValueInput from './ConditionValueInput.vue';
import {
  newRule,
  operatorInfo,
  operatorsFor,
  patchRule,
  ruleComplete,
  withOperator,
  type ConditionOp,
  type ConditionRule,
  type RulePatch,
} from './condition';
import { exprTextType, isPlainName, type ValueType } from './expr';
import FormulaInput from './FormulaInput.vue';
import PathButton from './PathButton.vue';
import PickButton from './PickButton.vue';
import { columnItems } from './pickItems';
import { scopeType, scopeValues, type NameScope } from './scope';
import StudioIcon from './StudioIcon.vue';
import { useReportDraftContext } from './useReportDraft';

/** One rule: what is tested, how, and against what. Each edit hands back the changed rule with `update`. */
const props = withDefaults(
  defineProps<{ rule: ConditionRule; scope: NameScope; autoOpen?: boolean | undefined }>(),
  { autoOpen: false },
);
const emit = defineEmits<{ update: [rule: ConditionRule]; remove: []; formula: [] }>();

const draft = useReportDraftContext();
const fieldPick = ref<{ open: () => void } | null>(null);
const fieldMode = ref<'pick' | 'formula'>(
  !props.rule.field || isPlainName(props.rule.field) ? 'pick' : 'formula',
);

const typeOf = (name: string): ValueType => scopeType(props.scope, draft.catalog.value, name);
const fieldType = computed(
  (): ValueType =>
    !props.rule.field
      ? 'unknown'
      : isPlainName(props.rule.field)
        ? typeOf(props.rule.field)
        : exprTextType(props.rule.field, typeOf),
);
const values = computed(() =>
  props.rule.field && isPlainName(props.rule.field)
    ? scopeValues(props.scope, draft.catalog.value, props.rule.field)
    : undefined,
);

const operators = computed(() => {
  const list = operatorsFor(fieldType.value);
  // A rule read from a formula keeps its operator even when the type suggests others.
  return list.some((item) => item.op === props.rule.op)
    ? list
    : [...list, operatorInfo(props.rule.op)];
});
const takes = computed(() => operatorInfo(props.rule.op).takes);
const textOnly = computed(() =>
  ['contains', 'notContains', 'starts', 'ends'].includes(props.rule.op),
);
/** Values typed for contains are text, whatever the column. */
const valueType = computed((): ValueType => (textOnly.value ? 'text' : fieldType.value));

/** Hand back `next` as this rule (same key, so the row keeps its place and focus). */
function replace(next: ConditionRule): void {
  emit('update', { ...next, key: props.rule.key });
}

function setField(field: string): void {
  const before = fieldType.value;
  const type = !field
    ? 'unknown'
    : isPlainName(field)
      ? typeOf(field)
      : exprTextType(field, typeOf);
  const fits = operatorsFor(type).some((item) => item.op === props.rule.op);
  // Same kind of column: keep how it is compared. Another kind: start the way that kind is usually tested.
  if (props.rule.field && fits && type === before) replace({ ...props.rule, field });
  else replace(newRule(field, type, draft.params.value));
}

/** Test a formula: the picker closes and the formula box takes its place. */
function useFormula(close: () => void): void {
  close();
  fieldMode.value = 'formula';
}

function setOp(op: ConditionOp): void {
  replace(withOperator(props.rule, op));
}

function patch(change: RulePatch): void {
  replace(patchRule(props.rule, change));
}

onMounted(() => {
  if (props.autoOpen && !props.rule.field) fieldPick.value?.open();
});
</script>
