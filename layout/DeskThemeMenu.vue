<template>
  <span ref="root" class="desk-theme">
    <button type="button" :aria-expanded="open" @click="toggle">
      Theme <small>{{ deskKeyLabel('desk-theme') }}</small>
    </button>
    <div v-if="open" ref="list" class="desk-theme-list" role="listbox" tabindex="-1" @keydown="onListKey">
      <button
        v-for="(theme, index) in DESK_THEMES"
        :key="theme.id"
        type="button"
        role="option"
        :aria-selected="theme.id === deskTheme"
        :class="{ on: index === cursor }"
        @mouseenter="cursor = index"
        @click="choose(index)"
      >
        <span class="swatches" aria-hidden="true">
          <i v-for="(color, swatch) in theme.swatches" :key="swatch" :style="{ background: color }" />
        </span>
        <span class="name">{{ theme.label }}</span>
        <span v-if="theme.id === deskTheme" class="tick">✓</span>
      </button>
      <DeskThemeFontSizeSection />
    </div>
  </span>
</template>

<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from 'vue';
import { deskKeyLabel } from '../keys/deskKeymap';
import DeskThemeFontSizeSection from './DeskThemeFontSizeSection.vue';
import { DESK_THEMES, applyDeskTheme, deskTheme } from '../theme/themes';

const root = ref<HTMLElement | null>(null);
const list = ref<HTMLElement | null>(null);
const open = ref(false);
const cursor = ref(0);

function currentIndex(): number {
  const index = DESK_THEMES.findIndex((theme) => theme.id === deskTheme.value);
  return index < 0 ? 0 : index;
}

function focusList(): void {
  void nextTick(() => list.value?.focus());
}

function show(): void {
  cursor.value = currentIndex();
  open.value = true;
  focusList();
}

function hide(): void {
  open.value = false;
}

function toggle(): void {
  if (open.value) hide();
  else show();
}

function choose(index: number): void {
  const theme = DESK_THEMES[index];
  if (!theme) return;
  cursor.value = index;
  applyDeskTheme(theme.id);
  focusList();
}

function step(delta: number): void {
  choose((cursor.value + delta + DESK_THEMES.length) % DESK_THEMES.length);
}

function onListKey(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    step(1);
    return;
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    step(-1);
    return;
  }
  if (event.key === 'Enter' || event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    hide();
  }
}

function onDocPointer(event: MouseEvent): void {
  const target = event.target;
  if (target instanceof Node && root.value?.contains(target)) return;
  hide();
}

/** Escape closes even after focus has moved back to the page. */
function onDocKey(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  event.stopPropagation();
  hide();
}

watch(open, (isOpen) => {
  if (isOpen) {
    document.addEventListener('mousedown', onDocPointer);
    window.addEventListener('keydown', onDocKey, true);
    return;
  }
  document.removeEventListener('mousedown', onDocPointer);
  window.removeEventListener('keydown', onDocKey, true);
});

onUnmounted(() => {
  document.removeEventListener('mousedown', onDocPointer);
  window.removeEventListener('keydown', onDocKey, true);
});

defineExpose({ toggle, open: show });
</script>

<style scoped>
.desk-theme {
  position: relative;
}
.desk-theme > button {
  height: 26px;
  border: 0;
  background: transparent;
  font-size: 0.88rem;
  cursor: pointer;
  color: inherit;
  padding: 0 8px;
  white-space: nowrap;
}
.desk-theme-list {
  position: absolute;
  top: 100%;
  right: 0;
  z-index: 40;
  min-width: 180px;
  background: var(--desk-menu-on-bg, #fff);
  color: var(--desk-text, #212529);
  border: 1px solid var(--desk-grid-line, lightgray);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  backdrop-filter: blur(var(--desk-chrome-blur, 0px));
  outline: none;
}
.desk-theme-list > button {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
  min-height: 26px;
  padding: 4px 10px;
  border: 0;
  background: transparent;
  text-align: left;
  font-size: 0.88rem;
  cursor: pointer;
  color: inherit;
}
.desk-theme-list > button.on,
.desk-theme-list > button:hover {
  background: var(--desk-hover-bg, #e9ecef);
}
.swatches {
  display: inline-flex;
  gap: 2px;
}
.swatches i {
  width: 10px;
  height: 10px;
  border: 1px solid var(--desk-grid-line, lightgray);
}
.name {
  flex: 1;
}
.tick {
  width: 1em;
}
</style>
