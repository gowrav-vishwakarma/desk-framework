<template>
  <button
    v-for="action in buttons"
    :key="action.name"
    type="button"
    :class="deskActionClass(action)"
    :disabled="action.disabled"
    :data-desk-action="action.name"
    v-bind="action.title ? { title: action.title } : {}"
    @click="emit('action', action.name)"
  >
    {{ action.label }}
  </button>
  <button
    v-if="menu.length > 0"
    type="button"
    class="desk-row-actions-more"
    aria-label="More actions"
    @click="openMenu"
  >
    ⋮
  </button>
  <DeskContextMenu
    v-if="ctx.state.value"
    :menu="ctx.state.value.menu"
    :x="ctx.state.value.x"
    :y="ctx.state.value.y"
    @close="ctx.close"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { deskActionClass } from './actionClass';
import { splitRowActions } from './rowActions';
import type { DeskRowAction } from './types';
import DeskContextMenu from '../menu/DeskContextMenu.vue';
import { useDeskContextMenu } from '../menu/fieldMenu';

const props = defineProps<{ actions: readonly DeskRowAction[] }>();
const emit = defineEmits<{ action: [name: string] }>();

const partitioned = computed(() => splitRowActions(props.actions));
const buttons = computed(() => partitioned.value.buttons);
const menu = computed(() => partitioned.value.menu);

const ctx = useDeskContextMenu(() => {
  if (menu.value.length === 0) return null;
  return {
    groups: () => [
      {
        id: 'row-actions',
        mode: 'action',
        items: menu.value.map((action) => ({
          id: action.name,
          label: action.label,
          disabled: action.disabled,
          ...(action.title ? { title: action.title } : {}),
          ...(action.tone ? { tone: action.tone } : {}),
        })),
      },
    ],
    choose(_groupId, itemId) {
      emit('action', itemId);
      ctx.close();
    },
  };
});

function openMenu(event: MouseEvent): void {
  const button = event.currentTarget;
  if (!(button instanceof HTMLElement)) {
    ctx.open(event);
    return;
  }
  // Enter and Space click the button with clientX and clientY at 0, which would pin the menu
  // to the top-left of the window. Anchor it under the button for both pointer and keyboard.
  const box = button.getBoundingClientRect();
  event.preventDefault();
  ctx.openAt(box.left, box.bottom);
}
</script>
