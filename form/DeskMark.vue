<template>
  <component
    :is="decorative ? 'span' : 'button'"
    class="desk-affix"
    :class="{ 'is-quiet': decorative }"
    v-bind="decorative ? { 'aria-hidden': 'true' } : { type: 'button', tabindex: -1, 'aria-label': kind === 'select' ? 'Select' : kind === 'date' ? 'Pick date' : 'Search' }"
    @mousedown.prevent="onPress"
  >
    <svg v-if="kind === 'select'" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.5 6L8 10.5 12.5 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
    </svg>
    <svg v-else-if="kind === 'date'" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2.5" y="3.5" width="11" height="10" rx="1" fill="none" stroke="currentColor" stroke-width="1.4" />
      <path d="M2.5 6.5h11M5.5 2.5v2.2M10.5 2.5v2.2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
    </svg>
    <svg v-else viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="7" cy="7" r="3.25" fill="none" stroke="currentColor" stroke-width="1.6" />
      <path d="M9.5 9.5L13 13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
    </svg>
  </component>
</template>

<script setup lang="ts">
const props = defineProps<{
  kind: 'select' | 'search' | 'date';
  /** A mark only. It does not take a click, so the cell under it still does. */
  decorative?: boolean;
}>();
const emit = defineEmits<{ press: [] }>();

function onPress(): void {
  if (!props.decorative) emit('press');
}
</script>
