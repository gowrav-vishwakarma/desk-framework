<template>
  <DeskSettingsGrid :field-id="gridId" :rows="rows" :read="read" @change="change" />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import DeskSettingsGrid from '../grid/DeskSettingsGrid.vue';
import { sectionRows, type DeskSetting } from '../grid/settings';
import { DESK_PERIOD_FIXED, DESK_PERIOD_KEY, type DeskSavedFilter } from './saved';
import type { DeskFilterValues } from './types';

/**
 * A page's filter fields for a saved layout: the same lookups and selects as its filter panel,
 * so people pick an account group by name, never by id. With a period, the two dates become a
 * Period choice, and the dates show only for Fixed dates.
 */
const props = withDefaults(
  defineProps<{
    filter: DeskSavedFilter;
    /** What the layout stores, or null for the page's defaults. */
    stored: Record<string, unknown> | null;
    fieldId?: string;
    title?: string;
  }>(),
  { fieldId: 'layout-panel', title: 'Filter' },
);
const emit = defineEmits<{ update: [stored: Record<string, unknown>] }>();

/** Always a string: the settings grid's `fieldId` takes no `undefined`. */
const gridId = computed(() => props.fieldId || 'layout-panel');

const values = ref<DeskFilterValues>(props.filter.thaw(props.stored));
const periodId = ref<string>(storedPeriod(props.stored));

function storedPeriod(stored: Record<string, unknown> | null): string {
  if (!props.filter.period) return DESK_PERIOD_FIXED;
  const id = stored?.[DESK_PERIOD_KEY];
  if (typeof id === 'string' && props.filter.period.choices().some((choice) => choice.id === id)) return id;
  // A layout saved before it had a period, or with no panel yet: the defaults decide.
  return stored ? DESK_PERIOD_FIXED : (matchPeriod(values.value) ?? DESK_PERIOD_FIXED);
}

function matchPeriod(current: DeskFilterValues): string | null {
  const period = props.filter.period;
  if (!period) return null;
  return period.choices().find((choice) => {
    const range = choice.range();
    return range.from === current[period.from] && range.to === current[period.to];
  })?.id ?? null;
}

// Another layout was opened in the same designer.
watch(
  () => props.stored,
  (stored) => {
    values.value = props.filter.thaw(stored);
    periodId.value = storedPeriod(stored);
  },
);

const rows = computed(() => {
  const period = props.filter.period;
  const fields: DeskSetting[] = [];
  for (const field of props.filter.fields) {
    if (period && field.key === period.from) {
      fields.push({
        key: DESK_PERIOD_KEY,
        label: 'Period',
        editor: 'select',
        options: [...period.choices().map((choice) => ({ label: choice.label, value: choice.id })), { label: 'Fixed dates', value: DESK_PERIOD_FIXED }],
      });
      if (periodId.value === DESK_PERIOD_FIXED) fields.push(field);
      continue;
    }
    if (period && field.key === period.to) {
      if (periodId.value === DESK_PERIOD_FIXED) fields.push(field);
      continue;
    }
    fields.push(field);
  }
  return sectionRows(props.fieldId, props.title, fields);
});

function read(key: string): unknown {
  return key === DESK_PERIOD_KEY ? periodId.value : values.value[key];
}

function change(key: string, value: unknown): void {
  const period = props.filter.period;
  if (key === DESK_PERIOD_KEY) {
    periodId.value = typeof value === 'string' && value ? value : DESK_PERIOD_FIXED;
    const choice = period?.choices().find((item) => item.id === periodId.value);
    // Fixed starts from the range that was picked, so the dates are not empty.
    if (period && choice) {
      const range = choice.range();
      values.value = { ...values.value, [period.from]: range.from, [period.to]: range.to };
    }
  } else {
    const next = { ...values.value, [key]: value };
    props.filter.changed(next, key);
    values.value = next;
  }
  emit('update', props.filter.freeze(values.value, period ? periodId.value : undefined));
}
</script>
