<template>
  <p v-if="text" class="desk-grid-layout-note" role="note">{{ text }}</p>
</template>

<script setup lang="ts">
import { computed } from 'vue';

/** The active layout's note, shown above the grid. Plain text; line breaks are kept. */
const props = defineProps<{ note?: string | undefined }>();
const text = computed(() => props.note?.trim() ?? '');
</script>
