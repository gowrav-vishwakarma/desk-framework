<template>
  <button
    ref="root"
    type="button"
    class="desk-button"
    :class="{ 'is-busy': busy, 'is-locked': blocked }"
    :disabled="disabled === true"
    :aria-disabled="blocked ? 'true' : 'false'"
    :aria-busy="busy ? 'true' : 'false'"
    @click="onClick"
  >
    <span v-if="busy" class="desk-button-spinner" aria-hidden="true" />
    <span class="desk-button-label"><slot>{{ label }}</slot></span>
  </button>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useDeskTask, type DeskButtonApi, type DeskFormDirtySource, type DeskTask, type DeskTaskAfter } from './deskTask';

/**
 * A footer or toolbar button that runs once per click. While the work runs it shows a spinner and
 * takes no clicks; when it ends it takes clicks again (or, with `after="dirty"`, once the form
 * changes). Other attributes such as `data-desk-field` and `data-form-save-btn` pass through.
 *
 * Give it one of:
 * - `task`: a `useDeskTask` the page also binds to its shortcut, so both share one lock.
 * - `action`: the work itself. The button makes its own task from it.
 * - neither: a plain button that emits `click`; `busy` draws a loading state the page owns.
 */
const props = withDefaults(
  defineProps<{
    task?: DeskTask;
    action?: () => unknown;
    /** Take every click. Only with `action`. */
    repeat?: boolean;
    /** When it takes clicks again after a success. Only with `action`. */
    after?: DeskTaskAfter;
    /** Dirty source for `after="dirty"`. Defaults to the enclosing `DeskForm`'s tracker. */
    dirty?: DeskFormDirtySource;
    /** The page's own loading flag, for a button without `task` or `action`. */
    loading?: boolean;
    disabled?: boolean;
    label?: string;
  }>(),
  { repeat: false, after: 'done', loading: false, disabled: false, label: '' },
);
const emit = defineEmits<{ click: [event: MouseEvent] }>();

// Read once at setup, like the task it builds.
const own: DeskTask | null = props.action
  ? useDeskTask(props.action, { repeat: props.repeat, after: props.after, ...(props.dirty ? { dirty: props.dirty } : {}) })
  : null;
const task = computed(() => props.task ?? own);

const busy = computed(() => props.loading || (task.value?.busy.value ?? false));
const locked = computed(() => task.value?.locked.value ?? false);
/**
 * Busy or waiting: clicks are ignored. This is `aria-disabled`, not `disabled`, because a disabled
 * button drops keyboard focus mid-save and the desk is keyboard first.
 */
const blocked = computed(() => busy.value || locked.value);

const root = ref<HTMLButtonElement | null>(null);

/** Focus the button, as a plain `<button>` ref would. */
defineExpose<DeskButtonApi>({ focus: () => root.value?.focus() });

function onClick(event: MouseEvent): void {
  if (blocked.value) return;
  const current = task.value;
  if (current) {
    void current.run();
    return;
  }
  emit('click', event);
}
</script>
