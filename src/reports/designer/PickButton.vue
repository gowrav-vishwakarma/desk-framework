<template>
  <span class="pick-button-wrap">
    <button
      ref="button"
      type="button"
      class="pick-button"
      :class="{ empty: !modelValue, invalid: invalid || unknown, compact }"
      :data-desk-field="fieldId"
      :title="current?.hint ?? (unknown ? `${modelValue} is not available here` : '')"
      aria-haspopup="listbox"
      :aria-expanded="open"
      @click="open = !open"
      @keydown.down.prevent="open = true"
    >
      <span
        v-if="current?.icon"
        class="pick-button-icon"
        :class="current.tone ? `tone-${current.tone}` : ''"
        ><StudioIcon :name="current.icon"
      /></span>
      <span v-else-if="unknown" class="pick-button-icon tone-danger"
        ><StudioIcon name="warn"
      /></span>
      <span class="pick-button-label">{{
        modelValue ? (current?.label ?? modelValue) : placeholder
      }}</span>
      <span v-if="current?.sub && showSub" class="pick-button-sub">{{ current.sub }}</span>
      <StudioIcon name="open" class="pick-button-caret" />
    </button>
    <button
      v-if="clearable && modelValue"
      type="button"
      class="pick-button-clear"
      title="Clear"
      @click="emit('update:modelValue', '')"
    >
      <StudioIcon name="close" />
    </button>
    <StudioPopup v-model:open="open" :anchor="button" :width="popupWidth">
      <PickList
        :items="items"
        :selected="modelValue ? [modelValue] : []"
        :placeholder="searchPlaceholder"
        :empty="empty"
        :searchable="items.length > 6"
        @pick="choose"
      >
        <template #footer><slot name="footer" :close="() => (open = false)" /></template>
      </PickList>
    </StudioPopup>
  </span>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { PickItem } from './pickItems';
import PickList from './PickList.vue';
import StudioIcon from './StudioIcon.vue';
import StudioPopup from './StudioPopup.vue';

/** Pick one value from a list: a column, a step, an input, a model. A value not in the list shows as a problem. */
const props = withDefaults(
  defineProps<{
    modelValue: string;
    items: readonly PickItem[];
    placeholder?: string | undefined;
    searchPlaceholder?: string | undefined;
    empty?: string | undefined;
    invalid?: boolean | undefined;
    clearable?: boolean | undefined;
    compact?: boolean | undefined;
    showSub?: boolean | undefined;
    popupWidth?: number | undefined;
    fieldId?: string | undefined;
  }>(),
  {
    placeholder: 'Choose…',
    searchPlaceholder: 'Search',
    empty: 'Nothing to choose yet',
    popupWidth: 280,
    showSub: false,
  },
);
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const open = ref(false);
const button = ref<HTMLButtonElement | null>(null);
const current = computed(() => props.items.find((item) => item.value === props.modelValue));
const unknown = computed(() => Boolean(props.modelValue) && !current.value);

function choose(value: string): void {
  emit('update:modelValue', value);
  open.value = false;
  button.value?.focus();
}

defineExpose({ open: () => (open.value = true) });
</script>
