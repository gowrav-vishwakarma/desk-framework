<template>
  <form ref="rootEl" class="desk-form" @submit.prevent="onSubmit" @pointerdown.capture="arm" @keydown.capture="arm">
    <slot />
    <Teleport to="body">
      <div v-if="toasts.length > 0" class="desk-toasts" role="alert">
        <div v-for="issue in toasts" :key="`${issue.fieldId ?? ''}|${issue.message}`" class="desk-toast">{{ issue.message }}</div>
      </div>
    </Teleport>
  </form>
</template>

<script setup lang="ts">
import { computed, provide, reactive, ref, watch } from 'vue';
import { useDeskLayer } from '../keys/useDeskLayer';
import { DESK_FORM_DIRTY, type DeskFormDirty } from './formDirty';
import { DESK_FORM_ISSUES, unplacedIssues, type DeskIssue } from './issues';
import { commitOpenEditors } from './openEditors';
import { useDeskDirty } from './leaveGuard';
import { useDeskAutomationNode } from '../automation/registry';
import { deskEvent } from '../automation/events';

const props = withDefaults(
  defineProps<{
    /** Field id to focus when the page opens. Omit to focus the first visible field or grid. */
    initialFocus?: string;
    /** When true, do not move focus when the page opens. */
    disableInitialFocus?: boolean;
    /** When true, Ctrl+Arrow is not a field move on this page. */
    disableSpatialMove?: boolean;
    /** A plain Enter with nothing focused puts focus back on the last (or first) field. Desktop only. */
    refocusOnEnter?: boolean;
    /**
     * Problems to show. A field on screen shows its own; the rest stay as toasts until their
     * field mounts or the problem leaves this list. The page decides when the list fills.
     */
    issues?: readonly DeskIssue[];
    /**
     * Problems the server returned. Same display as `issues`, and a field the user edits hides
     * its own until this list is replaced (the next save).
     */
    serverIssues?: readonly DeskIssue[];
    /**
     * The form's one unsaved-changes tracker (`useDeskFormDirty`). The form arms it on the first
     * input, registers the page leave check and lets sub-forms join it. Read once at setup.
     * Omit it on a page that calls `useDeskDirty` itself.
     */
    dirty?: DeskFormDirty;
    /** Name in the automation tree. Defaults to `form`. */
    name?: string;
  }>(),
  { disableInitialFocus: false, disableSpatialMove: false, refocusOnEnter: true, issues: () => [], serverIssues: () => [] },
);
const emit = defineEmits<{ save: [] }>();

/** A cell still being typed in (no Enter yet) counts as entered. */
function onSubmit(): void {
  commitOpenEditors();
  emit('save');
}

const tracker = props.dirty;
if (tracker) {
  provide(DESK_FORM_DIRTY, tracker);
  useDeskDirty(() => tracker.dirty.value, () => tracker.pendingSave());
}

function arm(): void {
  tracker?.arm();
}

useDeskLayer({
  ...(props.initialFocus === undefined ? {} : { initialFocus: props.initialFocus }),
  disableInitialFocus: props.disableInitialFocus,
  disableSpatialMove: props.disableSpatialMove,
  refocusOnEnter: props.refocusOnEnter,
});

/** Fields on screen, counted so a field that remounts in one tick is not lost. */
const mounted = reactive(new Map<string, number>());
/** Fields the user changed since the server list last arrived. */
const edited = ref(new Set<string>());

watch(
  () => props.serverIssues,
  () => {
    edited.value = new Set();
  },
);

/** Client rules, then server problems the user has not edited away. */
const shown = computed(() => [
  ...props.issues,
  ...props.serverIssues.filter((issue) => issue.fieldId === undefined || !edited.value.has(issue.fieldId)),
]);
const toasts = computed(() => unplacedIssues(shown.value, (id) => mounted.has(id)));

provide(DESK_FORM_ISSUES, {
  issueFor: (fieldId) => shown.value.find((issue) => issue.fieldId === fieldId)?.message ?? null,
  mount(fieldId) {
    mounted.set(fieldId, (mounted.get(fieldId) ?? 0) + 1);
    return () => {
      const left = (mounted.get(fieldId) ?? 1) - 1;
      if (left <= 0) mounted.delete(fieldId);
      else mounted.set(fieldId, left);
    };
  },
  edited(fieldId) {
    if (edited.value.has(fieldId)) return;
    const next = new Set(edited.value);
    next.add(fieldId);
    edited.value = next;
  },
});

const rootEl = ref<HTMLElement | null>(null);

watch(
  () => toasts.value.map((issue) => issue.message).join('\n'),
  (now, before) => {
    for (const message of now.split('\n')) if (message && !(before ?? '').split('\n').includes(message)) deskEvent('toast', message);
  },
);

useDeskAutomationNode({
  kind: 'form',
  name: () => props.name || 'form',
  el: () => rootEl.value,
  read: () => ({
    dirty: tracker ? tracker.dirty.value : null,
    changed: tracker ? tracker.changed.value : null,
    issues: shown.value.map((issue) => ({ field: issue.fieldId ?? null, message: issue.message })),
    toasts: toasts.value.map((issue) => issue.message),
    fieldsOnScreen: [...mounted.keys()],
  }),
  brief: () => ({ dirty: tracker ? tracker.dirty.value : null, issue: shown.value[0]?.message ?? null }),
  ops: () => ({
    save: { description: 'Save the form, as the Save key does', run: () => emit('save') },
    ...(tracker
      ? { isDirty: { description: 'Is one top-level key dirty', args: { key: { type: 'string' } }, run: (args: Record<string, unknown>) => tracker.isDirty(String(args.key)) } }
      : {}),
  }),
});
</script>