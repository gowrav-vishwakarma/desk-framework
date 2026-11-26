<template>
  <svg
    class="studio-icon"
    viewBox="0 0 16 16"
    width="16"
    height="16"
    aria-hidden="true"
    focusable="false"
  >
    <path :d="ICONS[name]" />
  </svg>
</template>

<script setup lang="ts">
import { ICONS, type IconName } from './icons';

defineProps<{ name: IconName }>();
</script>

<style scoped>
.studio-icon {
  width: 1em;
  height: 1em;
  flex: none;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
  vertical-align: -0.125em;
}
</style>
