<template>
  <span class="cond-list">
    <button
      type="button"
      class="cond-kind"
      :title="
        fromInput
          ? 'Values from an input — click to type them instead'
          : 'Typed values — click to take them from an input'
      "
      @click="toggleSource"
    >
      {{ fromInput ? '@' : 'abc' }}
    </button>
    <PickButton
      v-if="fromInput"
      compact
      :model-value="rule.value?.kind === 'param' ? rule.value.id : ''"
      :items="paramItems(draft.params.value, type, true)"
      placeholder="Choose an input…"
      empty="No input takes several values; add a lookup or choice input with “several values”"
      @update:model-value="
        (id) => emit('update', { value: { kind: 'param', id }, list: undefined })
      "
    />
    <span v-else-if="values?.length" class="cond-chips">
      <button
        v-for="item in values"
        :key="item"
        type="button"
        class="cond-chip"
        :class="{ on: list.includes(item) }"
        @click="toggle(item)"
      >
        {{ item }}
      </button>
    </span>
    <span v-else class="cond-chips">
      <span v-for="(item, index) in list" :key="`${item}-${index}`" class="cond-chip on">
        {{ item
        }}<button
          type="button"
          class="cond-chip-x"
          :title="`Remove ${item}`"
          @click="remove(index)"
        >
          ×
        </button>
      </span>
      <input
        v-model="entry"
        class="cond-chip-entry"
        :type="type === 'number' ? 'number' : 'text'"
        placeholder="type, Enter"
        step="any"
        @keydown="onEntryKey"
        @blur="add"
      />
    </span>
  </span>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ConditionRule, RulePatch } from './condition';
import type { ValueType } from './expr';
import PickButton from './PickButton.vue';
import { paramItems } from './pickItems';
import { useReportDraftContext } from './useReportDraft';

/** The values of "is one of": ticked from the column's fixed values, typed one by one, or an input with several values. */
const props = defineProps<{
  rule: ConditionRule;
  type: ValueType;
  values?: string[] | undefined;
}>();
const emit = defineEmits<{ update: [patch: Pick<RulePatch, 'value' | 'list'>] }>();

const draft = useReportDraftContext();
/** A number box hands back a number. */
const entry = ref<string | number>('');
const pickInput = ref(props.rule.value?.kind === 'param');
const fromInput = computed(() => props.rule.value?.kind === 'param' || pickInput.value);
const list = computed(() => props.rule.list ?? []);

function toggleSource(): void {
  pickInput.value = !fromInput.value;
  emit('update', { value: undefined, list: pickInput.value ? undefined : [] });
}

function setList(next: (string | number)[]): void {
  emit('update', { value: undefined, list: next });
}

function toggle(item: string): void {
  setList(
    list.value.includes(item)
      ? list.value.filter((value) => value !== item)
      : [...list.value, item],
  );
}

function add(): void {
  const raw = String(entry.value).trim();
  entry.value = '';
  if (!raw) return;
  const value = props.type === 'number' && Number.isFinite(Number(raw)) ? Number(raw) : raw;
  if (!list.value.includes(value)) setList([...list.value, value]);
}

/** Enter or a comma ends a value. */
function onEntryKey(event: KeyboardEvent): void {
  if (event.key !== 'Enter' && event.key !== ',') return;
  event.preventDefault();
  add();
}

function remove(index: number): void {
  setList(list.value.filter((_item, at) => at !== index));
}
</script>
