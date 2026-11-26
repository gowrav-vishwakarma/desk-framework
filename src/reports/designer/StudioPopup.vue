<template>
  <Teleport to="body">
    <div
      v-if="open"
      ref="panel"
      class="studio-popup"
      :style="place"
      role="dialog"
      @keydown.esc.stop.prevent="close"
      @keydown.tab="onTab"
    >
      <slot :close="close" />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';

/**
 * A panel that opens under (or over) the control that opened it, drawn on top of everything so a
 * scrolling pane does not cut it off. Escape, Tab out or a click outside closes it; focus goes back
 * to the control.
 */
const open = defineModel<boolean>('open', { required: true });
const props = withDefaults(
  defineProps<{ anchor: HTMLElement | null; width?: number | undefined }>(),
  { width: 0 },
);

const panel = ref<HTMLElement | null>(null);
const place = ref<Record<string, string>>({});
const GAP = 4;
const MARGIN = 8;

function position(): void {
  const anchor = props.anchor;
  const el = panel.value;
  if (!anchor || !el) return;
  const box = anchor.getBoundingClientRect();
  const width = Math.min(
    window.innerWidth - MARGIN * 2,
    Math.max(props.width || 0, box.width, 220),
  );
  const height = el.offsetHeight;
  const below = window.innerHeight - box.bottom - GAP - MARGIN;
  const above = box.top - GAP - MARGIN;
  const down = height <= below || below >= above;
  const left = Math.min(Math.max(MARGIN, box.left), window.innerWidth - width - MARGIN);
  place.value = {
    left: `${left}px`,
    width: `${width}px`,
    maxHeight: `${Math.max(160, down ? below : above)}px`,
    ...(down
      ? { top: `${box.bottom + GAP}px` }
      : { bottom: `${window.innerHeight - box.top + GAP}px` }),
  };
}

function close(): void {
  if (!open.value) return;
  open.value = false;
  props.anchor?.focus();
}

function onOutside(event: MouseEvent): void {
  const target = event.target as Node | null;
  if (!target || panel.value?.contains(target) || props.anchor?.contains(target)) return;
  // A popup opened from inside this one (a picker in a picker) is not outside.
  if ((target as Element).closest?.('.studio-popup')) return;
  open.value = false;
}

/** Tab past the last control leaves the panel: close it, as a menu does. */
function onTab(event: KeyboardEvent): void {
  const items = panel.value?.querySelectorAll<HTMLElement>(
    'input, button, select, textarea, [tabindex]:not([tabindex="-1"])',
  );
  if (!items?.length) return;
  const last = items[items.length - 1];
  const first = items[0];
  if (
    (!event.shiftKey && document.activeElement === last) ||
    (event.shiftKey && document.activeElement === first)
  ) {
    event.preventDefault();
    close();
  }
}

function listen(on: boolean): void {
  if (on) {
    document.addEventListener('mousedown', onOutside, true);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
  } else {
    document.removeEventListener('mousedown', onOutside, true);
    window.removeEventListener('resize', position);
    window.removeEventListener('scroll', position, true);
  }
}

watch(open, async (shown) => {
  listen(shown);
  if (!shown) return;
  await nextTick();
  position();
  const first = panel.value?.querySelector<HTMLElement>(
    '[data-autofocus], input, textarea, select, button',
  );
  first?.focus();
});

onBeforeUnmount(() => listen(false));
</script>

<style>
.studio-popup {
  position: fixed;
  z-index: 9000;
  display: flex;
  flex-direction: column;
  overflow: auto;
  background: var(--desk-row-bg);
  color: var(--desk-text);
  border: 1px solid var(--desk-grid-line);
  border-radius: 6px;
  box-shadow: 0 8px 28px rgb(0 0 0 / 0.18);
  font-size: var(--desk-font);
}
</style>
