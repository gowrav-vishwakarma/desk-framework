<template>
  <div ref="rootEl" class="desk-fkey">
    <button
      v-for="item in items"
      v-show="!item.visible || item.visible()"
      :key="item.id"
      type="button"
      :class="{ 'is-icon': Boolean(item.icon) }"
      :title="item.label"
      :aria-label="item.label"
      :data-desk-toolbar="item.id"
      @click="runDeskAction(item.actionId)"
    >
      <svg v-if="item.icon === 'layout'" viewBox="0 0 16 16" aria-hidden="true">
        <rect x="1.5" y="1.5" width="13" height="13" rx="1" fill="none" stroke="currentColor" stroke-width="1.2" />
        <path d="M1.5 5h13" fill="none" stroke="currentColor" stroke-width="1.2" />
        <path d="M4 8h8M4 11h5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
      </svg>
      <svg v-else-if="item.icon === 'link'" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M6.5 9.5 9.5 6.5M5 11 4 12a2.12 2.12 0 0 1-3-3l1-1M11 5l1-1a2.12 2.12 0 0 1 3 3l-1 1" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
      </svg>
      <svg v-else-if="item.icon === 'scan'" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M2 2h3M2 2v3M14 2h-3M14 2v3M2 14h3M2 14v-3M14 14h-3M14 14v-3" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
        <path d="M4.5 8h1M7 8h2M11 8h.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
      </svg>
      <svg v-else-if="item.icon === 'settings'" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="2" fill="none" stroke="currentColor" stroke-width="1.2" />
        <path
          d="M8 1.5v1.8M8 12.7v1.8M1.5 8h1.8M12.7 8h1.8M3.4 3.4l1.3 1.3M11.3 11.3l1.3 1.3M3.4 12.6l1.3-1.3M11.3 4.7l1.3-1.3"
          fill="none"
          stroke="currentColor"
          stroke-width="1.2"
          stroke-linecap="round"
        />
        <circle cx="8" cy="8" r="4.6" fill="none" stroke="currentColor" stroke-width="1.2" />
      </svg>
      <template v-else>
        {{ item.label }}<span v-if="deskKeyLabel(item.actionId)">{{ deskKeyLabel(item.actionId) }}</span>
      </template>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useDeskAutomationNode } from '../automation/registry';
import { deskKeyLabel } from '../keys/deskKeymap';
import { runDeskAction } from '../keys/layers';
import { deskToolbarItems } from './toolbar';

const items = deskToolbarItems();
const rootEl = ref<HTMLElement | null>(null);

useDeskAutomationNode({
  kind: 'toolbar',
  name: () => 'toolbar',
  el: () => rootEl.value,
  read: () => ({
    buttons: items.map((item) => ({ id: item.id, label: item.label, action: item.actionId, visible: !item.visible || item.visible(), keys: deskKeyLabel(item.actionId) })),
  }),
  brief: () => ({ buttons: items.filter((item) => !item.visible || item.visible()).map((item) => item.id) }),
  ops: () => ({
    press: {
      description: 'Press a toolbar button by id',
      args: { id: { type: 'string' } },
      run: (args) => {
        const item = items.find((entry) => entry.id === String(args.id));
        if (!item) return { ok: false, error: `no toolbar button ${String(args.id)}`, reason: `buttons: ${items.map((entry) => entry.id).join(', ')}` };
        if (item.visible && !item.visible()) return { ok: false, error: `${item.id} is hidden right now` };
        return runDeskAction(item.actionId) ? { ok: true } : { ok: false, error: `no page handles ${item.actionId} right now` };
      },
    },
  }),
});
</script>

<style scoped>
.desk-fkey {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 4px 8px;
  background: var(--desk-header-bg, #e9ecef);
  border-bottom: 1px solid var(--desk-grid-line, lightgray);
  min-height: var(--desk-fkey-bar-min-height);
}

.desk-fkey button.is-icon {
  width: var(--desk-toolbar-height);
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.desk-fkey button.is-icon svg {
  width: var(--desk-toolbar-icon-size);
  height: var(--desk-toolbar-icon-size);
  display: block;
}
</style>
