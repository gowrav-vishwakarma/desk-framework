<template>
  <DeskCombo
    v-if="kind === 'select' || kind === 'check'"
    v-model="text"
    variant="grid"
    :options="kind === 'check' ? YES_NO : options"
    :select-all="selectAll ?? true"
    v-bind="menuAttrs"
    @advance="(via) => (via === 'tab' ? emit('tab', false) : emit('commit'))"
    @back="(via) => (via === 'enter' ? emit('back') : emit('tab', true))"
    @cancel="emit('cancel')"
  />
  <DeskDateInput
    v-else-if="kind === 'date'"
    variant="grid"
    :model-value="text === '' ? null : text"
    :select-all="selectAll ?? true"
    v-bind="menuAttrs"
    @update:model-value="text = $event ?? ''"
    @advance="(via) => (via === 'tab' ? emit('tab', false) : emit('commit'))"
    @back="(via) => (via === 'enter' ? emit('back') : emit('tab', true))"
    @cancel="emit('cancel')"
  />
  <template v-else>
    <input
      ref="box"
      class="input-box"
      :value="text"
      @input="onInput"
      @keydown="onKey"
      @contextmenu="ctx.open($event)"
    />
    <DeskContextMenu
      v-if="ctx.state.value"
      :menu="ctx.state.value.menu"
      :x="ctx.state.value.x"
      :y="ctx.state.value.y"
      @close="ctx.close"
    />
  </template>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { DeskSelectOption } from '../types';
import DeskCombo from '../../form/DeskCombo.vue';
import DeskDateInput from '../../date/DeskDateInput.vue';
import DeskContextMenu from '../../menu/DeskContextMenu.vue';
import { useDeskContextMenu, type DeskFieldMenu } from '../../menu/fieldMenu';
import { YES_NO } from '../../form/yesNo';
import { claimDeskKey, isDeskNavKey } from '../../focus/useDeskFocus';
import { keyInputOf, toCombo } from '../../keys/combo';
import { deskActionsFor } from '../../keys/deskKeymap';

const text = defineModel<string>({ required: true });
const props = defineProps<{
  kind: string;
  options: DeskSelectOption[];
  selectAll?: boolean;
  /** The column's right-click menu. */
  menu?: DeskFieldMenu;
}>();
const emit = defineEmits<{
  commit: [];
  cancel: [];
  /** Tab or Shift+Tab (`back`). The grid decides where that goes. */
  tab: [back: boolean];
  /** Shift+Enter. The grid commits and moves to the previous cell. */
  back: [];
  /** The open-dialog shortcut. The grid commits, then opens even if the value did not change. */
  dialog: [];
}>();

const box = ref<HTMLInputElement | null>(null);
const ctx = useDeskContextMenu(() => props.menu ?? null);
const menuAttrs = computed(() => (props.menu ? { menu: props.menu } : {}));

function onInput(event: Event): void {
  text.value = (event.target as HTMLInputElement).value;
}

function onKey(event: KeyboardEvent): void {
  if (isDeskNavKey(event)) return;
  claimDeskKey(event);
  if (event.key === 'Escape') {
    event.preventDefault();
    emit('cancel');
    return;
  }
  const combo = toCombo(keyInputOf(event));
  if (combo && deskActionsFor(combo).includes('grid-cell-dialog')) {
    event.preventDefault();
    emit('dialog');
    return;
  }
  if (event.key === 'Enter' && event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault();
    emit('back');
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    emit('commit');
    return;
  }
  if (event.key === 'Tab') {
    event.preventDefault();
    emit('tab', event.shiftKey);
  }
}

onMounted(() => {
  const input = box.value;
  if (!input) return;
  input.focus();
  const end = input.value.length;
  if (props.selectAll === false) input.setSelectionRange(end, end);
  else input.select();
});
</script>
