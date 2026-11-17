<template>
  <div class="desk-theme-font-size">
    <div class="desk-theme-font-size-heading" role="presentation">Font size</div>
    <button
      v-for="preset in DESK_FONT_SIZE_PRESETS"
      :key="preset.id"
      type="button"
      class="desk-theme-font-size-row"
      @click="applyDeskFontSizePreset(preset.id)"
    >
      <span class="name">{{ preset.label }}</span>
      <small>{{ preset.percent }}%</small>
      <span v-if="deskFontSizePercent === preset.percent" class="tick">✓</span>
    </button>
    <div class="desk-theme-font-size-custom">
      <span class="name">Custom</span>
      <input
        ref="input"
        v-model="draft"
        type="number"
        min="50"
        max="150"
        inputmode="numeric"
        aria-label="Font size percent"
        @keydown.enter.prevent="applyDraft"
        @blur="applyDraft"
      />
      <span class="suffix">%</span>
      <span v-if="isCustom" class="tick">✓</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  DESK_FONT_SIZE_PRESETS,
  applyDeskFontSize,
  applyDeskFontSizePreset,
  deskFontSizePercent,
  deskFontSizePresetId,
} from '../theme/deskFontSize';

const draft = ref(String(deskFontSizePercent.value));
const input = ref<HTMLInputElement | null>(null);

const isCustom = computed(() => deskFontSizePresetId(deskFontSizePercent.value) === 'custom');

watch(deskFontSizePercent, (percent) => {
  draft.value = String(percent);
});

function applyDraft(): void {
  const parsed = Number.parseInt(draft.value, 10);
  if (!Number.isFinite(parsed)) {
    draft.value = String(deskFontSizePercent.value);
    return;
  }
  applyDeskFontSize(parsed);
}
</script>

<style scoped>
.desk-theme-font-size-heading {
  padding: 6px 10px 2px;
  font-size: 0.75rem;
  color: var(--desk-muted, #6c757d);
  border-top: 1px solid var(--desk-grid-line, lightgray);
  margin-top: 2px;
}
.desk-theme-font-size-row,
.desk-theme-font-size-custom {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
  min-height: 26px;
  padding: 4px 10px;
  box-sizing: border-box;
  font-size: 0.88rem;
  color: inherit;
}
.desk-theme-font-size-row {
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
}
.desk-theme-font-size-row:hover {
  background: var(--desk-hover-bg, #e9ecef);
}
.desk-theme-font-size-custom input {
  width: 3.2rem;
  margin-left: auto;
  border: 1px solid var(--desk-grid-line, lightgray);
  border-radius: 2px;
  padding: 1px 4px;
  font-size: inherit;
  text-align: right;
  background: var(--desk-row-bg, #fff);
  color: inherit;
}
.desk-theme-font-size-custom .suffix {
  color: var(--desk-muted, #6c757d);
}
.desk-theme-font-size-row small {
  color: var(--desk-muted, #6c757d);
}
.name {
  flex: 1;
}
.tick {
  width: 1em;
}
</style>
