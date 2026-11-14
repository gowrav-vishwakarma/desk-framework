<template>
  <DeskContextMenu v-if="ctx.state.value" :menu="ctx.state.value.menu" :x="ctx.state.value.x" :y="ctx.state.value.y" @close="ctx.close" />
</template>

<script setup lang="ts">
import { useDeskLayer } from '../keys/useDeskLayer';
import DeskContextMenu from '../menu/DeskContextMenu.vue';
import { useDeskContextMenu, type DeskFieldMenu } from '../menu/fieldMenu';
import { useDeskToolbar, type DeskToolbarItem } from './toolbar';

/**
 * A shell toolbar button that opens a menu under itself, such as a page's options gear.
 * The button shows while this is mounted. `actionId` also opens the menu from a shortcut.
 * Read once at setup.
 */
const props = defineProps<{
  id: string;
  label: string;
  icon?: DeskToolbarItem['icon'];
  /** Defaults to `id`. */
  actionId?: string;
  menu: DeskFieldMenu;
}>();

const action = props.actionId ?? props.id;
useDeskToolbar([{ id: props.id, label: props.label, actionId: action, ...(props.icon ? { icon: props.icon } : {}) }]);

const ctx = useDeskContextMenu(() => props.menu);

/** Open under the toolbar button, or near the top-left when the bar is not drawn. */
function toggle(): void {
  if (ctx.state.value) {
    ctx.close();
    return;
  }
  const button = document.querySelector(`[data-desk-toolbar="${props.id}"]`);
  const box = button instanceof HTMLElement ? button.getBoundingClientRect() : null;
  ctx.openAt(box?.left ?? 16, box?.bottom ?? 48);
}

useDeskLayer({ handlers: { [action]: toggle } });
</script>
