<template>
  <div class="desk-flyout" :class="{ up }">
    <div v-for="(item, index) in items" :key="`${item.label}-${index}`" class="desk-flyout-row">
      <div v-if="item.separator" class="desk-flyout-sep" role="separator" />
      <button
        v-else
        type="button"
        :class="{ on: path[0] === index, [`desk-menu-refused-${item.refused}`]: Boolean(item.refused) }"
        :title="item.hint ?? ''"
        @mouseenter="onHover(index)"
        @click="choose(item, index)"
      >
        <span v-if="item.checked" class="desk-flyout-tick">✓</span>
        <span v-if="hasIcons" class="desk-flyout-icon">
          <svg v-if="item.icon" viewBox="0 0 16 16" aria-hidden="true"><path :d="DESK_MENU_ICONS[item.icon]" /></svg>
        </span>
        <span class="desk-flyout-label">
          <template v-for="(part, partIndex) in splitAccessLabel(item.label, item.letter)" :key="partIndex">
            <u v-if="part.mark">{{ part.text }}</u>
            <template v-else>{{ part.text }}</template>
          </template>
        </span>
        <svg v-if="item.refused" class="desk-flyout-end desk-flyout-refused" viewBox="0 0 16 16" aria-hidden="true"><path :d="DESK_MENU_ICONS[item.refused === 'plan' ? 'plan' : 'lock']" /></svg>
        <svg v-if="item.endIcon" class="desk-flyout-end" viewBox="0 0 16 16" aria-hidden="true"><path :d="DESK_MENU_ICONS[item.endIcon]" /></svg>
        <span v-if="item.children?.length" class="desk-flyout-more">▸</span>
      </button>
      <DeskMenuFlyout
        v-if="showChildren(item, index)"
        :items="item.children ?? []"
        :path="path.slice(1)"
        :up="up === true"
        @path="(next) => emit('path', [index, ...next])"
        @pick="emit('pick', $event)"
        @value="emit('value', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { splitAccessLabel, type DeskMenuNode } from '../menu/deskMenu';
import { DESK_MENU_ICONS } from '../menu/menuIcons';

const props = withDefaults(
  defineProps<{
    items: DeskMenuNode[];
    path: number[];
    /** Open above the bar. A menu in the footer uses this. */
    up?: boolean;
  }>(),
  { up: false },
);

const emit = defineEmits<{
  path: [path: number[]];
  pick: [route: string];
  value: [value: string];
}>();

const hovering = ref(-1);
/** Labels line up: every row keeps the icon's room when one of them has an icon. */
const hasIcons = computed(() => props.items.some((item) => item.icon));

watch(
  () => props.path[0],
  (index) => {
    if (index !== hovering.value) hovering.value = -1;
  },
);

function showChildren(item: DeskMenuNode, index: number): boolean {
  if (!item.children?.length || props.path[0] !== index) return false;
  return props.path.length > 1 || hovering.value === index;
}

function onHover(index: number): void {
  hovering.value = index;
  emit('path', [index]);
}

function choose(item: DeskMenuNode, index: number): void {
  if (item.value) {
    emit('value', item.value);
    return;
  }
  if (item.route) {
    emit('pick', item.route);
    return;
  }
  emit('path', [index]);
}
</script>

<style scoped>
.desk-flyout {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 40;
  min-width: 220px;
  background: var(--desk-menu-on-bg, #fff);
  border: 1px solid var(--desk-grid-line, lightgray);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  backdrop-filter: blur(var(--desk-chrome-blur, 0px));
}
.desk-flyout-row {
  position: relative;
}
.desk-flyout-sep {
  margin: 4px 0;
  border-top: 1px solid var(--desk-grid-line, lightgray);
}
.desk-flyout-row > button {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  height: auto;
  min-height: 26px;
  padding: 4px 10px;
  border: 0;
  background: transparent;
  text-align: left;
  font-size: 0.88rem;
  cursor: pointer;
  color: inherit;
}
.desk-flyout-row > button.on,
.desk-flyout-row > button:hover {
  background: var(--desk-hover-bg, #e9ecef);
}
.desk-flyout-tick {
  width: 1em;
  color: var(--desk-text, #212529);
}
.desk-flyout-label {
  flex: 1;
}
.desk-flyout-icon {
  display: inline-flex;
  width: 1em;
  flex: none;
  margin-right: -4px;
}
.desk-flyout-icon svg,
.desk-flyout-end {
  width: 1em;
  height: 1em;
  flex: none;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.desk-flyout-end {
  color: var(--desk-muted, #6c757d);
}
/* Shown but refused: not permitted (denied colours, padlock) or not in the plan (alert tone, tag). */
.desk-flyout-row > button.desk-menu-refused-permission,
.desk-flyout-row > button.desk-menu-refused-permission .desk-flyout-refused {
  color: var(--desk-denied, #6b4fa0);
}
.desk-flyout-row > button.desk-menu-refused-plan .desk-flyout-refused {
  color: var(--desk-tone-alert, #b45309);
}
.desk-flyout-more {
  color: var(--desk-muted, #6c757d);
}
.desk-flyout .desk-flyout {
  top: 0;
  left: 100%;
}
.desk-flyout.up {
  top: auto;
  bottom: 100%;
}
.desk-flyout.up .desk-flyout {
  top: auto;
  bottom: 0;
}
</style>
