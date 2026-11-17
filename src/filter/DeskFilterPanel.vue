<template>
  <section ref="rootEl" class="desk-filter-panel" :class="{ 'is-open': open }">
    <button v-if="!open" type="button" class="desk-filter-summary" :title="`Change filter (${hint})`" @click="openPanel">
      <span class="desk-filter-sentence"><template v-for="(part, index) in parts" :key="index"><strong v-if="part.value" class="desk-filter-value">{{ part.text }}</strong><span v-else>{{ part.text }}</span></template></span>
      <span class="desk-filter-hint">{{ hint }}</span>
    </button>
    <DeskFilterBody v-else :spec="spec" :initial="values" @apply="onApply" @cancel="closePanel" />
  </section>
</template>

<script setup lang="ts" generic="V extends DeskFilterValues">
import { computed, nextTick, ref } from 'vue';
import { useDeskAutomationNode, resolveDeskPath } from '../automation/registry';
import { runDeskOp } from '../automation/outcome';
import { deskKeyLabel } from '../keys/deskKeymap';
import { useDeskLayer } from '../keys/useDeskLayer';
import DeskFilterBody from './DeskFilterBody.vue';
import { deskPhraseParts, markedDeskFilter } from './describe';
import type { DeskFilterSpec, DeskFilterValues } from './types';

const props = withDefaults(defineProps<{ spec: DeskFilterSpec<V>; shortcut?: boolean; name?: string }>(), { shortcut: true, name: 'params' });
/** The applied values. The page reads them to build its request. */
const values = defineModel<V>('values', { required: true });
const emit = defineEmits<{ apply: [values: V]; applied: []; close: [] }>();

const open = ref(false);
const marked = computed(() => markedDeskFilter(props.spec, values.value));
/** Values bold, the words around them quieter. */
const parts = computed(() => deskPhraseParts(marked.value));
const hint = computed(() => deskKeyLabel('action-filter') || 'Ctrl+F');

function openPanel(): void {
  open.value = true;
}

function closePanel(): void {
  open.value = false;
  emit('close');
}

function onApply(next: V): void {
  values.value = next;
  open.value = false;
  emit('apply', next);
  void nextTick(() => emit('applied'));
}

if (props.shortcut) useDeskLayer({ handlers: { 'action-filter': openPanel } });

const rootEl = ref<HTMLElement | null>(null);

const filterHandle = useDeskAutomationNode({
  kind: 'filter',
  name: () => props.name,
  el: () => rootEl.value,
  read: () => ({
    open: open.value,
    values: { ...values.value },
    phrase: parts.value.map((part) => part.text).join(''),
    fields: props.spec.fields.map((field) => ({ key: field.key, label: field.label, editor: field.editor, required: field.required === true })),
  }),
  brief: () => ({ open: open.value, values: { ...values.value } }),
  ops: () => ({
    open: { description: 'Open the filter panel', run: () => openPanel() },
    close: { description: 'Close without applying', run: () => closePanel() },
    apply: {
      description: 'Open the panel, set the given values, and apply',
      args: { values: { type: 'object', optional: true } },
      run: async (args) => {
        if (!open.value) openPanel();
        await nextTick();
        await nextTick();
        const base = filterHandle.path();
        const node = resolveDeskPath(`${base}/settings:desk-filter`);
        if (!node.node) return { ok: false, error: 'the filter fields did not open' };
        const given = (args.values ?? {}) as Record<string, unknown>;
        if (Object.keys(given).length > 0) {
          const outcome = await runDeskOp(node, 'setMany', { values: given });
          if (!outcome.ok) return { ok: false, error: outcome.error ?? 'could not set the filter values', reason: outcome.reason };
        }
        const button = document.querySelector('[data-desk-field="desk-filter-apply"]');
        if (button instanceof HTMLElement) button.click();
        return { ok: true };
      },
    },
  }),
});

defineExpose({ open: openPanel, close: closePanel });
</script>
