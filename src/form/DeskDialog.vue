<template>
  <Teleport to="body">
    <div v-if="open" ref="root" class="desk-dialog" :class="{ 'is-front': front }" data-desk-layer @mousedown.self="close" @keydown.esc="onEscape" @keydown="onDeskCheckboxKey">
      <div class="desk-dialog-panel" :class="panelClass" @keydown="onPanelKeydown">
        <slot />
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { provideDeskLayer } from '../keys/useDeskLayer';
import { focusPrevDeskField, onDeskCheckboxKey } from '../focus/useDeskFocus';
import { deskLayers, topDeskLayer, type DeskHandlerInput } from '../keys/layers';
import { commitOpenEditors } from './openEditors';
import { useDeskAutomationNode } from '../automation/registry';
import { deskEvent } from '../automation/events';
import { focusInfo, isShown, shownText } from '../automation/visible';

const open = defineModel<boolean>('open', { required: true });
const props = withDefaults(
  defineProps<{
    initialFocus?: string;
    disableInitialFocus?: boolean;
    /** When true, Ctrl+Arrow is not a field move in this dialog. */
    disableSpatialMove?: boolean;
    /** Extra key handlers while this dialog is open, by action id. */
    keys?: Record<string, DeskHandlerInput>;
    /** Extra class on the panel, for a dialog that needs more room. */
    panelClass?: string;
    /** Draw above another dialog, for a question that opens over a form. */
    front?: boolean;
    /** A page opened in a dialog. It stacks with every other dialog, under the questions (`front`) it asks. */
    page?: boolean;
    /**
     * Asked before Escape, a click outside or the cancel key closes the dialog. Resolve false to keep it
     * open, for an unsaved-changes question. The dialog never closes in between.
     */
    confirmClose?: () => Promise<boolean>;
    /** Escape closes the dialog, also when a click left nothing focused. Off keeps the dialog open. */
    escapeCancels?: boolean;
    /** A plain Enter with nothing focused puts focus back on the last (or first) field. Desktop only. */
    refocusOnEnter?: boolean;
    /** Name in the automation tree. Without it the heading text names the dialog. */
    name?: string;
  }>(),
  {
    disableInitialFocus: false,
    disableSpatialMove: false,
    keys: () => ({}),
    panelClass: '',
    front: false,
    page: false,
    escapeCancels: true,
    refocusOnEnter: true,
  },
);
const emit = defineEmits<{ close: []; accept: [] }>();
const root = ref<HTMLElement | null>(null);
let opener: HTMLElement | null = null;

function finish(): void {
  open.value = false;
  emit('close');
}

function close(): void {
  if (!props.confirmClose) {
    finish();
    return;
  }
  void props.confirmClose().then((ok) => {
    if (ok && open.value) finish();
  });
}

/** A widget that used Escape (a grid clearing its search) keeps the dialog open. */
function onEscape(event: KeyboardEvent): void {
  if (event.defaultPrevented) return;
  const top = topDeskLayer();
  // Focus can still sit in a dialog underneath. Escape belongs to the top layer.
  if (top && top !== layer) {
    if (top.modal && top.onEscape) {
      event.preventDefault();
      event.stopPropagation();
      top.onEscape();
    }
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  if (props.escapeCancels) close();
}

/** Later dialogs paint above earlier ones. Every dialog is above the host header; a question sits above the dialog it asks about. */
function raise(): void {
  const el = root.value;
  if (!el) return;
  const modals = deskLayers().filter((item) => item.modal);
  const index = Math.max(0, modals.indexOf(layer));
  const base = props.front ? 2200 : 2100;
  el.style.zIndex = String(base + index);
}

function accept(): void {
  // A cell still being typed in (no Enter yet) counts as entered.
  commitOpenEditors();
  emit('accept');
}

function onPanelKeydown(event: KeyboardEvent): void {
  if (event.defaultPrevented) return;
  if (event.key !== 'Enter' || !event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const field = target.closest('[data-desk-field]');
  if (!(field instanceof HTMLElement)) return;
  const button = target.closest('button');
  if (!button || !field.contains(button)) return;
  const id = field.getAttribute('data-desk-field');
  if (!id) return;
  event.preventDefault();
  focusPrevDeskField(id);
}

const layer = provideDeskLayer({
  root,
  modal: true,
  active: open,
  handlers: {
    'action-save': accept,
    'action-form-save': accept,
    'action-cancel': close,
    ...props.keys,
  },
  initialFocus: () => props.initialFocus,
  disableInitialFocus: () => props.disableInitialFocus,
  disableSpatialMove: () => props.disableSpatialMove,
  onAccept: accept,
  onEscape: () => {
    if (props.escapeCancels) close();
  },
  refocusOnEnter: () => props.refocusOnEnter,
});

/** The focused field when this dialog took the screen. A confirm dialog mounts already open, so the open watch never sees the change. */
function remember(): void {
  const current = document.activeElement;
  if (!(current instanceof HTMLElement) || current === document.body) return;
  if (root.value?.contains(current)) return;
  opener = current;
}

function restore(): void {
  const back = opener;
  opener = null;
  if (!back) return;
  void nextTick(() => {
    const lost = !document.activeElement || document.activeElement === document.body;
    if (lost && back.isConnected) back.focus();
  });
}

// A dialog created already open never changes `open`, so the watch does not run.
// Remember before children mount: a grid that focuses on mount must not hide the opener.
if (open.value) remember();

onMounted(() => {
  if (!open.value) return;
  remember();
  void nextTick(() => raise());
});

onUnmounted(restore);

watch(
  open,
  (shown) => {
    if (shown) {
      layer.lastFieldId = null;
      remember();
      void nextTick(() => raise());
      return;
    }
    restore();
  },
  { flush: 'sync' },
);

const ANSWERS: Record<string, string[]> = {
  ok: ['confirm-yes'],
  yes: ['confirm-yes'],
  cancel: ['confirm-no', 'sheet-cancel'],
  no: ['confirm-no'],
  save: ['leave-save', 'sheet-save'],
  keep: ['leave-keep'],
  lose: ['leave-lose'],
};

function slug(text: string): string {
  return text.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

function dialogTitle(): string {
  return shownText(root.value?.querySelector('h3, h2, .desk-sheet-head h3'));
}

function buttons(): { id: string; text: string; enabled: boolean }[] {
  const found = root.value?.querySelectorAll('button[data-desk-field], button[data-form-save-btn]') ?? [];
  return [...found].map((el) => ({
    id: el.getAttribute('data-desk-field') ?? '',
    text: shownText(el),
    enabled: !(el as HTMLButtonElement).disabled,
  }));
}

function control(id: string): HTMLElement | { ok: false; error: string; reason: string } {
  const el = [...(root.value?.querySelectorAll('[data-desk-field]') ?? [])].find((item) => item.getAttribute('data-desk-field') === id);
  return el instanceof HTMLElement ? el : { ok: false, error: `no control ${id} in this dialog`, reason: `controls: ${buttons().map((item) => item.id).join(', ')}` };
}

/** The control a person clicks to answer `choice` (the first of its ids the dialog has). */
function answerControl(choice: string): HTMLElement | { ok: false; error: string; reason: string } {
  for (const id of ANSWERS[choice] ?? []) {
    const el = control(id);
    if (el instanceof HTMLElement) return el;
  }
  return { ok: false, error: `this dialog has no answer ${choice}`, reason: `controls: ${buttons().map((item) => item.id).join(', ')}` };
}

function press(id: string): unknown {
  const el = control(id);
  if (!(el instanceof HTMLElement)) return el;
  if (el instanceof HTMLButtonElement && el.disabled) return { ok: false, error: `${id} is disabled` };
  el.click();
  return { ok: true };
}

useDeskAutomationNode({
  kind: 'dialog',
  name: () => props.name || slug(dialogTitle()) || 'dialog',
  el: () => root.value,
  open: () => open.value,
  modal: true,
  read: () => ({
    title: dialogTitle(),
    front: props.front,
    page: props.page,
    buttons: buttons(),
    focus: focusInfo(),
    visible: isShown(root.value),
  }),
  brief: () => ({ open: open.value }),
  ops: () => ({
    accept: { description: 'Accept the dialog, as Ctrl+S does', run: () => accept() },
    cancel: { description: 'Cancel the dialog, as Escape does', run: () => close() },
    close: { description: 'Close the dialog', run: () => close() },
    press: { description: 'Press a button by its data-desk-field id', args: { id: { type: 'string' } }, run: (args) => press(String(args.id)), target: (args) => control(String(args.id)) },
    answer: {
      description: 'Answer a question dialog: ok, cancel, yes, no, save, keep, lose',
      args: { choice: { type: 'string', enum: Object.keys(ANSWERS) } },
      run: (args) => {
        const ids = ANSWERS[String(args.choice)] ?? [];
        for (const id of ids) {
          const result = press(id) as { ok?: boolean };
          if (result.ok) return result;
        }
        return { ok: false, error: `this dialog has no answer ${String(args.choice)}`, reason: `controls: ${buttons().map((item) => item.id).join(', ')}` };
      },
      target: (args) => answerControl(String(args.choice)),
    },
  }),
});

watch(open, (shown) => deskEvent(shown ? 'dialog-open' : 'dialog-close', props.name || slug(dialogTitle())), { flush: 'post' });
</script>