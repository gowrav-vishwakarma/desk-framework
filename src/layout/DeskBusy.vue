<template>
  <div v-if="shown" class="desk-busy" role="status" aria-live="polite">
    <div class="desk-busy-bar" />
    <div class="desk-busy-chip">
      <span class="desk-busy-spin" aria-hidden="true" />
      {{ label }}<span v-if="seconds > 0" class="desk-busy-time"> {{ seconds }}s</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { beginDeskWork } from '../automation/busy';

/**
 * Says that something is loading, over the content it covers (the parent must be positioned).
 * It waits a moment before it shows, so a quick load does not flicker, and counts the seconds
 * after that, so a slow report shows it is still working. The content under it stays visible.
 */
const props = withDefaults(defineProps<{ active: boolean; label?: string; delayMs?: number }>(), { label: 'Loading…', delayMs: 250 });

const shown = ref(false);
const seconds = ref(0);
let delay: ReturnType<typeof setTimeout> | null = null;
let tick: ReturnType<typeof setInterval> | null = null;
let started = 0;
let endWork: (() => void) | null = null;

function stop(): void {
  endWork?.();
  endWork = null;
  if (delay) clearTimeout(delay);
  if (tick) clearInterval(tick);
  delay = null;
  tick = null;
  shown.value = false;
  seconds.value = 0;
}

watch(
  () => props.active,
  (active) => {
    stop();
    if (!active) return;
    started = Date.now();
    endWork = beginDeskWork(props.label ?? 'busy');
    delay = setTimeout(() => {
      shown.value = true;
      tick = setInterval(() => {
        seconds.value = Math.floor((Date.now() - started) / 1000);
      }, 1000);
    }, props.delayMs ?? 250);
  },
  { immediate: true },
);

onBeforeUnmount(stop);
</script>
