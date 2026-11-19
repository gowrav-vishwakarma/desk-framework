<template>
  <form ref="rootEl" class="desk-form" @submit.prevent="onSubmit" @pointerdown.capture="arm" @keydown.capture="arm">
    <div v-if="restoredAt !== null" class="desk-form-draft" data-desk-draft role="status">
      <span>Unsaved changes from {{ restoredAt }} restored.</span>
      <button type="button" class="desk-form-draft__discard" data-desk-action="form-draft-discard" @click="discardDraft">Discard them</button>
    </div>
    <div v-if="display === 'header' && toasts.length > 0" class="desk-form-issues" role="alert">
      <div v-for="issue in toasts" :key="`${issue.fieldId ?? ''}|${issue.message}`" class="desk-form-issue desk-error">{{ issue.message }}</div>
    </div>
    <slot />
    <Teleport to="body">
      <div v-if="display === 'toast' && toasts.length > 0" class="desk-toasts" role="alert">
        <div v-for="issue in toasts" :key="`${issue.fieldId ?? ''}|${issue.message}`" class="desk-toast">{{ issue.message }}</div>
      </div>
    </Teleport>
  </form>
</template>

<script setup lang="ts">
import { computed, nextTick, provide, reactive, ref, watch } from 'vue';
import { useDeskLayer } from '../keys/useDeskLayer';
import { DESK_FORM_DIRTY, type DeskFormDirty } from './formDirty';
import { DESK_FORM_ISSUES, unplacedIssues, type DeskIssue, type DeskIssueTabs } from './issues';
import { DESK_UNPLACED_ISSUES } from './issueDisplay';
import { commitOpenEditors } from './openEditors';
import { useDeskDirty } from './leaveGuard';
import { deskHost } from '../host';
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
     * Problems to show. A field on screen shows its own; the rest show in the form's header strip
     * until their field mounts or the problem leaves this list. The page decides when the list fills.
     */
    issues?: readonly DeskIssue[];
    /**
     * Problems the server returned. Same display as `issues`, and a field the user edits hides
     * its own until this list is replaced (the next save). When the list arrives, the first
     * issue's field takes the focus, its tab opened first when it is in a closed one.
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
    /**
     * Figures the page shows that are not fields (a footer's totals, a balance): merged into the form node's `read()`,
     * so a test or an agent reads what the user sees. Read only; keys must not clash with the form's own.
     */
    readout?: () => Record<string, unknown>;
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

/** When the restored draft was saved, as the host's locale writes a time; null when none is on the form. */
const restoredAt = computed(() => {
  const at = tracker?.draft.restoredAt.value;
  return at ? new Date(at).toLocaleString(deskHost().locale?.(), { dateStyle: 'medium', timeStyle: 'short' }) : null;
});

function discardDraft(): void {
  void tracker?.draft.discard();
}

useDeskLayer({
  ...(props.initialFocus === undefined ? {} : { initialFocus: props.initialFocus }),
  disableInitialFocus: props.disableInitialFocus,
  disableSpatialMove: props.disableSpatialMove,
  refocusOnEnter: props.refocusOnEnter,
});

/** Where unplaced issues show: the one switch in `issueDisplay.ts`. */
const display = DESK_UNPLACED_ISSUES as string;

/** Fields on screen, counted so a field that remounts in one tick is not lost. */
const mounted = reactive(new Map<string, number>());
/** How to focus each field on screen (the last one mounted with that id). */
const focusers = new Map<string, () => boolean>();
/** Tab strips inside the form that name their tabs' fields. */
const tabStrips = new Set<DeskIssueTabs>();
/** Fields the user changed since the server list last arrived. */
const edited = ref(new Set<string>());

watch(
  () => props.serverIssues,
  (issues) => {
    edited.value = new Set();
    void revealFirst(issues);
  },
);

/** The first server issue with a field: its tab opened when closed, then the field focused. */
async function revealFirst(issues: readonly DeskIssue[]): Promise<void> {
  const first = issues.find((issue) => issue.fieldId !== undefined);
  const fieldId = first?.fieldId;
  if (!fieldId) return;
  if (!mounted.has(fieldId)) {
    const strip = [...tabStrips].find((holder) => holder.tabOf(fieldId) !== null);
    if (!strip) return;
    strip.open(strip.tabOf(fieldId)!);
    // The tab's pane mounts its fields over the next ticks.
    for (let tick = 0; tick < 10 && !mounted.has(fieldId); tick += 1) await nextTick();
  }
  await nextTick();
  focusers.get(fieldId)?.();
}

/** Client rules, then server problems the user has not edited away. */
const shown = computed(() => [
  ...props.issues,
  ...props.serverIssues.filter((issue) => issue.fieldId === undefined || !edited.value.has(issue.fieldId)),
]);
const toasts = computed(() => unplacedIssues(shown.value, (id) => mounted.has(id)));

provide(DESK_FORM_ISSUES, {
  issueFor: (fieldId) => shown.value.find((issue) => issue.fieldId === fieldId)?.message ?? null,
  mount(fieldId, focus) {
    mounted.set(fieldId, (mounted.get(fieldId) ?? 0) + 1);
    if (focus) focusers.set(fieldId, focus);
    return () => {
      const left = (mounted.get(fieldId) ?? 1) - 1;
      if (left <= 0) {
        mounted.delete(fieldId);
        focusers.delete(fieldId);
      } else mounted.set(fieldId, left);
    };
  },
  tabs(holder) {
    tabStrips.add(holder);
    return () => tabStrips.delete(holder);
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
    ...(props.readout?.() ?? {}),
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