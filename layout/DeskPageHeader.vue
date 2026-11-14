<template>
  <header class="desk-page-header">
    <div class="desk-page-header__lead">
      <slot name="title">
        <h1 class="desk-page-header__title">{{ title }}</h1>
      </slot>
      <p v-if="subtitle" class="desk-page-header__subtitle">{{ subtitle }}</p>
    </div>
    <div v-if="$slots.actions" ref="actionsEl" class="desk-page-header__actions">
      <slot name="actions" />
    </div>
    <div v-if="$slots.meta" class="desk-page-header__meta">
      <slot name="meta" />
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useDeskAutomationNode } from '../automation/registry';
import { headerButtons, pressHeaderButton } from './headerButtons';

defineProps<{
  title: string;
  subtitle?: string;
}>();

const actionsEl = ref<HTMLElement | null>(null);

useDeskAutomationNode({
  kind: 'toolbar',
  name: () => 'header',
  el: () => actionsEl.value,
  read: () => ({ buttons: headerButtons(actionsEl.value) }),
  brief: () => ({ buttons: headerButtons(actionsEl.value).filter((button) => !button.disabled).map((button) => button.id) }),
  ops: () => ({
    press: {
      description: 'Click a header button by id or label, the same as a mouse click',
      args: { id: { type: 'string', description: 'button id or its label' } },
      run: (args) => pressHeaderButton(actionsEl.value, String(args.id)),
    },
  }),
});
</script>
