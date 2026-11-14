<template>
  <Teleport to="body">
    <div ref="root" class="desk-lookup-menu desk-context-menu" role="menu" :style="style" @mousedown.prevent>
      <template v-for="group in groups" :key="group.id">
        <div v-if="group.label" class="desk-context-menu-label">{{ group.label }}</div>
        <button
          v-for="item in group.items"
          :key="`${group.id}:${item.id}`"
          type="button"
          class="desk-grid-menu-item"
          :class="[isActive(group.id, item.id) ? 'on' : '', item.tone ? `desk-tone-${item.tone}` : '']"
          :disabled="item.disabled === true"
          :title="item.title ?? ''"
          role="menuitem"
          @mouseenter="activate(group.id, item.id)"
          @click="choose(group, item)"
        >
          <span class="desk-grid-menu-check">{{ item.checked ? '✓' : '' }}</span>
          {{ item.label }}
        </button>
      </template>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { claimDeskKey } from '../focus/useDeskFocus';
import { plainText } from '../automation/text';
import { useDeskAutomationNode } from '../automation/registry';
import type { DeskFieldMenu, DeskMenuGroup, DeskMenuItem } from './fieldMenu';

/** Mount it while the menu is open. It closes itself on Escape and on a click outside. */
const props = defineProps<{ menu: DeskFieldMenu; x: number; y: number }>();
const emit = defineEmits<{ close: [] }>();

const root = ref<HTMLElement | null>(null);
const top = ref(props.y);
const left = ref(props.x);
/** Bumped after a pick so the groups are read again. */
const revision = ref(0);
const active = ref(-1);

const groups = computed(() => {
  void revision.value;
  return props.menu.groups();
});

const flat = computed(() =>
  groups.value.flatMap((group) => group.items.filter((item) => !item.disabled).map((item) => ({ group, item }))),
);

const style = computed(() => ({ top: `${top.value}px`, left: `${left.value}px` }));

function isActive(groupId: string, itemId: string): boolean {
  const current = flat.value[active.value];
  return current?.group.id === groupId && current.item.id === itemId;
}

function activate(groupId: string, itemId: string): void {
  active.value = flat.value.findIndex((entry) => entry.group.id === groupId && entry.item.id === itemId);
}

function choose(group: DeskMenuGroup, item: DeskMenuItem): void {
  if (item.disabled) return;
  props.menu.choose(group.id, item.id);
  revision.value += 1;
  if (group.mode !== 'check') emit('close');
}

function onKey(event: KeyboardEvent): void {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const key = event.key;
  if (key === 'Escape') {
    handled(event);
    emit('close');
    return;
  }
  const count = flat.value.length;
  if (key === 'ArrowDown' || key === 'ArrowUp') {
    handled(event);
    if (count === 0) return;
    const delta = key === 'ArrowDown' ? 1 : -1;
    active.value = active.value < 0 ? (delta > 0 ? 0 : count - 1) : (active.value + delta + count) % count;
    return;
  }
  if (key === 'Enter' || key === ' ') {
    const node = event.target;
    const inside = node instanceof Node && Boolean(root.value?.contains(node));
    // Focus is still on the button that opened this menu. Enter belongs to that button until
    // an arrow has moved into the list, so another row's menu can open and this one closes.
    if (!inside && active.value < 0) return;
    handled(event);
    const entry = flat.value[active.value];
    if (entry) choose(entry.group, entry.item);
  }
}

/** The menu owns these keys while open, so the field under it does not also act on them. */
function handled(event: KeyboardEvent): void {
  claimDeskKey(event);
  event.preventDefault();
  event.stopPropagation();
}

function onDocDown(event: Event): void {
  const node = event.target;
  if (node instanceof Node && root.value?.contains(node)) return;
  emit('close');
}

onMounted(() => {
  window.addEventListener('keydown', onKey, true);
  // Capture: the actions cell stops mousedown, which would otherwise leave this menu open.
  document.addEventListener('mousedown', onDocDown, true);
  void nextTick(() => {
    const box = root.value?.getBoundingClientRect();
    if (!box) return;
    top.value = Math.max(4, Math.min(props.y, window.innerHeight - box.height - 4));
    left.value = Math.max(4, Math.min(props.x, window.innerWidth - box.width - 4));
  });
});

onUnmounted(() => {
  window.removeEventListener('keydown', onKey, true);
  document.removeEventListener('mousedown', onDocDown, true);
});

useDeskAutomationNode({
  kind: 'contextmenu',
  name: () => 'context',
  el: () => root.value,
  modal: false,
  read: () => ({
    groups: groups.value.map((group) => ({
      id: group.id,
      label: group.label ?? '',
      mode: group.mode ?? 'pick',
      items: group.items.map((item) => ({ id: item.id, label: item.label, checked: item.checked === true, disabled: item.disabled === true, ...(item.title ? { reason: item.title } : {}) })),
    })),
    highlighted: flat.value[active.value]?.item.label ?? null,
  }),
  brief: () => ({ groups: groups.value.map((group) => group.items.map((item) => `${item.id}:${item.checked ? 1 : 0}`)) }),
  ops: () => ({
    choose: {
      description: 'Choose a row by group id and item id (or item label)',
      args: { group: { type: 'string', optional: true }, item: { type: 'string' } },
      run: (args) => {
        const wantedItem = String(args.item).toLowerCase();
        for (const group of groups.value) {
          if (args.group && group.id !== plainText(args.group)) continue;
          const item = group.items.find((entry) => entry.id.toLowerCase() === wantedItem || entry.label.toLowerCase() === wantedItem);
          if (!item) continue;
          if (item.disabled) return { ok: false, error: `${item.label} is disabled`, reason: item.title ?? '' };
          choose(group, item);
          return { ok: true };
        }
        return { ok: false, error: `no menu row ${String(args.item)}`, reason: `rows: ${groups.value.flatMap((group) => group.items.map((entry) => entry.label)).join(' | ')}` };
      },
    },
    close: { description: 'Close the menu, as Escape does', run: () => emit('close') },
  }),
});
</script>