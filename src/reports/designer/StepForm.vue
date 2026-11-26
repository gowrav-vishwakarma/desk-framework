<template>
  <div class="sf">
    <template v-for="field in basic" :key="field.key">
      <StepField
        :field="field"
        :target="target"
        :columns="columns"
        :stages="stages"
        :issues="issues"
        :path="path"
      />
    </template>
    <template v-if="advanced.length">
      <button type="button" class="sf-more" :aria-expanded="moreOpen" @click="moreOpen = !moreOpen">
        <StudioIcon :name="moreOpen ? 'open' : 'right'" /> More options
        <span class="desk-muted">({{ advanced.length }})</span>
        <span v-if="advancedProblems" class="fold-bad"
          ><StudioIcon name="warn" /> {{ advancedProblems }}</span
        >
      </button>
      <div v-if="moreOpen" class="sf-advanced">
        <StepField
          v-for="field in advanced"
          :key="field.key"
          :field="field"
          :target="target"
          :columns="columns"
          :stages="stages"
          :issues="issues"
          :path="path"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Rdl2Stage } from '../language';
import type { Issue } from './checks';
import { readKey, writeKey, type ColumnsOf, type StudioField } from './fields';
import type { ColumnInfo } from './schema';
import StepField from './StepField.vue';
import StudioIcon from './StudioIcon.vue';

defineOptions({ name: 'StepForm' });

/**
 * The settings of a step, or of one item of a list setting, drawn from their description. It edits
 * `target` (a step of the draft, or an item in it) where it is; the draft records every change.
 */
const props = defineProps<{
  fields: readonly StudioField[];
  target: Record<string, unknown>;
  columns: Record<ColumnsOf, readonly ColumnInfo[]>;
  stages: readonly Rdl2Stage[];
  /** The step's problems; those under `path` are this form's. */
  issues: readonly Issue[];
  /** Where this form sits in the step, for problems: `measures.2.`; empty for the step itself. */
  path: string;
}>();

const shown = computed(() =>
  props.fields.filter((field) => !field.when || field.when(props.target)),
);
const basic = computed(() => shown.value.filter((field) => !field.advanced));
const advanced = computed(() => shown.value.filter((field) => field.advanced));

function problemsAt(key: string): number {
  const at = `${props.path}${key}`;
  return props.issues.filter((issue) => issue.path === at || issue.path?.startsWith(`${at}.`))
    .length;
}

const advancedProblems = computed(() =>
  advanced.value.reduce((n, field) => n + problemsAt(field.key), 0),
);

function hasValue(field: StudioField): boolean {
  const value = readKey(props.target, field.key);
  return value !== undefined && value !== '' && !(Array.isArray(value) && value.length === 0);
}

// Open when something in it is set or needs fixing, so nothing set is out of sight.
const moreOpen = ref(advanced.value.some((field) => hasValue(field) || problemsAt(field.key) > 0));
watch(advancedProblems, (n) => {
  if (n > 0) moreOpen.value = true;
});

// Names follow their suggestion (sum of amount → amountTotal) until the user types their own.
const suggestions = computed(() =>
  shown.value
    .filter((field) => field.kind === 'name' && field.suggest)
    .map((field) => ({ field, name: field.suggest!(props.target) })),
);
watch(suggestions, (next, previous) => {
  for (const { field, name } of next) {
    const current = readKey(props.target, field.key);
    const before = previous?.find((item) => item.field.key === field.key)?.name;
    if (name && (!current || current === before))
      writeKey(props.target, field.key, name, field.optional === true);
  }
});
</script>
