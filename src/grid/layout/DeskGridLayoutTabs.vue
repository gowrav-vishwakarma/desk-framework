<template>
  <DeskTabs v-if="tabs.length > 1" :tabs="tabs" :model-value="active" label="Layouts" :in-url="false" focus-after @update:model-value="emit('select', $event)">
    <template v-if="live" #tab-end="{ item }">
      <span
        class="desk-tab-pin"
        :class="{ 'is-on': live.has(item.id) }"
        role="switch"
        :aria-checked="live.has(item.id)"
        :title="live.has(item.id) ? 'Kept: switching back shows the rows it last loaded. Click to load again on every switch.' : 'Loads again on every switch. Click to keep its rows until the page reloads.'"
        @click.stop="emit('pin', item.id)"
      >
        <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
          <path d="M9.8 1.5 14.5 6.2l-1.3 1.3-1-.4-2.6 2.6.3 2.9-1.2 1.2-2.6-2.6L2.4 14.9l-1.3-1.3 3.7-3.7L2.2 7.3l1.2-1.2 2.9.3 2.6-2.6-.4-1z" />
        </svg>
      </span>
    </template>
  </DeskTabs>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import DeskTabs from '../../form/DeskTabs.vue';
import { DESK_DEFAULT_LAYOUT_ID, type DeskGridLayout } from './types';

const props = defineProps<{
  layouts: readonly DeskGridLayout[];
  active: string;
  /** The active tab's filters differ from what it saved. Its label gets a dot. */
  modified?: boolean;
  /** Layouts kept live. Pass it on lists that keep rows per layout; each tab then shows a pin. */
  live?: ReadonlySet<string> | undefined;
}>();
const emit = defineEmits<{ select: [id: string]; pin: [id: string] }>();

const tabs = computed(() => {
  const builtin = props.layouts.find((layout) => layout.id === DESK_DEFAULT_LAYOUT_ID);
  const list = [
    { id: DESK_DEFAULT_LAYOUT_ID, label: builtin?.name ?? 'Default' },
    ...props.layouts
      .filter((layout) => layout.kind === 'tab' && layout.id !== DESK_DEFAULT_LAYOUT_ID)
      .map((layout) => ({ id: layout.id, label: layout.name })),
  ];
  if (!props.modified) return list;
  return list.map((tab) => (tab.id === props.active ? { ...tab, label: `${tab.label} •` } : tab));
});
</script>
