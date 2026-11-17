<template>
  <div
    ref="root"
    class="desk-date"
    :class="{ 'is-grid': variant === 'grid', 'is-invalid': invalid }"
    @contextmenu="ctx.open($event)"
  >
    <input
      ref="box"
      :value="focused ? draft : face"
      v-bind="{
        ...(fieldId ? { id: fieldId, 'data-desk-field': fieldId } : {}),
        ...(initial ? { 'data-desk-initial': '' } : {}),
        ...(readonly ? { readonly: true } : {}),
        ...(placeholder ? { placeholder } : {}),
        ...(titleText ? { title: titleText } : {}),
      }"
      @focus="onFocus"
      @blur="onBlur"
      @input="onInput"
      @keydown="onKey"
    />
    <DeskMark v-if="!readonly && variant !== 'grid'" kind="date" :field="fieldId" @press="toggleCalendar" />
    <span v-if="detailText" class="desk-date-preview">{{ detailText }}</span>
    <Teleport to="body">
      <div v-if="open" class="desk-calendar-pop" :style="popStyle">
        <DeskCalendar :view="view" :selected="highlighted" :today="today" @pick="onPick" @shift="browse += $event" />
      </div>
    </Teleport>
    <DeskContextMenu
      v-if="ctx.state.value"
      :menu="ctx.state.value.menu"
      :x="ctx.state.value.x"
      :y="ctx.state.value.y"
      @close="closeMenu"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { claimDeskKey, isDeskNavKey } from '../focus/useDeskFocus';
import DeskContextMenu from '../menu/DeskContextMenu.vue';
import DeskMark from '../form/DeskMark.vue';
import { mergeDeskMenus, useDeskContextMenu, type DeskFieldMenu } from '../menu/fieldMenu';
import DeskCalendar from './DeskCalendar.vue';
import { dateFieldMenu } from './dateMenu';
import { dateParseOptions, useDatePrefs } from './datePrefs';
import {
  describeDeskDate,
  formatDeskDate,
  maskDateDigits,
  parseDeskDate,
  shiftIso,
  shiftMonth,
  splitIso,
  todayIso,
  type DeskDateParts,
} from './deskDate';

const model = defineModel<string | null>({ required: true });
const props = withDefaults(defineProps<{
  fieldId?: string;
  variant?: 'field' | 'grid';
  /** This field takes focus when its page or dialog opens. */
  initial?: boolean;
  readonly?: boolean;
  placeholder?: string;
  title?: string;
  /** When false, a typed seed stays and the caret sits at the end. */
  selectAll?: boolean;
  /** Groups added after the date menu every date control has. */
  menu?: DeskFieldMenu;
}>(), { variant: 'field', selectAll: true });

const emit = defineEmits<{
  advance: [via: 'enter' | 'tab'];
  back: [via: 'enter' | 'tab'];
  cancel: [];
}>();

const { prefs } = useDatePrefs();
const defaultMenu = dateFieldMenu();
const ctx = useDeskContextMenu(() => mergeDeskMenus(defaultMenu, props.menu));
const root = ref<HTMLElement | null>(null);
const box = ref<HTMLInputElement | null>(null);
const focused = ref(false);
const typed = ref(false);
const invalid = ref(false);
const draft = ref('');
const open = ref(false);
const browse = ref(0);
const popStyle = ref({ top: '0px', left: '0px' });

const today = computed(() => todayIso());
const face = computed(() => formatDeskDate(model.value ?? '', prefs.value.show));

const highlighted = computed(() => {
  const text = focused.value ? draft.value : (model.value ?? '');
  return parseDeskDate(text, options()) ?? storedIso(model.value);
});

const view = computed((): DeskDateParts => {
  const base = splitIso(highlighted.value ?? '') ?? splitIso(today.value);
  const cursor = new Date((base?.y ?? 2000), (base?.m ?? 1) - 1 + browse.value, 1);
  return { y: cursor.getFullYear(), m: cursor.getMonth() + 1, d: 1 };
});

const preview = computed(() => {
  const text = draft.value.trim();
  if (!text) return '';
  const iso = parseDeskDate(text, options());
  if (!iso) return 'Not a date';
  return describeDeskDate(iso) ?? '';
});

function weekdayText(): string {
  if (focused.value) return preview.value;
  const iso = storedIso(model.value);
  return iso ? (describeDeskDate(iso) ?? '') : '';
}

const weekdayOn = computed(() => prefs.value.weekdayWhen === 'always' || focused.value);

const detailText = computed(() => {
  if (!weekdayOn.value || prefs.value.weekday !== 'beside' || props.variant === 'grid') return '';
  return weekdayText();
});

const titleText = computed(() => {
  const asTip = prefs.value.weekday === 'tip' || props.variant === 'grid';
  if (weekdayOn.value && asTip) {
    const text = weekdayText();
    if (text) return text;
  }
  return props.title ?? '';
});

function options() {
  return dateParseOptions();
}

function storedIso(value: string | null): string | null {
  if (!value) return null;
  const parts = splitIso(value);
  return parts ? `${parts.y}-${String(parts.m).padStart(2, '0')}-${String(parts.d).padStart(2, '0')}` : null;
}

function shownDraft(value: string | null): string {
  const iso = storedIso(value);
  return iso ? formatDeskDate(iso, prefs.value.show) : (value ?? '');
}

function placeCalendar(): void {
  const input = box.value;
  if (!input) return;
  const rect = input.getBoundingClientRect();
  let top = rect.bottom + 2;
  if (top + 240 > window.innerHeight) top = Math.max(4, rect.top - 240);
  popStyle.value = { top: `${top}px`, left: `${Math.min(rect.left, window.innerWidth - 210)}px` };
}

function closeMenu(): void {
  ctx.close();
  if (focused.value) draft.value = shownDraft(storedIso(model.value) ?? parseDeskDate(draft.value, options()));
}

function showIso(iso: string): void {
  draft.value = formatDeskDate(iso, prefs.value.show);
  typed.value = false;
  invalid.value = false;
}

function applyIso(iso: string): void {
  model.value = iso;
  showIso(iso);
}

function baseIso(): string {
  return parseDeskDate(draft.value, options()) ?? storedIso(model.value) ?? today.value;
}

function toggleCalendar(): void {
  if (props.readonly) return;
  open.value = !open.value;
  if (open.value) {
    browse.value = 0;
    void nextTick(() => placeCalendar());
  }
  box.value?.focus();
}

function onPick(iso: string): void {
  applyIso(iso);
  open.value = false;
  browse.value = 0;
  box.value?.focus();
}

/** Write a good date, or null when the box is empty. Stay when the text is not a date. */
function finish(): boolean {
  const text = draft.value.trim();
  if (text === '') {
    model.value = null;
    invalid.value = false;
    return true;
  }
  const iso = parseDeskDate(text, options());
  if (!iso) {
    invalid.value = true;
    return false;
  }
  applyIso(iso);
  return true;
}

function onFocus(): void {
  focused.value = true;
  invalid.value = false;
  typed.value = props.selectAll === false;
  browse.value = 0;
  draft.value = shownDraft(model.value);
  if (!props.readonly && prefs.value.calendar === 'focus') {
    open.value = true;
    void nextTick(() => placeCalendar());
  }
  void nextTick(() => {
    const input = box.value;
    if (!input) return;
    if (props.selectAll === false) {
      const end = input.value.length;
      input.setSelectionRange(end, end);
      return;
    }
    input.select();
  });
}

function onBlur(): void {
  focused.value = false;
  open.value = false;
  ctx.close();
  if (props.readonly) return;
  if (!finish()) {
    invalid.value = false;
    draft.value = shownDraft(model.value);
  }
}

function onInput(event: Event): void {
  typed.value = true;
  invalid.value = false;
  const raw = (event.target as HTMLInputElement).value;
  if (prefs.value.typing !== 'mask') {
    draft.value = raw;
    return;
  }
  draft.value = maskDateDigits(raw.replace(/\D/g, '').slice(0, 8), prefs.value.show);
  void nextTick(() => {
    const input = box.value;
    if (!input) return;
    const end = draft.value.length;
    input.setSelectionRange(end, end);
  });
}

function onKey(event: KeyboardEvent): void {
  if (isDeskNavKey(event)) return;
  if (event.key === 'Escape') {
    if (open.value) {
      claimDeskKey(event);
      event.preventDefault();
      open.value = false;
      return;
    }
    if (props.variant === 'grid') {
      claimDeskKey(event);
      event.preventDefault();
      emit('cancel');
    }
    return;
  }
  if (!props.readonly && ((event.altKey && event.key === 'ArrowDown' && !event.shiftKey && !event.ctrlKey && !event.metaKey) || event.key === 'F4')) {
    claimDeskKey(event);
    event.preventDefault();
    toggleCalendar();
    return;
  }
  const dayStep: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
  const step = dayStep[event.key];
  if (open.value && !typed.value && step !== undefined && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    claimDeskKey(event);
    event.preventDefault();
    const next = shiftIso(baseIso(), step);
    if (next) showIso(next);
    return;
  }
  if (open.value && !typed.value && (event.key === 'PageUp' || event.key === 'PageDown') && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    claimDeskKey(event);
    event.preventDefault();
    const next = shiftMonth(baseIso(), event.key === 'PageUp' ? -1 : 1);
    if (next) showIso(next);
    return;
  }
  if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey && !event.altKey) {
    claimDeskKey(event);
    event.preventDefault();
    if (!props.readonly && !finish()) return;
    if (event.shiftKey) emit('back', 'enter');
    else emit('advance', 'enter');
    return;
  }
  if (event.key === 'Tab') {
    claimDeskKey(event);
    event.preventDefault();
    if (!props.readonly && !finish()) return;
    if (event.shiftKey) emit('back', 'tab');
    else emit('advance', 'tab');
  }
}

onMounted(() => {
  if (props.variant !== 'grid') return;
  box.value?.focus();
});

watch(highlighted, () => {
  browse.value = 0;
});

watch(() => prefs.value.show, () => {
  if (!focused.value || typed.value) return;
  draft.value = shownDraft(model.value);
});

</script>
