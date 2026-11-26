<template>
  <span class="pick-button-wrap">
    <button
      ref="button"
      type="button"
      class="pick-button"
      :class="{ empty: !modelValue, invalid: invalid || Boolean(problem), compact }"
      :title="problem ?? modelValue"
      :data-desk-field="fieldId"
      @click="open = !open"
    >
      <span
        v-if="resolved"
        class="pick-button-icon"
        :class="`tone-${valueTypeOf(resolved.field.type)}`"
        ><StudioIcon :name="TYPE_ICON[valueTypeOf(resolved.field.type)]"
      /></span>
      <span v-else-if="problem" class="pick-button-icon tone-danger"
        ><StudioIcon name="warn"
      /></span>
      <span class="pick-button-label">{{
        resolved ? resolved.labels.join(' › ') : modelValue || placeholder
      }}</span>
      <StudioIcon name="open" class="pick-button-caret" />
    </button>
    <StudioPopup v-model:open="open" :anchor="button" :width="340">
      <CatalogTree
        :model="model"
        :catalog="catalog"
        :checked="modelValue ? new Set([modelValue]) : undefined"
        @pick="choose"
      />
    </StudioPopup>
  </span>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import CatalogTree from './CatalogTree.vue';
import { TYPE_ICON } from './pickItems';
import { resolvePath, valueTypeOf, type Catalog } from './schema';
import StudioIcon from './StudioIcon.vue';
import StudioPopup from './StudioPopup.vue';

/** Pick one field of a model or of a record it links to; shows it as "Party › City › Name". */
const props = withDefaults(
  defineProps<{
    modelValue: string;
    model: string;
    catalog: Catalog;
    placeholder?: string | undefined;
    invalid?: boolean | undefined;
    compact?: boolean | undefined;
    fieldId?: string | undefined;
  }>(),
  {
    placeholder: 'Choose a field…',
  },
);
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const open = ref(false);
const button = ref<HTMLButtonElement | null>(null);
const found = computed(() =>
  props.modelValue && props.model
    ? resolvePath(props.catalog, props.model, props.modelValue)
    : null,
);
const resolved = computed(() => (found.value && !('error' in found.value) ? found.value : null));
const problem = computed(() => (found.value && 'error' in found.value ? found.value.error : null));

function choose(path: string): void {
  emit('update:modelValue', path);
  open.value = false;
  button.value?.focus();
}

defineExpose({ open: () => (open.value = true) });
</script>
