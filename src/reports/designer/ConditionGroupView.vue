<template>
  <div class="cond-group" :class="[`level-${level}`, `match-${mode}`]">
    <div v-if="level > 0 || group.items.length > 1" class="cond-group-head">
      <span class="cond-seg" role="radiogroup" aria-label="How the rules combine">
        <button
          v-for="item in modes"
          :key="item.value"
          type="button"
          role="radio"
          :aria-checked="mode === item.value"
          :class="{ on: mode === item.value }"
          :title="item.help"
          @click="setMode(item.value)"
        >
          {{ item.label }}
        </button>
      </span>
      <span class="desk-muted"
        >of these {{ mode === 'none' ? 'may be true' : 'must be true' }}</span
      >
      <button
        v-if="level > 0"
        type="button"
        class="studio-icon-btn danger cond-group-remove"
        title="Remove this group"
        @click="emit('remove')"
      >
        <StudioIcon name="close" />
      </button>
    </div>

    <div class="cond-items">
      <div v-for="(item, index) in group.items" :key="item.key" class="cond-line">
        <span class="cond-joiner">{{
          index === 0 ? (level === 0 && group.items.length === 1 ? 'Where' : '') : joiner
        }}</span>
        <ConditionRuleView
          v-if="item.type === 'rule'"
          :rule="item"
          :scope="scope"
          :auto-open="item.key === freshKey"
          @update="(next) => setAt(index, next)"
          @remove="removeAt(index)"
          @formula="toFormula(index)"
        />
        <ConditionGroupView
          v-else-if="item.type === 'group'"
          :group="item"
          :scope="scope"
          :level="level + 1"
          :fresh="freshKey"
          @update="(next) => setAt(index, next)"
          @remove="removeAt(index)"
          @fresh="(key) => emit('fresh', key)"
        />
        <div v-else class="cond-rule is-formula">
          <FormulaInput
            class="cond-formula"
            :model-value="item.text"
            :scope="scope"
            expect="boolean"
            @update:model-value="(text) => setFormula(index, text)"
          />
          <span class="cond-tools">
            <button
              v-if="canBlock(item.text)"
              type="button"
              class="studio-icon-btn"
              title="Show as blocks"
              @click="toBlocks(index)"
            >
              <StudioIcon name="blocks" />
            </button>
            <button
              type="button"
              class="studio-icon-btn danger"
              title="Remove"
              @click="removeAt(index)"
            >
              <StudioIcon name="close" />
            </button>
          </span>
        </div>
      </div>
    </div>

    <div class="cond-add">
      <button data-desk-field="condition-group-view-rule" type="button" class="studio-chip-btn" @click="addRule">
        <StudioIcon name="plus" /> Rule
      </button>
      <button data-desk-field="condition-group-view-group"
        v-if="level < MAX_DEPTH"
        type="button"
        class="studio-chip-btn"
        title="Rules that combine on their own: (a or b) and c"
        @click="addGroup"
      >
        <StudioIcon name="plus" /> Group
      </button>
      <button data-desk-field="condition-group-view-formula"
        type="button"
        class="studio-chip-btn"
        title="A condition written as a formula"
        @click="addFormula"
      >
        <StudioIcon name="formula" /> Formula
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  blankRule,
  conditionFromText,
  conditionKey,
  emptyGroup,
  nodeText,
  onlyFormulas,
  type ConditionGroup,
  type ConditionNode,
} from './condition';
import ConditionRuleView from './ConditionRuleView.vue';
import FormulaInput from './FormulaInput.vue';
import type { NameScope } from './scope';
import StudioIcon from './StudioIcon.vue';

defineOptions({ name: 'ConditionGroupView' });

/** A group of rules that match all, any or none, with groups inside it. Each edit hands back the changed group with `update`. */
const props = withDefaults(
  defineProps<{
    group: ConditionGroup;
    scope: NameScope;
    depth?: number | undefined;
    fresh?: number | undefined;
  }>(),
  { depth: 0, fresh: 0 },
);
const emit = defineEmits<{ update: [group: ConditionGroup]; remove: []; fresh: [key: number] }>();

const MAX_DEPTH = 2;
const level = computed(() => props.depth ?? 0);
const freshKey = computed(() => props.fresh ?? 0);
type Mode = 'all' | 'any' | 'none' | 'notAll';

/** "None" is `not (a or b)`; "not all" (`not (a and b)`) only shows when a formula said so. */
const mode = computed(
  (): Mode =>
    props.group.negate ? (props.group.match === 'any' ? 'none' : 'notAll') : props.group.match,
);
const modes = computed(() => [
  { value: 'all' as Mode, label: 'All', help: 'Every rule must hold' },
  { value: 'any' as Mode, label: 'Any', help: 'At least one rule must hold' },
  { value: 'none' as Mode, label: 'None', help: 'No rule may hold' },
  ...(mode.value === 'notAll'
    ? [{ value: 'notAll' as Mode, label: 'Not all', help: 'At least one rule must fail' }]
    : []),
]);
const joiner = computed(() => (props.group.match === 'all' ? 'and' : 'or'));

function setMode(next: Mode): void {
  // `negate` is left out unless the new mode needs it, so a plain group stays plain.
  const { negate: _negate, ...rest } = props.group;
  const match = next === 'any' || next === 'none' ? 'any' : 'all';
  emit(
    'update',
    next === 'none' || next === 'notAll' ? { ...rest, match, negate: true } : { ...rest, match },
  );
}

function setItems(items: ConditionNode[]): void {
  emit('update', { ...props.group, items });
}

function setAt(index: number, node: ConditionNode): void {
  setItems(props.group.items.map((item, at) => (at === index ? node : item)));
}

function removeAt(index: number): void {
  setItems(props.group.items.filter((_item, at) => at !== index));
}

function addRule(): void {
  const rule = blankRule();
  emit('fresh', rule.key);
  setItems([...props.group.items, rule]);
}

function addGroup(): void {
  const rule = blankRule();
  emit('fresh', rule.key);
  setItems([
    ...props.group.items,
    { ...emptyGroup(props.group.match === 'all' ? 'any' : 'all'), items: [rule] },
  ]);
}

function addFormula(): void {
  setItems([...props.group.items, { type: 'formula', key: conditionKey(), text: '' }]);
}

function setFormula(index: number, text: string): void {
  setAt(index, { type: 'formula', key: props.group.items[index]?.key ?? conditionKey(), text });
}

/** A rule (or group) written out as one formula block, to edit by hand. */
function toFormula(index: number): void {
  const item = props.group.items[index];
  if (item) setAt(index, { type: 'formula', key: conditionKey(), text: nodeText(item) });
}

function canBlock(text: string): boolean {
  const parsed = text.trim() ? conditionFromText(text) : null;
  return Boolean(parsed && !onlyFormulas(parsed));
}

/** A formula block that blocks can hold, back as blocks. */
function toBlocks(index: number): void {
  const item = props.group.items[index];
  const parsed = item?.type === 'formula' ? conditionFromText(item.text) : null;
  if (!parsed) return;
  setAt(index, parsed.items.length === 1 && !parsed.negate ? parsed.items[0]! : parsed);
}
</script>
