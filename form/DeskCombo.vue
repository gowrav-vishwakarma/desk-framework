<template>
  <div class="desk-combo" :class="{ 'desk-combo-grid': variant === 'grid' }" @focusout="onFocusOut">
    <input
      ref="box"
      v-bind="inputAttrs"
      :class="{ 'input-box': variant === 'grid' }"
      :value="query"
      autocomplete="off"
      @focus="onFocus"
      @input="onType"
      @keydown="onKey"
      @contextmenu="onMenu"
    />
    <DeskMark kind="select" @press="onMark" />
    <Teleport to="body">
    <div
      v-if="open && filtered.length"
      ref="list"
      class="desk-suggest"
      :style="{ top: `${top}px`, left: `${left}px`, minWidth: `${width}px` }"
      @mousedown.prevent="holdList"
    >
      <div
        v-for="(option, index) in filtered"
        :key="option.value"
        class="hit"
        :class="{ active: index === active }"
        @mousedown.prevent="pick(option)"
      >
        {{ option.label }}
      </div>
    </div>
    </Teleport>
    <DeskContextMenu
      v-if="ctx.state.value"
      :menu="ctx.state.value.menu"
      :x="ctx.state.value.x"
      :y="ctx.state.value.y"
      @close="ctx.close"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import type { DeskSelectOption } from '../grid/types';
import { claimDeskKey, isDeskNavKey } from '../focus/useDeskFocus';
import DeskContextMenu from '../menu/DeskContextMenu.vue';
import { placePopup } from '../menu/placePopup';
import { useDeskContextMenu, type DeskFieldMenu } from '../menu/fieldMenu';
import DeskMark from './DeskMark.vue';

const model = defineModel<string>({ required: true });
const props = withDefaults(
  defineProps<{
    options: DeskSelectOption[];
    fieldId?: string;
    variant?: 'form' | 'grid';
    selectAll?: boolean;
    /** Marks this field as the one to focus when the page or dialog opens. */
    initial?: boolean;
    placeholder?: string;
    title?: string;
    /** Puts "---" first. Choosing it stores an empty value, which the field keeps as null. */
    blank?: boolean;
    /** Right-click menu. Without one the browser's menu shows. */
    menu?: DeskFieldMenu;
  }>(),
  { variant: 'form', selectAll: true, placeholder: '', title: '', blank: false },
);
const emit = defineEmits<{ advance: [via: 'enter' | 'tab']; back: [via?: 'tab' | 'enter']; cancel: [] }>();

const ctx = useDeskContextMenu(() => props.menu ?? null);

function onMenu(event: MouseEvent): void {
  if (ctx.open(event)) open.value = false;
}

const inputAttrs = computed(() => {
  const attrs: Record<string, string> = {};
  if (props.fieldId) {
    attrs.id = props.fieldId;
    attrs['data-desk-field'] = props.fieldId;
  }
  if (props.initial) attrs['data-desk-initial'] = '';
  if (props.placeholder) attrs.placeholder = props.placeholder;
  if (props.title) attrs.title = props.title;
  return attrs;
});

const box = ref<HTMLInputElement | null>(null);
const list = ref<HTMLElement | null>(null);
const query = ref('');
const open = ref(false);
const active = ref(0);
const picking = ref(false);
/**
 * True after Enter accepts the highlighted option during this visit.
 * The next Enter then moves on. Focus and blur clear it, so coming back opens the list again.
 */
const accepted = ref(false);
/** Pointer is on the list, so that press is not a blur that should hide the options. */
let holdingList = false;
const top = ref(0);
const left = ref(0);
const width = ref(160);
let placeRaf = 0;
let layoutObserver: ResizeObserver | null = null;
let trackingPlace = false;

function strictSelect(): boolean {
  return props.selectAll !== false;
}

const choices = computed((): DeskSelectOption[] => {
  if (!props.blank || props.options.some((option) => option.value === '')) return props.options;
  return [{ label: '---', value: '' }, ...props.options];
});

const filtered = computed(() => {
  const needle = picking.value ? query.value.trim().toLowerCase() : '';
  if (!needle) return choices.value;
  return choices.value.filter(
    (option) => option.label.toLowerCase().includes(needle) || option.value.toLowerCase().includes(needle),
  );
});

/** `INDIA` and `India` are the same choice. The stored text often differs in case from the list. */
function sameChoice(option: DeskSelectOption, value: string): boolean {
  const needle = value.trim().toLowerCase();
  return needle !== '' && (option.value.trim().toLowerCase() === needle || option.label.trim().toLowerCase() === needle);
}

function committedLabel(): string {
  const match = choices.value.find((option) => sameChoice(option, model.value));
  return match?.label ?? model.value;
}

function place(): void {
  const rect = box.value?.getBoundingClientRect();
  if (!rect) return;
  width.value = Math.max(rect.width, 160);
  const spot = placePopup(rect, { width: width.value, height: list.value?.offsetHeight ?? 0 }, { gap: 0 });
  top.value = spot.top;
  left.value = spot.left;
}

/** One layout read per frame, however many scrolls or resizes ask for it. */
function schedulePlace(): void {
  if (placeRaf) return;
  placeRaf = requestAnimationFrame(() => {
    placeRaf = 0;
    place();
  });
}

function startPlaceTracking(): void {
  if (trackingPlace) return;
  trackingPlace = true;
  window.addEventListener('resize', schedulePlace, { passive: true });
  window.addEventListener('scroll', schedulePlace, { capture: true, passive: true });
  if (typeof ResizeObserver === 'undefined' || !box.value) return;
  layoutObserver = new ResizeObserver(() => schedulePlace());
  layoutObserver.observe(box.value);
  const panel = box.value.closest('.desk-dialog-panel');
  if (panel) layoutObserver.observe(panel);
}

function stopPlaceTracking(): void {
  if (!trackingPlace) return;
  trackingPlace = false;
  window.removeEventListener('resize', schedulePlace);
  window.removeEventListener('scroll', schedulePlace, true);
  layoutObserver?.disconnect();
  layoutObserver = null;
  if (placeRaf) {
    cancelAnimationFrame(placeRaf);
    placeRaf = 0;
  }
}

function revealActive(): void {
  void nextTick(() => {
    list.value?.querySelector('.hit.active')?.scrollIntoView({ block: 'nearest' });
    schedulePlace();
  });
}

function showCurrent(): void {
  query.value = committedLabel();
  picking.value = false;
  open.value = true;
  const index = choices.value.findIndex((option) => sameChoice(option, model.value));
  active.value = index >= 0 ? index : 0;
  revealActive();
}

function onMark(): void {
  const wasOpen = open.value;
  box.value?.focus();
  if (wasOpen) hideList();
  else showCurrent();
}

function onFocus(): void {
  accepted.value = false;
  if (!strictSelect() && model.value && !props.options.some((option) => option.value === model.value)) {
    query.value = model.value;
    picking.value = true;
    open.value = true;
    active.value = 0;
    return;
  }
  showCurrent();
  if (strictSelect()) box.value?.select();
}

function hideList(): void {
  open.value = false;
  picking.value = false;
  accepted.value = false;
  query.value = committedLabel();
}

function holdList(): void {
  holdingList = true;
  window.addEventListener('mouseup', releaseList, { once: true });
}

function releaseList(): void {
  holdingList = false;
}

function onFocusOut(event: FocusEvent): void {
  if (holdingList) return;
  const next = event.relatedTarget;
  if (next instanceof Node && event.currentTarget instanceof Node && event.currentTarget.contains(next)) return;
  hideList();
}

function onType(event: Event): void {
  const input = event.target as HTMLInputElement;
  const typed = input.value;
  accepted.value = false;
  if (strictSelect()) {
    const needle = typed.trim().toLowerCase();
    const matches = needle
      ? choices.value.filter(
          (option) => option.label.toLowerCase().includes(needle) || option.value.toLowerCase().includes(needle),
        )
      : choices.value;
    if (needle && matches.length === 0) {
      input.value = query.value;
      return;
    }
  }
  query.value = typed;
  picking.value = query.value !== committedLabel();
  open.value = true;
  active.value = 0;
}

function choose(option: DeskSelectOption): void {
  model.value = option.value;
  query.value = option.label;
  picking.value = false;
  open.value = false;
  accepted.value = true;
  void nextTick(() => {
    if (document.activeElement === box.value) box.value?.select();
  });
}

/**
 * A click on an option. Same as Enter on the highlighted option: a grid cell takes the value and
 * moves on, a form field takes it and keeps focus.
 */
function pick(option: DeskSelectOption): void {
  choose(option);
  if (props.variant === 'grid') emit('advance', 'enter');
}

function onKey(event: KeyboardEvent): void {
  if (isDeskNavKey(event)) return;
  claimDeskKey(event);
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    accepted.value = false;
    open.value = true;
    schedulePlace();
    const count = filtered.value.length;
    if (count === 0) return;
    const delta = event.key === 'ArrowDown' ? 1 : -1;
    active.value = (active.value + delta + count) % count;
    revealActive();
    return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    if (open.value) {
      query.value = committedLabel();
      picking.value = false;
      open.value = false;
      return;
    }
    emit('cancel');
    return;
  }
  if (event.key === 'Tab' || (event.key === 'Enter' && event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey)) {
    event.preventDefault();
    if (open.value && (picking.value || strictSelect())) {
      const highlighted = filtered.value[active.value];
      if (highlighted) choose(highlighted);
      else query.value = committedLabel();
    }
    open.value = false;
    accepted.value = false;
    if (event.shiftKey) emit('back', event.key === 'Enter' ? 'enter' : 'tab');
    else emit('advance', 'tab');
    return;
  }
  if (event.key !== 'Enter' || event.shiftKey) return;
  event.preventDefault();
  if (open.value) {
    const highlighted = filtered.value[active.value];
    if (highlighted) {
      choose(highlighted);
      // A grid cell confirms and moves on this Enter. A form field waits for one more.
      if (props.variant === 'grid') emit('advance', 'enter');
    } else showCurrent();
    return;
  }
  if (accepted.value) {
    emit('advance', 'enter');
    return;
  }
  showCurrent();
}

watch(
  () => [model.value, props.options] as const,
  () => {
    if (open.value || picking.value) return;
    query.value = committedLabel();
  },
);

watch(
  open,
  (shown) => {
    if (!shown) {
      stopPlaceTracking();
      return;
    }
    // The list is drawn now, so its height is known. A dialog can still be laying out, so once more next frame.
    place();
    schedulePlace();
    startPlaceTracking();
  },
  { flush: 'post' },
);

watch(filtered, () => {
  if (open.value) place();
}, { flush: 'post' });

onUnmounted(stopPlaceTracking);

onMounted(() => {
  query.value = committedLabel();
  if (props.variant !== 'grid') return;
  box.value?.focus();
  onFocus();
});
</script>
