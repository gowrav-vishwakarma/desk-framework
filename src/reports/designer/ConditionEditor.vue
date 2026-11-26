<template>
  <div class="cond-editor" :class="{ invalid }">
    <div class="cond-editor-head">
      <span class="cond-seg" role="radiogroup" aria-label="Edit as">
        <button data-desk-field="condition-editor-rules"
          type="button"
          role="radio"
          :aria-checked="view === 'blocks'"
          :class="{ on: view === 'blocks' }"
          :disabled="!group"
          :title="group ? 'Build it from rules' : 'Fix the formula to see it as rules'"
          @click="view = 'blocks'"
        >
          <StudioIcon name="blocks" /> Rules
        </button>
        <button data-desk-field="condition-editor-formula"
          type="button"
          role="radio"
          :aria-checked="view === 'formula'"
          :class="{ on: view === 'formula' }"
          title="Write it as a formula"
          @click="view = 'formula'"
        >
          <StudioIcon name="formula" /> Formula
        </button>
      </span>
    </div>

    <template v-if="view === 'blocks' && group">
      <div v-if="!group.items.length" class="cond-empty">
        <span class="desk-muted">{{ emptyText }}</span>
        <button type="button" class="studio-btn" :data-desk-field="fieldId" @click="addFirst">
          <StudioIcon name="plus" /> Add a rule
        </button>
      </div>
      <ConditionGroupView
        v-else
        :group="group"
        :scope="scope"
        :fresh="fresh"
        @update="setGroup"
        @fresh="(key) => (fresh = key)"
      />
      <p
        v-if="modelValue.trim() && group.items.length"
        class="cond-preview"
        title="The condition as a formula"
      >
        <StudioIcon name="formula" /> <code>{{ modelValue }}</code>
      </p>
    </template>
    <FormulaInput
      v-else
      :model-value="modelValue"
      :scope="scope"
      expect="boolean"
      :invalid="invalid"
      :field-id="fieldId"
      @update:model-value="setText"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import {
  blankRule,
  conditionFromText,
  conditionText,
  onlyFormulas,
  type ConditionGroup,
} from './condition';
import ConditionGroupView from './ConditionGroupView.vue';
import FormulaInput from './FormulaInput.vue';
import type { NameScope } from './scope';
import StudioIcon from './StudioIcon.vue';

/**
 * A yes/no condition, edited as rules or as a formula. The text is what is saved; the rules are a
 * view of it, rebuilt when the text changes from outside (undo, the formula view) and written back
 * only when the rules are edited, so opening a report never rewrites its conditions.
 */
const props = withDefaults(
  defineProps<{
    modelValue: string;
    scope: NameScope;
    invalid?: boolean | undefined;
    fieldId?: string | undefined;
    emptyText?: string | undefined;
  }>(),
  {
    emptyText: 'No condition: every row counts.',
  },
);
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const group = ref<ConditionGroup | null>(conditionFromText(props.modelValue));
const view = ref<'blocks' | 'formula'>(
  group.value && !onlyFormulas(group.value)
    ? 'blocks'
    : props.modelValue.trim()
      ? 'formula'
      : 'blocks',
);
/** The rule just added, whose column picker opens by itself. */
const fresh = ref(0);
/** What this editor last wrote, to tell its own changes from changes made elsewhere. */
let written = props.modelValue;

watch(
  () => props.modelValue,
  (text) => {
    if (text === written) return;
    written = text;
    group.value = conditionFromText(text);
    if (!group.value) view.value = 'formula';
  },
);

function write(text: string): void {
  written = text;
  emit('update:modelValue', text);
}

function setGroup(next: ConditionGroup): void {
  group.value = next;
  write(conditionText(next));
}

function setText(text: string): void {
  group.value = conditionFromText(text);
  write(text);
}

function addFirst(): void {
  if (!group.value) return;
  const rule = blankRule();
  fresh.value = rule.key;
  setGroup({ ...group.value, items: [rule] });
}
</script>
