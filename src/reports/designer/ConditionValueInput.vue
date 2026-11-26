<template>
  <span class="cond-value" :class="{ invalid: missing }">
    <button
      ref="kindButton"
      type="button"
      class="cond-kind"
      :title="`${KIND_LABEL[kind]} — click to change`"
      @click="kindOpen = !kindOpen"
    >
      {{ KIND_MARK[kind] }}
    </button>
    <StudioPopup v-model:open="kindOpen" :anchor="kindButton" :width="220">
      <PickList :items="kindItems" :selected="[kind]" :searchable="false" @pick="setKind" />
    </StudioPopup>

    <template v-if="kind === 'value'">
      <select
        v-if="type === 'boolean'"
        :value="typed"
        @change="setTyped(($event.target as HTMLSelectElement).value)"
      >
        <option value="" disabled>Choose…</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
      <select
        v-else-if="values?.length"
        :value="typed"
        @change="setTyped(($event.target as HTMLSelectElement).value)"
      >
        <option value="" disabled>Choose…</option>
        <option v-for="item in values" :key="item" :value="item">{{ item }}</option>
        <option v-if="typed && !values.includes(typed)" :value="typed">{{ typed }}</option>
      </select>
      <input
        v-else
        :type="type === 'number' ? 'number' : type === 'date' ? 'date' : 'text'"
        :value="typed"
        :placeholder="type === 'number' ? '0' : 'value'"
        step="any"
        @input="setTyped(($event.target as HTMLInputElement).value)"
      />
    </template>
    <PickButton
      v-else-if="kind === 'param'"
      compact
      :model-value="value?.kind === 'param' ? value.id : ''"
      :items="paramItems(draft.params.value, type)"
      placeholder="Choose an input…"
      empty="The report has no inputs; add one on the Inputs card"
      @update:model-value="(id) => emit('update', { kind: 'param', id })"
    />
    <template v-else-if="kind === 'column'">
      <PathButton
        v-if="scope.model"
        compact
        :model-value="value?.kind === 'column' ? value.name : ''"
        :model="scope.model"
        :catalog="draft.catalog.value"
        @update:model-value="(name) => emit('update', { kind: 'column', name })"
      />
      <PickButton
        v-else
        compact
        :model-value="value?.kind === 'column' ? value.name : ''"
        :items="columnItems(scope.columns)"
        placeholder="Choose a column…"
        @update:model-value="(name) => emit('update', { kind: 'column', name })"
      />
    </template>
    <FormulaInput
      v-else
      class="cond-formula"
      :model-value="value?.kind === 'formula' ? value.text : ''"
      :scope="scope"
      placeholder="addDays(@from, -30)"
      @update:model-value="
        (text) => emit('update', text.trim() ? { kind: 'formula', text } : undefined)
      "
    />
  </span>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ConditionValue } from './condition';
import type { ValueType } from './expr';
import FormulaInput from './FormulaInput.vue';
import PathButton from './PathButton.vue';
import PickButton from './PickButton.vue';
import { columnItems, paramItems, type PickItem } from './pickItems';
import PickList from './PickList.vue';
import type { NameScope } from './scope';
import StudioPopup from './StudioPopup.vue';
import { useReportDraftContext } from './useReportDraft';

type Kind = ConditionValue['kind'];

/**
 * One value of a rule, from where the user says: typed in (a box for the column's type, or its
 * fixed values), one of the report's inputs, another column, or a formula. `textOnly` is for
 * contains / starts / ends, which take typed text or an input.
 */
const props = withDefaults(
  defineProps<{
    value: ConditionValue | undefined;
    type: ValueType;
    values?: string[] | undefined;
    scope: NameScope;
    textOnly?: boolean | undefined;
  }>(),
  { textOnly: false },
);
const emit = defineEmits<{ update: [value: ConditionValue | undefined] }>();

const draft = useReportDraftContext();
const KIND_MARK: Record<Kind, string> = { value: 'abc', param: '@', column: 'col', formula: 'ƒx' };
const KIND_LABEL: Record<Kind, string> = {
  value: 'A value you type',
  param: 'An input of the report',
  column: 'Another column',
  formula: 'A formula',
};

const kindButton = ref<HTMLButtonElement | null>(null);
const kindOpen = ref(false);
/** The chosen source before a value is set (a fresh "input" with nothing picked yet). */
const chosen = ref<Kind>(props.value?.kind ?? 'value');
watch(
  () => props.value?.kind,
  (next) => {
    if (next) chosen.value = next;
  },
);
const kind = computed<Kind>(() => props.value?.kind ?? chosen.value);

const kindItems = computed((): PickItem[] =>
  (props.textOnly
    ? (['value', 'param'] as Kind[])
    : (['value', 'param', 'column', 'formula'] as Kind[])
  ).map((item) => ({ value: item, label: KIND_LABEL[item], sub: KIND_MARK[item] })),
);

const typed = computed(() => (props.value?.kind === 'value' ? String(props.value.value) : ''));
const missing = computed(() => !props.value);

function setKind(next: string): void {
  kindOpen.value = false;
  chosen.value = next as Kind;
  emit('update', undefined);
}

/** A cleared box is no value (unfinished), not empty text. */
function setTyped(raw: string): void {
  if (raw === '') {
    emit('update', undefined);
    return;
  }
  if (props.type === 'boolean') emit('update', { kind: 'value', value: raw === 'true' });
  else if (props.type === 'number' && !props.textOnly) {
    const n = Number(raw);
    emit('update', Number.isFinite(n) ? { kind: 'value', value: n } : undefined);
  } else emit('update', { kind: 'value', value: raw });
}
</script>
