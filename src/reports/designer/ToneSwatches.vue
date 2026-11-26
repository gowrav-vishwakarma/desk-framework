<template>
  <span class="tone-swatches" role="radiogroup" aria-label="Colour">
    <button
      type="button"
      role="radio"
      class="tone-swatch none"
      :class="{ on: !modelValue }"
      :aria-checked="!modelValue"
      title="Plain"
      @click="emit('update:modelValue', undefined)"
    />
    <button
      v-for="tone in TONES"
      :key="tone.value"
      type="button"
      role="radio"
      class="tone-swatch"
      :class="[`tone-${tone.value}`, { on: modelValue === tone.value }]"
      :aria-checked="modelValue === tone.value"
      :title="tone.label"
      @click="emit('update:modelValue', tone.value)"
    />
  </span>
</template>

<script setup lang="ts">
import type { Rdl2Tone } from '../language';
import { TONES } from './output';

/** Pick a colour by its swatch; the first one is plain. */
defineProps<{ modelValue: Rdl2Tone | undefined }>();
const emit = defineEmits<{ 'update:modelValue': [tone: Rdl2Tone | undefined] }>();
</script>
