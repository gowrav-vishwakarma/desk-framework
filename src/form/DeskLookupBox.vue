<template>
  <div class="desk-lookup" :class="{ 'desk-combo-grid': variant === 'grid' }" @contextmenu="onMenu">
    <input
      ref="box"
      v-bind="inputAttrs"
      :class="{ 'input-box': variant === 'grid' }"
      :value="draft"
      autocomplete="off"
      @focus="onFocus"
      @input="onType"
      @blur="onBlur"
      @keydown="onKey"
    />
    <DeskMark kind="search" :field="fieldId" @press="onMark" />
    <Teleport to="body">
    <div
      v-if="open"
      ref="suggest"
      class="desk-suggest"
      :style="{ top: `${top}px`, left: `${left}px`, minWidth: `${width}px` }"
      @mousedown.prevent
    >
      <table class="desk-suggest-table">
        <thead v-if="showHead && !loading && shown.length > 0">
          <tr class="hit head">
            <th v-if="multiple" class="pick" />
            <th v-for="column in lookup.columns" :key="column.id">{{ column.header }}</th>
            <th v-if="lookup.star" class="star" />
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading" class="hit">
            <td :colspan="colSpan">Searching…</td>
          </tr>
          <tr v-else-if="shown.length === 0" class="hit">
            <td :colspan="colSpan">No matches</td>
          </tr>
          <template v-else>
            <tr
              v-for="(hit, index) in shown"
              :key="index"
              class="hit"
              :class="{ active: index === active, picked: multiple && isSelected(hit) }"
              @mousedown.prevent="pick(hit)"
            >
              <template v-if="isDeskBlankHit(hit)">
                <td :colspan="colSpan">---</td>
              </template>
              <template v-else-if="isDeskTypedHit(hit)">
                <td :colspan="colSpan" class="desk-suggest-new">+ New “{{ draft.trim() }}”</td>
              </template>
              <template v-else>
                <td v-if="multiple" class="pick" aria-hidden="true">{{ isSelected(hit) ? '☑' : '☐' }}</td>
                <td v-for="column in lookup.columns" :key="column.id">{{ lookupField(hit, column.field) }}</td>
                <td v-if="lookup.star" class="star">
                  <button
                    type="button"
                    class="star-btn"
                    :class="{ on: starred.has(rowKey(hit)) }"
                    :aria-pressed="starred.has(rowKey(hit))"
                    title="Star in cache"
                    @mousedown.prevent.stop="toggleStar(hit)"
                  >
                    {{ starred.has(rowKey(hit)) ? '★' : '☆' }}
                  </button>
                </td>
              </template>
            </tr>
          </template>
        </tbody>
      </table>
      <div v-if="multiple" class="desk-suggest-foot">{{ selectedCount }} selected · Enter selects · ← → moves on · Tab done</div>
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
import { deskHost } from '../host';
import type { DeskLookupConfig } from '../grid/types';
import { claimDeskKey, isDeskNavKey } from '../focus/useDeskFocus';
import { keyInputOf, toCombo } from '../keys/combo';
import { deskActionsFor } from '../keys/deskKeymap';
import DeskContextMenu from '../menu/DeskContextMenu.vue';
import { placePopup } from '../menu/placePopup';
import { mergeDeskMenus, useDeskContextMenu, type DeskFieldMenu } from '../menu/fieldMenu';
import { DESK_BLANK_HIT, DESK_TYPED_HIT, isDeskBlankHit, isDeskTypedHit } from './blank';
import { lookupField } from './lookupField';
import { deskEditorMode, lookupEditorMenu, runLookupEditor, type DeskLookupEditorMode } from './lookupEditor';
import DeskMark from './DeskMark.vue';

const text = defineModel<string>({ required: true });
const picked = defineModel<Record<string, unknown> | null>('picked', { default: null });
const props = withDefaults(
  defineProps<{
    lookup: DeskLookupConfig;
    fieldId?: string;
    variant?: 'form' | 'grid';
    selectAll?: boolean;
    /** Typed character that opened a grid lookup. Shown for search, not stored until a row is picked. */
    seed?: string;
    /** Marks this field as the one to focus when the page or dialog opens. */
    initial?: boolean;
    placeholder?: string;
    title?: string;
    /** Puts "---" first even when the lookup config does not. Choosing it stores null. */
    blank?: boolean;
    /** Extra right-click groups. They follow the lookup's own `menu`. */
    menu?: DeskFieldMenu;
    /**
     * Pick several rows. The list shows `selected` first, checked, and Enter or a click toggles the
     * highlighted row and keeps the list open. Tab, and Left or Right at the edge of the search, finish.
     * A caret inside the search still moves. The box emits `toggle`; the owner keeps the list.
     */
    multiple?: boolean;
    selected?: readonly Record<string, unknown>[];
  }>(),
  { variant: 'form', selectAll: true, placeholder: '', title: '', blank: false, multiple: false, selected: () => [] },
);
const emit = defineEmits<{
  advance: [via: 'enter' | 'tab'];
  back: [via?: 'tab' | 'enter'];
  pick: [Record<string, unknown>];
  /** Multiple mode: the row to add or remove. */
  toggle: [Record<string, unknown>];
  cancel: [];
  /** A grid cell asks its grid to run the lookup's editor, because the grid ends this box when focus leaves. */
  editor: [mode: DeskLookupEditorMode, typed: string];
}>();

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
const suggest = ref<HTMLElement | null>(null);
const seeded = props.variant === 'grid' && (props.seed ?? '') !== '';
const draft = ref(seeded ? (props.seed ?? '') : text.value);
const hits = ref<Record<string, unknown>[]>([]);
const loading = ref(false);
const open = ref(false);
const active = ref(0);
const browsing = ref(seeded);
const starred = ref<ReadonlySet<string>>(new Set());
const top = ref(0);
const left = ref(0);
const width = ref(280);
const editorMenu = computed(() => (props.lookup.editor ? lookupEditorMenu(openEditor) : null));
const ctx = useDeskContextMenu(() => mergeDeskMenus(props.lookup.menu, props.menu, editorMenu.value));
let timer: ReturnType<typeof setTimeout> | null = null;
let generation = 0;
let starEpoch = 0;
/**
 * The list is opening, or open, only because the box got focus. A value that arrives meanwhile (an
 * edit page loading its record after the first focus) closes it: a filled box opens on Down or typing.
 */
let byFocus = false;
let blurTimer: ReturnType<typeof setTimeout> | null = null;

const least = (): number => props.lookup.minChars ?? 1;
const allowsBlank = computed(() => props.blank || props.lookup.blank === true);
/** `acceptTyped` offers the typed text as new once a search finds no row with exactly that label. */
const typedNew = computed(() => {
  if (!props.lookup.acceptTyped || !browsing.value || loading.value) return false;
  const typed = draft.value.trim().toLowerCase();
  if (!typed) return false;
  return !hits.value.some((hit) => lookupField(hit, props.lookup.labelKey).trim().toLowerCase() === typed);
});
const selectedCount = computed(() => props.selected.length);
const selectedKeys = computed(() => new Set(props.selected.map((row) => rowKey(row))));
function isSelected(row: Record<string, unknown>): boolean {
  return selectedKeys.value.has(rowKey(row));
}
/** Chosen when the box opened. They stay on top in the same order while rows are toggled, so the highlight does not jump. */
const pinned = [...props.selected];
const pinnedKeys = new Set(pinned.map((row) => rowKey(row)));
const shown = computed(() => {
  if (props.multiple) {
    // With nothing typed, what is already chosen leads the list so it can be unselected.
    if (draft.value.trim() === '') return [...pinned, ...hits.value.filter((row) => !pinnedKeys.has(rowKey(row)))];
    return hits.value;
  }
  return [
    ...(allowsBlank.value ? [DESK_BLANK_HIT] : []),
    ...hits.value,
    ...(typedNew.value ? [DESK_TYPED_HIT] : []),
  ];
});
const showHead = computed(() => props.lookup.columns.length > 1 || Boolean(props.lookup.star));
const colSpan = computed(() => props.lookup.columns.length + (props.lookup.star ? 1 : 0) + (props.multiple ? 1 : 0));

/** The open list should rest on the value already in the box, not the first row. */
function indexOfCurrent(rows: Record<string, unknown>[]): number {
  const current = text.value.trim();
  if (!current) return 0;
  const index = rows.findIndex((row) => {
    if (lookupField(row, props.lookup.labelKey) === current) return true;
    return props.lookup.labelKey !== 'code' && lookupField(row, 'code') === current;
  });
  if (index >= 0) return allowsBlank.value ? index + 1 : index;
  // A filled cell does not land on "---" while real rows are showing.
  if (allowsBlank.value && rows.length > 0) return 1;
  return 0;
}

function showActive(): void {
  void nextTick(() => {
    suggest.value?.querySelector('.hit.active')?.scrollIntoView({ block: 'nearest' });
  });
}

function place(): void {
  const rect = box.value?.getBoundingClientRect();
  if (!rect) return;
  width.value = Math.max(rect.width, 280);
  const spot = placePopup(rect, { width: width.value, height: suggest.value?.offsetHeight ?? 0 }, { gap: 0 });
  top.value = spot.top;
  left.value = spot.left;
}

// The list height is only known once it is drawn, so settle the position after each change.
watch([open, hits, loading], () => {
  if (open.value) place();
}, { flush: 'post' });

watch(text, (value) => {
  if (byFocus && value.trim() !== '') {
    byFocus = false;
    generation += 1;
    open.value = false;
  }
  if (browsing.value) return;
  draft.value = value;
});

function schedule(query: string): void {
  if (timer) clearTimeout(timer);
  const trimmed = query.trim();
  if (trimmed.length < least()) {
    if (least() === 0) {
      timer = setTimeout(() => {
        void runSearch('');
      }, 200);
      return;
    }
    hits.value = [];
    open.value = props.multiple && pinned.length > 0;
    active.value = 0;
    return;
  }
  timer = setTimeout(() => {
    void runSearch(trimmed);
  }, 200);
}

function usesListChoice(): boolean {
  return Boolean(props.lookup.browseOnFocus || props.lookup.localRows);
}

/** An empty box. A typed query still searches. */
function queryIsEmpty(query: string): boolean {
  return query.length < Math.max(least(), 1);
}

function showLocal(rows: readonly Record<string, unknown>[]): void {
  hits.value = [...rows];
  loading.value = false;
  open.value = true;
  place();
  active.value = props.multiple ? 0 : indexOfCurrent(hits.value);
  showActive();
  loadStars(generation);
}

async function openEmpty(orSearch = ''): Promise<void> {
  const ticket = generation;
  const query = draft.value.trim();
  const blankNow = allowsBlank.value && queryIsEmpty(query);
  // Show "---" before any wait, so the next Enter can choose it.
  if (blankNow) showLocal([]);
  const local = props.lookup.localRows ? await props.lookup.localRows() : [];
  if (ticket !== generation) return;
  // The user already chose "---" or closed the list.
  if (blankNow && !open.value) return;
  if (byFocus && text.value.trim() !== '') return;
  const browse = props.lookup.browseOnFocus ? props.lookup.browseOnFocus() : least() === 0;
  if (local.length === 0 && !browse) {
    if (orSearch && orSearch.length >= least()) void runSearch(orSearch);
    return;
  }
  if (!browse) {
    showLocal(local);
    return;
  }
  await runSearch('', local);
}

function onMark(): void {
  byFocus = false;
  const wasOpen = open.value;
  const hadFocus = document.activeElement === box.value;
  box.value?.focus();
  if (wasOpen) {
    open.value = false;
    browsing.value = false;
    draft.value = text.value;
    return;
  }
  if (!hadFocus && least() === 0) return;
  browsing.value = true;
  const query = draft.value.trim();
  if (!hadFocus && usesListChoice() && queryIsEmpty(query)) return;
  if (usesListChoice() && queryIsEmpty(query)) {
    void openEmpty();
    return;
  }
  void runSearch(query.length >= least() ? query : '');
}

function onFocus(): void {
  if (props.multiple && queryIsEmpty(draft.value.trim())) {
    browsing.value = true;
    if (least() === 0) void runSearch('');
    else if (pinned.length > 0) showLocal([]);
    return;
  }
  if (usesListChoice()) {
    if (props.variant !== 'grid' && least() === 0) box.value?.select();
    const query = draft.value.trim();
    // A filled box (an edit page, a default party) waits for Down or typing.
    if (props.variant !== 'grid' && text.value.trim() !== '') return;
    // Enter on a resting grid cell mounts this box with no typed seed. Open the list.
    if (props.variant === 'grid' && !seeded) {
      if (!queryIsEmpty(query) && query.length >= least()) {
        browsing.value = true;
        void runSearch(query);
        return;
      }
      void openEmpty();
      return;
    }
    const browse = props.lookup.browseOnFocus?.() ?? false;
    if (browse || queryIsEmpty(query)) {
      byFocus = true;
      void openEmpty();
    }
    return;
  }
  if (least() > 0) return;
  if (props.variant !== 'grid') box.value?.select();
  void runSearch('');
}

function onType(event: Event): void {
  byFocus = false;
  draft.value = (event.target as HTMLInputElement).value;
  browsing.value = true;
  schedule(draft.value);
}

function onBlur(): void {
  byFocus = false;
  if (blurTimer) clearTimeout(blurTimer);
  blurTimer = setTimeout(() => {
    if (document.activeElement === box.value) return;
    open.value = false;
    browsing.value = false;
    draft.value = text.value;
  }, 150);
}

function rowKey(row: Record<string, unknown>): string {
  const value = row[props.lookup.valueKey];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function loadStars(ticket: number): void {
  const star = props.lookup.star;
  if (!star) return;
  const epoch = starEpoch;
  void star
    .keys()
    .then((keys) => {
      if (ticket !== generation || epoch !== starEpoch) return;
      starred.value = keys;
    })
    .catch(() => {
      if (ticket !== generation || epoch !== starEpoch) return;
      starred.value = new Set();
    });
}

async function toggleStar(hit: Record<string, unknown>): Promise<void> {
  const star = props.lookup.star;
  if (!star || isDeskBlankHit(hit) || isDeskTypedHit(hit)) return;
  const id = rowKey(hit);
  if (!id) return;
  const on = !starred.value.has(id);
  starEpoch += 1;
  const next = new Set(starred.value);
  if (on) next.add(id);
  else next.delete(id);
  starred.value = next;
  try {
    await star.toggle(hit, on);
  } catch {
    const back = new Set(starred.value);
    if (on) back.delete(id);
    else back.add(id);
    starred.value = back;
  }
}

function mergeRows(prefix: readonly Record<string, unknown>[], rows: Record<string, unknown>[]): Record<string, unknown>[] {
  if (prefix.length === 0) return rows;
  const seen = new Set(prefix.map((row) => rowKey(row)));
  return [...prefix, ...rows.filter((row) => !seen.has(rowKey(row)))];
}

async function runSearch(query: string, prefix: readonly Record<string, unknown>[] = []): Promise<void> {
  const ticket = ++generation;
  loading.value = true;
  open.value = true;
  place();
  loadStars(ticket);
  try {
    const search = deskHost().searchLookup;
    const rows = search ? await search(props.lookup, query) : [];
    if (ticket !== generation) return;
    hits.value = mergeRows(prefix, rows);
    const typed = query.trim();
    const searching = typed !== '' && typed !== text.value.trim();
    // Nothing found: rest on "+ New", so Enter keeps the typed text instead of clearing it with "---".
    const onlyNew = searching && props.lookup.acceptTyped === true && hits.value.length === 0;
    if (onlyNew) active.value = allowsBlank.value ? 1 : 0;
    else if (props.multiple) active.value = Math.min(active.value, Math.max(0, shown.value.length - 1));
    else active.value = searching && allowsBlank.value && hits.value.length > 0 ? 1 : indexOfCurrent(hits.value);
    showActive();
  } catch {
    if (ticket !== generation) return;
    hits.value = [...prefix];
  } finally {
    if (ticket === generation) loading.value = false;
  }
}

/**
 * A search typed before a pick, still waiting for its 200 ms or for its answer, is dropped: run after the pick it
 * opened the list again (over the next cell a person had already moved to, which then lost its typing).
 */
function dropPendingSearch(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  generation += 1;
  loading.value = false;
}

function choose(hit: Record<string, unknown>): void {
  if (blurTimer) clearTimeout(blurTimer);
  dropPendingSearch();
  if (isDeskBlankHit(hit)) {
    browsing.value = false;
    draft.value = '';
    text.value = '';
    picked.value = hit;
    open.value = false;
    return;
  }
  if (isDeskTypedHit(hit)) {
    const typed = draft.value.trim();
    browsing.value = false;
    draft.value = typed;
    text.value = typed;
    picked.value = null;
    open.value = false;
    return;
  }
  const label = lookupField(hit, props.lookup.labelKey);
  browsing.value = false;
  draft.value = label;
  text.value = label;
  picked.value = hit;
  open.value = false;
  props.lookup.onPick?.(hit);
  emit('pick', hit);
  void nextTick(() => box.value?.select());
}

/** A click on "---" or "+ New" settles the cell and, in a grid, moves on in the same gesture. */
function toggle(hit: Record<string, unknown>): void {
  if (blurTimer) clearTimeout(blurTimer);
  emit('toggle', hit);
  if (props.multiple && props.lookup.clearAfterPick) {
    // Each row is what was typed (an alias): the box empties for the next one.
    dropPendingSearch();
    draft.value = '';
    hits.value = [];
    open.value = false;
  }
  box.value?.focus();
}

function pick(hit: Record<string, unknown>): void {
  if (props.multiple) {
    toggle(hit);
    return;
  }
  choose(hit);
  if (props.variant === 'grid') emit('advance', 'enter');
}

function onMenu(event: MouseEvent): void {
  if (!ctx.open(event)) return;
  open.value = false;
}

/**
 * New or Edit. In a form the box runs the editor and picks the saved row. In a grid the cell is
 * rebuilt when focus leaves, so the grid runs it and writes the row itself.
 */
function openEditor(mode: DeskLookupEditorMode): void {
  open.value = false;
  if (props.variant === 'grid') {
    emit('editor', mode, draft.value.trim());
    return;
  }
  void (async () => {
    const row = await runLookupEditor(props.lookup, mode, { picked: picked.value, typed: draft.value.trim() });
    if (row) choose(row);
    box.value?.focus();
  })();
}

/** Left or Right leaves the box: the text is all selected, or the caret sits at that end. A caret inside still moves. */
function arrowLeaves(dir: 'left' | 'right'): boolean {
  const input = box.value;
  if (!input) return true;
  const start = input.selectionStart ?? 0;
  const end = input.selectionEnd ?? start;
  if (start === 0 && end === input.value.length) return true;
  if (start !== end) return false;
  return dir === 'left' ? start === 0 : end === input.value.length;
}

function finishMultiple(dir: 'next' | 'prev', via: 'tab' | 'enter'): void {
  open.value = false;
  browsing.value = false;
  draft.value = '';
  if (dir === 'prev') emit('back', via);
  else emit('advance', via);
}

function onKey(event: KeyboardEvent): void {
  const editorMode = deskEditorMode(event, props.lookup);
  if (editorMode) {
    event.preventDefault();
    claimDeskKey(event);
    openEditor(editorMode);
    return;
  }
  if (isDeskNavKey(event)) return;
  claimDeskKey(event);
  const combo = toCombo(keyInputOf(event));
  if (combo && deskActionsFor(combo).includes('lookup-star') && props.lookup.star && open.value && !loading.value) {
    event.preventDefault();
    const hit = shown.value[active.value];
    if (hit && !isDeskBlankHit(hit) && !isDeskTypedHit(hit)) void toggleStar(hit);
    return;
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    if (!open.value) {
      byFocus = false;
      browsing.value = true;
      const query = draft.value.trim();
      if (usesListChoice() && queryIsEmpty(query)) {
        void openEmpty();
        return;
      }
      // The box shows its value, not a search: open the list on it, else search for it.
      if (usesListChoice() && draft.value === text.value) {
        void openEmpty(query);
        return;
      }
      void runSearch(query.length >= least() ? query : '');
      return;
    }
    const count = shown.value.length;
    if (count === 0) return;
    const delta = event.key === 'ArrowDown' ? 1 : -1;
    active.value = (active.value + delta + count) % count;
    browsing.value = true;
    showActive();
    return;
  }
  if (props.multiple && (event.key === 'ArrowLeft' || event.key === 'ArrowRight') && !event.shiftKey && !event.altKey) {
    const dir = event.key === 'ArrowLeft' ? 'left' : 'right';
    if (!arrowLeaves(dir)) return;
    event.preventDefault();
    finishMultiple(dir === 'left' ? 'prev' : 'next', 'tab');
    return;
  }
  // In a grid cell Left and Right go to the cell beside, as on a resting cell. The value stays as it was:
  // a highlighted row is not picked, so a cell that opened its list on arrival is not cleared by passing.
  if (
    props.variant === 'grid'
    && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
    && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey
  ) {
    const dir = event.key === 'ArrowLeft' ? 'left' : 'right';
    if (!arrowLeaves(dir)) return;
    event.preventDefault();
    open.value = false;
    browsing.value = false;
    draft.value = text.value;
    if (dir === 'left') emit('back', 'tab');
    else emit('advance', 'tab');
    return;
  }
  if (event.key === 'Escape') {
    if (open.value) {
      event.preventDefault();
      open.value = false;
      browsing.value = false;
      draft.value = text.value;
      return;
    }
    // Nothing open: a grid cell claims Escape to cancel its edit; a form field leaves it to its dialog or page.
    if (props.variant === 'grid') {
      event.preventDefault();
      emit('cancel');
    }
    return;
  }
  if (event.key === 'Tab' || (event.key === 'Enter' && event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey)) {
    event.preventDefault();
    if (props.multiple) {
      finishMultiple(event.shiftKey ? 'prev' : 'next', event.key === 'Enter' ? 'enter' : 'tab');
      return;
    }
    const highlighted = open.value && !loading.value ? shown.value[active.value] : undefined;
    if (highlighted && lookupField(highlighted, props.lookup.labelKey) !== text.value) choose(highlighted);
    open.value = false;
    browsing.value = false;
    if (event.shiftKey) emit('back', event.key === 'Enter' ? 'enter' : 'tab');
    else emit('advance', 'tab');
    return;
  }
  if (event.key !== 'Enter' || event.shiftKey) return;
  event.preventDefault();
  if (props.multiple) {
    const highlighted = open.value && !loading.value ? shown.value[active.value] : undefined;
    if (highlighted) toggle(highlighted);
    else emit('advance', 'enter');
    return;
  }
  if (open.value) {
    // An empty box is already on "---". Enter chooses it without waiting for a search.
    if (loading.value && !(allowsBlank.value && queryIsEmpty(draft.value.trim()))) return;
    if (loading.value) {
      generation += 1;
      loading.value = false;
    }
    const highlighted = shown.value[active.value];
    if (!highlighted) {
      open.value = false;
      browsing.value = false;
      draft.value = text.value;
      return;
    }
    if (isDeskBlankHit(highlighted)) {
      choose(highlighted);
      if (props.variant === 'grid') emit('advance', 'enter');
      return;
    }
    if (isDeskTypedHit(highlighted)) {
      choose(highlighted);
      emit('advance', 'enter');
      return;
    }
    const label = lookupField(highlighted, props.lookup.labelKey);
    if (label === text.value) {
      open.value = false;
      browsing.value = false;
      draft.value = text.value;
      emit('advance', 'enter');
      return;
    }
    choose(highlighted);
    // In a grid, Enter on a row picks it and moves on, as a click does.
    if (props.variant === 'grid') emit('advance', 'enter');
    return;
  }
  emit('advance', 'enter');
}

onMounted(() => {
  if (props.variant !== 'grid') return;
  box.value?.focus();
  if (seeded) {
    const length = box.value?.value.length ?? 0;
    box.value?.setSelectionRange(length, length);
    schedule(props.seed ?? '');
    return;
  }
  if (props.selectAll !== false) box.value?.select();
  else {
    const length = box.value?.value.length ?? 0;
    box.value?.setSelectionRange(length, length);
  }
});

onUnmounted(() => {
  if (blurTimer) clearTimeout(blurTimer);
  dropPendingSearch();
});

/** The automation driver searches and picks through the same functions the keyboard uses. */
defineExpose({
  async automationSearch(query: string): Promise<Record<string, unknown>[]> {
    draft.value = query;
    browsing.value = true;
    await runSearch(query);
    return [...hits.value];
  },
  automationRows: (): Record<string, unknown>[] => [...shown.value],
  automationPick: (hit: Record<string, unknown>): void => pick(hit),
  automationList: () => ({ open: open.value, loading: loading.value, active: active.value, rows: shown.value.length }),
  automationText: (): string => draft.value,
});
</script>
