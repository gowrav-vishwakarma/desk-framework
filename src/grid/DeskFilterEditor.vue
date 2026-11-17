<template>
  <div class="desk-filter-editor">
    <div v-if="choiceList.length" class="desk-header-filter-choices" role="group" aria-label="Is one of">
      <label v-for="choice in choiceList" :key="choice.value">
        <input type="checkbox" :checked="picked.has(choice.value)" @change="toggle(choice.value)" />
        {{ choice.label }}
      </label>
    </div>
    <template v-else-if="kind === 'text'">
      <div class="desk-header-filter-modes">
        <label v-for="item in TEXT_MODES" :key="item.id">
          <input v-model="textMode" type="radio" :name="radioName" :value="item.id" />
          {{ item.label }}
        </label>
      </div>
      <input
        v-model="textValue"
        class="desk-header-filter-value"
        type="text"
        :aria-label="isListMode(textMode) ? 'Values, separated by commas' : 'Filter value'"
        :placeholder="isListMode(textMode) ? 'paid, partly paid' : ''"
      />
      <p v-if="isListMode(textMode)" class="desk-filter-editor-note">Separate values with commas. Case is ignored.</p>
    </template>
    <template v-else>
      <div class="desk-header-filter-row">
        <DeskHeaderFilterCompareOp v-model="leftOp" ariaLabel="First comparison" :compact="compact" />
        <input v-model="left" type="text" :placeholder="kind === 'date' ? 'oct 2026' : '200'" aria-label="First value" />
      </div>
      <div class="desk-header-filter-and">and</div>
      <div class="desk-header-filter-row">
        <DeskHeaderFilterCompareOp v-model="rightOp" ariaLabel="Second comparison" :compact="compact" />
        <input v-model="right" type="text" :placeholder="kind === 'date' ? 'nov 2027' : ''" aria-label="Second value" />
      </div>
      <div v-if="kind === 'date'" class="desk-header-filter-chips">
        <button v-for="phrase in DATE_FILTER_PHRASES" :key="phrase" type="button" @click="emit('chip', phrase)">
          {{ phrase }}
        </button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue';
import DeskHeaderFilterCompareOp from './DeskHeaderFilterCompareOp.vue';
import {
  DATE_FILTER_PHRASES,
  TEXT_MODES,
  composeChoiceFilter,
  composeCompareFilter,
  composeTextFilter,
  isListMode,
  readChoiceFilter,
  readCompareFilter,
  readTextFilter,
  type CompareOp,
  type FilterChoice,
  type HeaderFilterKind,
  type TextFilterMode,
} from './headerFilter';

/**
 * The fill-in form for one column filter: text modes for text, two comparisons for numbers and
 * dates, and date chips. It emits the same filter text a user can type in the filter box.
 */
const props = defineProps<{
  kind: HeaderFilterKind;
  value: string;
  /** Short comparison names, for a narrow panel such as the layout designer. */
  compact?: boolean;
  /** A column with fixed values (an enum) picks from them instead of typing. */
  choices?: readonly FilterChoice[] | undefined;
}>();
const emit = defineEmits<{ change: [text: string]; chip: [phrase: string] }>();

const radioName = `desk-filter-mode-${useId() ?? ''}`;

const leftOp = ref<CompareOp>('>');
const left = ref('');
const rightOp = ref<CompareOp>('<=');
const right = ref('');
const textMode = ref<TextFilterMode>('contains');
const textValue = ref('');
const choiceList = computed(() => props.choices ?? []);
const picked = ref<Set<string>>(new Set());

function toggle(value: string): void {
  const next = new Set(picked.value);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  picked.value = next;
}
/** Last text loaded or emitted, so the parent echoing it back does not reset a half-filled form. */
let last = '';
/** What the form composed at that point. Loading a value does not emit a reworded copy of it. */
let composed = '';

function load(raw: string): void {
  const compare = readCompareFilter(props.kind === 'text' ? '' : raw);
  const text = readTextFilter(props.kind === 'text' ? raw : '');
  leftOp.value = compare.leftOp;
  left.value = compare.left;
  rightOp.value = compare.rightOp;
  right.value = compare.right;
  textMode.value = text.mode;
  textValue.value = text.value;
  picked.value = readChoiceFilter(raw, choiceList.value);
  last = raw;
  composed = compose();
}

function compose(): string {
  if (choiceList.value.length) return composeChoiceFilter(picked.value, choiceList.value);
  return props.kind === 'text'
    ? composeTextFilter(textMode.value, textValue.value)
    : composeCompareFilter({ leftOp: leftOp.value, left: left.value, rightOp: rightOp.value, right: right.value });
}

load(props.value);

watch(
  () => [props.value, props.kind, choiceList.value] as const,
  ([value, kind, choices], [, oldKind, oldChoices]) => {
    if (value !== last || kind !== oldKind || choices !== oldChoices) load(value);
  },
);

watch([leftOp, left, rightOp, right, textMode, textValue, picked], () => {
  const next = compose();
  if (next === composed) return;
  composed = next;
  last = next;
  emit('change', next);
});

defineExpose({ compose });
</script>
