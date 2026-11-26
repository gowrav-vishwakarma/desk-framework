<template>
  <div class="order-list">
    <div v-for="(item, index) in items" :key="index" class="order-row">
      <span class="order-word desk-muted">{{ index === 0 ? 'By' : 'then' }}</span>
      <FormulaInput
        class="order-value"
        :model-value="item.expr"
        :scope="scope"
        prefer-column
        :invalid="bad(index)"
        @update:model-value="(expr) => set(index, { ...item, expr })"
      />
      <button
        type="button"
        class="studio-chip-btn order-dir"
        :title="
          item.dir === 'desc' ? 'Largest, latest or Z first' : 'Smallest, earliest or A first'
        "
        @click="set(index, { ...item, dir: item.dir === 'desc' ? 'asc' : 'desc' })"
      >
        <StudioIcon :name="item.dir === 'desc' ? 'sortDown' : 'sortUp'" />
        {{ item.dir === 'desc' ? dirWords(index).desc : dirWords(index).asc }}
      </button>
      <button
        type="button"
        class="studio-icon-btn danger"
        title="Remove"
        @click="
          emit(
            'update',
            items.filter((_item, at) => at !== index),
          )
        "
      >
        <StudioIcon name="close" />
      </button>
    </div>
    <button
      type="button"
      class="studio-chip-btn"
      :data-desk-field="fieldId"
      @click="emit('update', [...items, { expr: '', dir: 'asc' }])"
    >
      <StudioIcon name="plus" /> {{ items.length ? 'Then by' : 'Choose an order' }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { exprTextType } from './expr';
import FormulaInput from './FormulaInput.vue';
import { scopeType, type NameScope } from './scope';
import StudioIcon from './StudioIcon.vue';
import { useReportDraftContext } from './useReportDraft';

export interface OrderItem {
  expr: string;
  dir?: 'asc' | 'desc';
}

/** An order: columns (or formulas), each up or down, worded for its type: "oldest first", "A to Z". */
const props = withDefaults(
  defineProps<{
    items: readonly OrderItem[];
    scope: NameScope;
    problems?: readonly string[] | undefined;
    fieldId?: string | undefined;
  }>(),
  { problems: () => [] },
);
const emit = defineEmits<{ update: [items: OrderItem[]] }>();

const draft = useReportDraftContext();

function set(index: number, item: OrderItem): void {
  emit(
    'update',
    props.items.map((current, at) => (at === index ? item : current)),
  );
}

function bad(index: number): boolean {
  return props.problems.some((path) => path.startsWith(`${index}.`));
}

function dirWords(index: number): { asc: string; desc: string } {
  const type = exprTextType(props.items[index]?.expr ?? '', (name) =>
    scopeType(props.scope, draft.catalog.value, name),
  );
  if (type === 'date') return { asc: 'Oldest first', desc: 'Newest first' };
  if (type === 'text') return { asc: 'A to Z', desc: 'Z to A' };
  return { asc: 'Smallest first', desc: 'Largest first' };
}
</script>
