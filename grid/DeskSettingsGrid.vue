<template>
  <div ref="rootEl" class="desk-grid component-content desk-settings" :class="{ 'grid-focused': active }">
    <div
      ref="scroller"
      class="table-content"
      tabindex="0"
      :data-desk-field="gridId"
      data-desk-entry
      v-bind="focusAttrs"
      @keydown="onKey"
      @focus="active = true"
      @focusout="onBlur"
    >
      <table class="systable desk-settings-table">
        <colgroup>
          <col class="desk-settings-label-col" />
          <col class="desk-settings-value-col" />
          <col class="desk-settings-label-col" />
          <col class="desk-settings-value-col" />
        </colgroup>
        <tbody>
          <template v-for="row in rows" :key="row.id">
            <tr v-if="row.kind === 'title'" class="desk-settings-title">
              <td colspan="4">{{ row.label }}</td>
            </tr>
            <tr v-else>
              <template v-for="(setting, side) in row.cells" :key="side">
                <template v-if="setting">
                  <td
                    class="desk-settings-label"
                    :colspan="row.cells[1] ? 1 : 2"
                    :title="setting.hint ?? ''"
                  >
                    {{ setting.label }}<span v-if="setting.required" class="desk-req"> *</span>
                  </td>
                  <td
                    class="desk-settings-value"
                    :colspan="row.cells[1] ? 1 : 2"
                    :class="{
                      'desk-set-current': current === setting.key,
                      'desk-set-readonly': setting.readonly,
                      'desk-set-editing': editingKey === setting.key,
                      'desk-set-invalid': Boolean(issueOf(setting)),
                      'desk-tone-ok': setting.tone === 'ok',
                      'desk-tone-bad': setting.tone === 'bad',
                      'desk-tone-muted': setting.tone === 'muted',
                      'marker-lookup': editingKey !== setting.key && markKind(setting) === 'search',
                      'marker-select': editingKey !== setting.key && markKind(setting) === 'select',
                    }"
                    :data-setting="setting.key"
                    :title="valueTitle(setting)"
                    @mousedown="onCell($event, setting)"
                    @contextmenu="onChipsMenu($event, setting)"
                  >
                    <DeskLookupBox
                      v-if="editingKey === setting.key && setting.lookup && (setting.editor === 'lookup' || setting.editor === 'chips')"
                      v-model="draft"
                      variant="grid"
                      :lookup="requiredLookup(setting)"
                      :seed="lookupSeed"
                      :multiple="setting.editor === 'chips'"
                      :selected="setting.editor === 'chips' ? chipsOf(setting) : []"
                      v-bind="lookupMenu(setting)"
                      @pick="onPick(setting, $event)"
                      @toggle="toggleChip(setting, $event)"
                      @advance="onLookupStep(setting, 'next')"
                      @back="onLookupStep(setting, 'prev')"
                      @cancel="cancel"
                      @editor="(mode, typed) => runSettingEditor(setting, mode, typed)"
                    />
                    <input
                      v-else-if="editingKey === setting.key && setting.editor === 'file'"
                      ref="fileBox"
                      type="file"
                      @change="onFile(setting, $event)"
                    />
                    <DeskCurrencyInput
                      v-else-if="editingKey === setting.key && setting.editor === 'currency'"
                      :model-value="currencyOf(setting)"
                      variant="grid"
                      v-bind="setting.lookup ? { lookup: setting.lookup } : {}"
                      @update:model-value="onCurrency(setting, $event)"
                      @advance="finish(setting, 'next')"
                      @back="finish(setting, 'prev')"
                      @cancel="cancel"
                    />
                    <DeskCellEditor
                      v-else-if="editingKey === setting.key"
                      v-model="draft"
                      :kind="setting.editor"
                      :options="setting.options ?? []"
                      :select-all="!seeded"
                      @commit="finish(setting, 'next')"
                      @tab="(back) => finish(setting, back ? 'prev' : 'next')"
                      @cancel="cancel"
                    />
                    <span v-else-if="setting.editor === 'chips'" class="desk-cell-value desk-set-chips" :class="`is-${chipsPrefs.show}`">
                      <template v-if="chipsPrefs.show === 'wrap' || chipsPrefs.show === 'line'">
                        <span v-for="(chip, index) in chipsOf(setting)" :key="chipKey(chip, index)" class="desk-chip" :title="chipText(setting, chip)">
                          {{ middleEllipsis(chipText(setting, chip)) }}
                          <button type="button" tabindex="-1" @mousedown.stop.prevent="removeChip(setting, chip)">×</button>
                        </span>
                      </template>
                      <template v-else>
                        <span class="desk-set-chips-head">{{ chipFace(setting).head }}</span>
                        <span v-if="chipFace(setting).more" class="desk-set-chips-more">+{{ chipFace(setting).more }}</span>
                      </template>
                    </span>
                    <span v-else-if="setting.editor === 'currency'" class="desk-cell-value desk-currency-face">
                      <span class="desk-currency-face-code">{{ currencyParts(setting).code }}</span>
                      <span class="desk-currency-face-rate">
                        <span>Rate</span>
                        <span class="desk-currency-face-rate-value">{{ currencyParts(setting).rate }}</span>
                      </span>
                    </span>
                    <span v-else class="desk-cell-value">{{ shown(setting) }}</span>
                    <DeskMark
                      v-if="editingKey !== setting.key && markKind(setting)"
                      decorative
                      :kind="markKind(setting) === 'search' ? 'search' : 'select'"
                    />
                  </td>
                </template>
                <template v-else-if="row.cells[1]">
                  <td class="desk-settings-label" />
                  <td class="desk-settings-value desk-set-readonly" />
                </template>
              </template>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
    <DeskContextMenu
      v-if="chipsCtx.state.value"
      :menu="chipsCtx.state.value.menu"
      :x="chipsCtx.state.value.x"
      :y="chipsCtx.state.value.y"
      @close="chipsCtx.close"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, inject, nextTick, onMounted, onUnmounted, ref, watch, watchEffect } from 'vue';
import DeskCurrencyInput from '../currency/DeskCurrencyInput.vue';
import { registerOpenEditor } from '../form/openEditors';
import { deskHost } from '../host';
import { plainText } from '../automation/text';
import { useDeskAutomationNode } from '../automation/registry';
import { companyCurrencyValue } from '../currency/currencyDefault';
import { currencyPrefs, ensureCurrencyPrefs } from '../currency/currencyPrefs';
import { isDeskBlankHit } from '../form/blank';
import { deskEditorMode, runLookupEditor, type DeskLookupEditorMode } from '../form/lookupEditor';
import { DESK_FORM_ISSUES } from '../form/issues';
import { chipsFieldMenu, chipsHead, chipsPrefs, ensureChipsPrefs } from '../form/chipsShow';
import DeskLookupBox from '../form/DeskLookupBox.vue';
import DeskMark from '../form/DeskMark.vue';
import DeskContextMenu from '../menu/DeskContextMenu.vue';
import { useDeskContextMenu, type DeskFieldMenu } from '../menu/fieldMenu';
import { claimDeskKey, deskMoveDir, focusDeskToward, focusFormSaveForField, isClaimedDeskKey, resolveDeskJump } from '../focus/useDeskFocus';
import type { DeskBox, DeskDir } from '../focus/jump';
import { useDeskLayer } from '../keys/useDeskLayer';
import { autoDeskFieldId } from '../keys/layers';
import { parseEditorValue } from './display';
import { formatDeskDate } from '../date/deskDate';
import { datePrefs, ensureDatePrefs } from '../date/datePrefs';
import DeskCellEditor from './editors/DeskCellEditor.vue';
import type { DeskCurrencyValue, DeskLookupConfig } from './types';
import { editableCells, settleCell, stepCell, verticalCell, type DeskSetting, type DeskSettingsCell, type DeskSettingsRow } from './settings';

/**
 * Settings as a grid: two settings to a row (label, value, label, value) and bold title rows.
 * The cursor only visits value cells that can be changed. Arrows move it and open nothing.
 * Enter opens the dropdown (with the current value chosen) or starts typing. Enter inside an
 * open dropdown keeps the choice and moves to the next cell, which stays closed.
 * The grid keeps no data: the page owns the values and answers `change`.
 */
const props = withDefaults(
  defineProps<{
    rows: readonly DeskSettingsRow[];
    read: (key: string) => unknown;
    fieldId?: string;
    /** Marks the grid as the page's first focus. */
    initial?: boolean;
    /** Take focus when the grid is shown, for a tab that appears after its data loads. */
    autofocus?: boolean;
    /** Where to put focus when Enter leaves the last cell. Return true when it took focus. */
    exitTo?: () => boolean;
    /**
     * Enter on the last cell jumps to the next section, the same place Ctrl+Enter goes.
     * Off unless a page wants that jump without the modifier.
     */
    enterJump?: boolean;
    /**
     * Ctrl+Arrow moves one cell, the same as Arrow. At the edge it continues into the
     * nearest cell of the next grid. On by default. Pass false when this sheet should stay one field.
     */
    ctrlArrows?: boolean;
    /**
     * A plain arrow with no further cell in this sheet continues into the nearest cell of the
     * next grid, the same place Ctrl+Arrow goes. Off unless the page stacks grids in one block.
     */
    arrowLeave?: boolean;
  }>(),
  { fieldId: '', initial: false, autofocus: false, enterJump: false, ctrlArrows: true, arrowLeave: false },
);
const emit = defineEmits<{ change: [key: string, value: unknown] }>();

/** Present when a DeskForm wraps the grid. A page without one, such as company setup, leaves this unused. */
const formIssues = inject(DESK_FORM_ISSUES, null);
ensureCurrencyPrefs();
ensureChipsPrefs();
const chipsMenu = chipsFieldMenu();
const chipsCtx = useDeskContextMenu(() => chipsMenu);

function changed(key: string, value: unknown): void {
  formIssues?.edited(key);
  emit('change', key, value);
}

const scroller = ref<HTMLElement | null>(null);
const active = ref(false);
const gridId = props.fieldId || autoDeskFieldId('settings');
const focusAttrs = computed(() => (props.initial ? { 'data-desk-initial': '' } : {}));

const current = ref<string | null>(null);
const editingKey = ref<string | null>(null);
const draft = ref('');
const lookupSeed = ref('');
const fileBox = ref<HTMLInputElement | null>(null);
/** Set when a lookup row was just chosen, so the following advance does not step twice. */
let pickedJustNow = false;

const cells = computed(() => editableCells(props.rows));
const settings = computed(() => {
  const map = new Map<string, DeskSetting>();
  for (const row of props.rows) {
    if (row.kind !== 'pair') continue;
    for (const setting of row.cells) if (setting) map.set(setting.key, setting);
  }
  return map;
});

function textOf(setting: DeskSetting): string {
  const raw = props.read(setting.key);
  // A switch that was never stored reads as off, as in the classic form.
  if (setting.editor === 'check') return raw === true ? 'Yes' : 'No';
  if (raw instanceof File) return raw.name;
  if (setting.editor === 'currency') return currencyFace(raw);
  if (setting.editor === 'lookup') {
    const label = objectLabel(raw, setting.lookup?.labelKey ?? 'name');
    return label || (typeof raw === 'string' ? raw : '');
  }
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
  return '';
}

/** Code and rate of a closed currency cell, so the number is labelled as the rate. */
function currencyParts(setting: DeskSetting): { code: string; rate: string } {
  const raw = props.read(setting.key);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { code: '', rate: '' };
  const record = raw as Record<string, unknown>;
  const code = typeof record.code === 'string' ? record.code : '';
  const name = typeof record.name === 'string' ? record.name : '';
  const label = currencyPrefs.value.show === 'name' && name ? name : code;
  const rate = Number(record.currencyRate);
  return { code: label, rate: Number.isFinite(rate) && rate > 0 ? String(rate) : '1' };
}

/** The same code or name a closed currency control shows. */
function currencyFace(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return '';
  const record = raw as Record<string, unknown>;
  const code = typeof record.code === 'string' ? record.code : '';
  const name = typeof record.name === 'string' ? record.name : '';
  if (currencyPrefs.value.show === 'name' && name) return name;
  return code;
}

/** The object the currency editor edits. The same reference `read` returned, so typing does not reset it. */
function currencyOf(setting: DeskSetting): DeskCurrencyValue | null {
  const raw = props.read(setting.key);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as DeskCurrencyValue;
  return typeof record.code === 'string' && record.code ? record : null;
}

function issueOf(setting: DeskSetting): string | null {
  return formIssues?.issueFor(setting.key) ?? null;
}

function objectLabel(raw: unknown, key: string): string {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return '';
  const label = (raw as Record<string, unknown>)[key];
  if (typeof label === 'string') return label;
  if (typeof label === 'number') return String(label);
  return '';
}

function requiredLookup(setting: DeskSetting): DeskLookupConfig {
  return setting.lookup ?? { labelKey: 'name', valueKey: 'id', columns: [] };
}

function chipsOf(setting: DeskSetting): Record<string, unknown>[] {
  const raw = props.read(setting.key);
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object');
}

function chipText(setting: DeskSetting, chip: Record<string, unknown>): string {
  return objectLabel(chip, setting.lookup?.labelKey ?? 'name');
}

function chipLabels(setting: DeskSetting): string[] {
  return chipsOf(setting).map((chip) => chipText(setting, chip)).filter((label) => label !== '');
}

function chipFace(setting: DeskSetting): { head: string; more: number } {
  return chipsHead(chipLabels(setting), chipsPrefs.value.show);
}

function lookupMenu(setting: DeskSetting): { menu: DeskFieldMenu } | Record<string, never> {
  return setting.editor === 'chips' ? { menu: chipsMenu } : {};
}

function onChipsMenu(event: MouseEvent, setting: DeskSetting): void {
  if (setting.editor !== 'chips' || editingKey.value === setting.key) return;
  chipsCtx.open(event);
}

function chipKey(chip: Record<string, unknown>, index: number): string | number {
  const id = chip.id;
  if (typeof id === 'string' || typeof id === 'number') return id;
  return index;
}

/** Resting text, before it is shortened to fit the cell. */
function fullText(setting: DeskSetting): string {
  const text = textOf(setting);
  if (setting.editor === 'date' && text) {
    ensureDatePrefs();
    return formatDeskDate(text, datePrefs.value.show);
  }
  return setting.options?.find((option) => option.value === text)?.label ?? text;
}

/** A long value keeps its start and end, so a passkey stays inside the cell. */
function middleEllipsis(text: string): string {
  const limit = 48;
  if (text.length <= limit) return text;
  const keep = limit - 1;
  const head = Math.ceil(keep / 2);
  return `${text.slice(0, head)}…${text.slice(text.length - (keep - head))}`;
}

function shown(setting: DeskSetting): string {
  return middleEllipsis(fullText(setting));
}

/** The same right-hand mark an editable grid cell shows: search for a lookup, chevron for a dropdown. */
function markKind(setting: DeskSetting): 'search' | 'select' | null {
  if (setting.readonly) return null;
  if (setting.editor === 'lookup' || setting.editor === 'chips') return 'search';
  if (setting.editor === 'select' || setting.editor === 'check' || setting.editor === 'currency') return 'select';
  return null;
}

function valueTitle(setting: DeskSetting): string {
  const issue = issueOf(setting);
  if (issue) return issue;
  if (setting.editor === 'chips') return chipLabels(setting).join(', ');
  const full = fullText(setting);
  return full.length > 48 ? full : '';
}

function moveTo(cell: DeskSettingsCell | null): void {
  if (cell) current.value = cell.key;
}

/** Write the open editor. Nothing is sent when the value did not change or does not parse. */
function commit(setting: DeskSetting): void {
  if (editingKey.value !== setting.key) return;
  if (setting.editor === 'lookup' || setting.editor === 'chips' || setting.editor === 'file' || setting.editor === 'currency') {
    editingKey.value = null;
    if (setting.editor === 'lookup' && draft.value.trim() === '' && textOf(setting) !== '') changed(setting.key, null);
    return;
  }
  editingKey.value = null;
  if (setting.editor === 'number' || setting.editor === 'text' || setting.editor === 'date') {
    const value = parseEditorValue(setting.editor === 'date' ? 'text' : setting.editor, draft.value);
    if (setting.editor === 'number' && typeof value === 'string') return;
    if ((value ?? '') !== (props.read(setting.key) ?? '')) changed(setting.key, value);
    return;
  }
  if (draft.value === textOf(setting)) return;
  const value = setting.editor === 'check' ? draft.value === 'Yes' : setting.numeric ? Number(draft.value) : draft.value;
  changed(setting.key, value);
}

/** The next cell, or Save when this was the last one and the page asked for that. */
async function leave(setting: DeskSetting, step: 'next' | 'prev'): Promise<void> {
  await nextTick();
  const next = stepCell(cells.value, setting.key, step === 'next' ? 1 : -1);
  if (next) {
    moveTo(next);
    scroller.value?.focus();
    return;
  }
  if (step === 'next' && props.exitTo?.()) return;
  if (step === 'next' && props.enterJump) {
    scroller.value?.focus();
    if (resolveDeskJump()?.go()) return;
  }
  if (step === 'next' && focusFormSaveForField(gridId)) return;
  moveTo(cells.value.find((cell) => cell.key === setting.key) ?? null);
  scroller.value?.focus();
}

function cellBox(key: string): DeskBox | null {
  const node = scroller.value?.querySelector<HTMLElement>(`[data-setting="${CSS.escape(key)}"]`);
  if (!node) return null;
  const rect = node.getBoundingClientRect();
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
}

/** The cell Ctrl+Arrow should land on when it enters this sheet from another field. */
function cellNear(from: DeskBox, dir: DeskDir): DeskSettingsCell | null {
  const list = cells.value;
  if (list.length === 0) return null;
  const vertical = dir === 'up' || dir === 'down';
  const at = vertical ? (from.left + from.right) / 2 : (from.top + from.bottom) / 2;
  let best: DeskSettingsCell | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const cell of list) {
    const box = cellBox(cell.key);
    if (!box) continue;
    const mid = (vertical ? box.left + box.right : box.top + box.bottom) / 2;
    const dist = Math.abs(mid - at);
    if (dist < bestDist) {
      bestDist = dist;
      best = cell;
    }
  }
  if (!best) return null;
  if (vertical) {
    const edge = dir === 'up' ? Math.max(...list.map((cell) => cell.row)) : Math.min(...list.map((cell) => cell.row));
    return list.find((cell) => cell.row === edge && cell.side === best.side) ?? list.find((cell) => cell.row === edge) ?? best;
  }
  const edgeSide = dir === 'left' ? 1 : 0;
  return list.find((cell) => cell.row === best.row && cell.side === edgeSide) ?? list.find((cell) => cell.row === best.row) ?? best;
}

function moveDir(dir: DeskDir): void {
  const list = cells.value;
  const target =
    dir === 'left'
      ? stepCell(list, current.value, -1)
      : dir === 'right'
        ? stepCell(list, current.value, 1)
        : dir === 'up'
          ? verticalCell(list, current.value, -1)
          : verticalCell(list, current.value, 1);
  if (target) {
    moveTo(target);
    scroller.value?.focus();
    return;
  }
  const from = current.value ? cellBox(current.value) : null;
  if (from) focusDeskToward(dir, gridId, from);
}

async function finish(setting: DeskSetting, step: 'next' | 'prev'): Promise<void> {
  commit(setting);
  // The change can show or hide settings below. Step from the rebuilt rows.
  await leave(setting, step);
}

function cancel(): void {
  editingKey.value = null;
  scroller.value?.focus();
}

const seeded = ref(false);

function startEdit(seed?: string): void {
  const setting = current.value ? settings.value.get(current.value) : undefined;
  if (!setting || setting.readonly) return;
  if (setting.editor === 'file') {
    editingKey.value = setting.key;
    void nextTick(() => fileBox.value?.click());
    return;
  }
  if (setting.editor === 'currency') {
    editingKey.value = setting.key;
    return;
  }
  const searching = setting.editor === 'lookup' || setting.editor === 'chips';
  lookupSeed.value = searching ? (seed ?? '') : '';
  if (setting.editor === 'chips') draft.value = seed ?? '';
  else if (seed !== undefined && (setting.editor === 'text' || setting.editor === 'number' || setting.editor === 'lookup' || setting.editor === 'date')) draft.value = seed;
  else draft.value = textOf(setting);
  // A typed first key stays and the caret follows it. Enter opens with the whole value selected.
  seeded.value = seed !== undefined;
  editingKey.value = setting.key;
}

function onPick(setting: DeskSetting, record: Record<string, unknown>): void {
  pickedJustNow = true;
  if (setting.editor === 'chips' && !isDeskBlankHit(record)) {
    const list = chipsOf(setting);
    if (!list.some((item) => item.id === record.id)) changed(setting.key, [...list, record]);
    draft.value = '';
    lookupSeed.value = '';
    pickedJustNow = false;
    return;
  }
  changed(setting.key, isDeskBlankHit(record) ? null : record);
  editingKey.value = null;
  void leave(setting, 'next').then(() => {
    pickedJustNow = false;
  });
}

/**
 * New or Edit on a lookup setting that has an editor. The dialog ends the open editor when focus
 * leaves, so the returned row is written the same way a picked row is.
 */
async function runSettingEditor(setting: DeskSetting, mode: DeskLookupEditorMode, typed = ''): Promise<void> {
  const lookup = setting.lookup;
  if (!lookup?.editor || setting.readonly) return;
  const value = props.read(setting.key);
  const picked = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  const record = await runLookupEditor(lookup, mode, { picked, typed });
  if (!record) {
    scroller.value?.focus();
    return;
  }
  lookup.onPick?.(record);
  current.value = setting.key;
  onPick(setting, record);
}

function onLookupStep(setting: DeskSetting, step: 'next' | 'prev'): void {
  if (pickedJustNow) return;
  void finish(setting, step);
}

function onFile(setting: DeskSetting, event: Event): void {
  const input = event.target;
  const file = input instanceof HTMLInputElement ? (input.files?.[0] ?? null) : null;
  editingKey.value = null;
  if (file) changed(setting.key, file);
  void leave(setting, 'next');
}

/** The multiple list adds a row that is not chosen yet and removes one that is. */
function toggleChip(setting: DeskSetting, record: Record<string, unknown>): void {
  const list = chipsOf(setting);
  const has = list.some((item) => item.id === record.id);
  changed(setting.key, has ? list.filter((item) => item.id !== record.id) : [...list, record]);
}

function removeChip(setting: DeskSetting, chip: Record<string, unknown>): void {
  changed(setting.key, chipsOf(setting).filter((item) => item.id !== chip.id));
  current.value = setting.key;
}

function onCell(event: MouseEvent, setting: DeskSetting): void {
  // A right-click is the Show as menu. It must not open the editor.
  if (event.button !== 0) return;
  // Inside the open editor the mouse belongs to the editor (caret, options).
  if (editingKey.value === setting.key) return;
  event.preventDefault();
  if (setting.readonly) return;
  if (editingKey.value && editingKey.value !== setting.key) {
    const open = settings.value.get(editingKey.value);
    if (open) commit(open);
  }
  const already = current.value === setting.key;
  current.value = setting.key;
  scroller.value?.focus();
  if (already && editingKey.value !== setting.key) startEdit();
}

function onBlur(event: FocusEvent): void {
  const next = event.relatedTarget;
  if (next instanceof Node && scroller.value?.contains(next)) return;
  const open = editingKey.value ? settings.value.get(editingKey.value) : undefined;
  if (open) commit(open);
  active.value = false;
}

/** The open list is drawn on the page, outside the cell, so it is not inside the editor. */
function suggestOpen(): boolean {
  return document.querySelector('.desk-suggest, .desk-lookup-menu, .desk-currency-pop') !== null;
}

function onKey(event: KeyboardEvent): void {
  // The open dropdown or text box already handled this key.
  if (isClaimedDeskKey(event)) return;
  // Up and Down belong to the open list, the same as in an editable grid cell.
  if (editingKey.value && suggestOpen() && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
    event.preventDefault();
    const input = scroller.value?.querySelector<HTMLInputElement>('.desk-lookup input, .desk-combo input, .desk-currency input');
    if (input && document.activeElement !== input) input.focus();
    return;
  }
  if (!editingKey.value) {
    const resting = current.value ? settings.value.get(current.value) : undefined;
    const mode = resting?.editor === 'lookup' ? deskEditorMode(event, resting.lookup) : null;
    if (resting && mode) {
      event.preventDefault();
      event.stopPropagation();
      void runSettingEditor(resting, mode);
      return;
    }
  }
  if (props.ctrlArrows) {
    const dir = deskMoveDir(event);
    if (dir) {
      event.preventDefault();
      event.stopPropagation();
      const open = editingKey.value ? settings.value.get(editingKey.value) : undefined;
      if (open) commit(open);
      moveDir(dir);
      return;
    }
  }
  if (editingKey.value) return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const list = cells.value;
  let target: DeskSettingsCell | null | undefined;
  switch (event.key) {
    case 'ArrowRight':
      target = stepCell(list, current.value, 1);
      break;
    case 'ArrowLeft':
      target = stepCell(list, current.value, -1);
      break;
    case 'ArrowDown':
      target = verticalCell(list, current.value, 1);
      break;
    case 'ArrowUp':
      target = verticalCell(list, current.value, -1);
      break;
    case 'Tab':
      target = stepCell(list, current.value, event.shiftKey ? -1 : 1);
      // At the first or last cell Tab leaves the grid the usual way.
      if (!target) return;
      break;
    case 'Home':
      target = list[0];
      break;
    case 'End':
      target = list[list.length - 1];
      break;
    case 'Enter':
      claimDeskKey(event);
      event.preventDefault();
      startEdit();
      return;
    case 'Delete': {
      const setting = current.value ? settings.value.get(current.value) : undefined;
      if (setting?.editor === 'chips' && !setting.readonly && chipsOf(setting).length > 0) {
        claimDeskKey(event);
        event.preventDefault();
        changed(setting.key, []);
      }
      return;
    }
    default:
      if (event.key.length === 1) {
        const setting = current.value ? settings.value.get(current.value) : undefined;
        if (setting && !setting.readonly && (setting.editor === 'text' || setting.editor === 'number' || setting.editor === 'date' || setting.editor === 'lookup' || setting.editor === 'chips')) {
          claimDeskKey(event);
          event.preventDefault();
          startEdit(event.key);
        }
      }
      return;
  }
  if (!target && props.arrowLeave) {
    const dir =
      event.key === 'ArrowUp' ? 'up'
      : event.key === 'ArrowDown' ? 'down'
      : event.key === 'ArrowLeft' ? 'left'
      : event.key === 'ArrowRight' ? 'right'
      : null;
    const from = dir && current.value ? cellBox(current.value) : null;
    if (dir && from && focusDeskToward(dir, gridId, from)) {
      claimDeskKey(event);
      event.preventDefault();
      return;
    }
  }
  claimDeskKey(event);
  event.preventDefault();
  moveTo(target ?? null);
}

useDeskLayer({
  fields: [
    {
      id: gridId,
      focus: () => {
        moveTo(cells.value[0] ?? null);
        scroller.value?.focus();
        return true;
      },
      focusNear: (from, dir) => {
        const cell = cellNear(from, dir);
        if (!cell) return false;
        editingKey.value = null;
        moveTo(cell);
        scroller.value?.focus();
        return true;
      },
    },
  ],
});

/** Put the cursor on the first editable cell (when there is none yet) and take focus. */
function focus(): void {
  if (!current.value || !cells.value.some((cell) => cell.key === current.value)) moveTo(cells.value[0] ?? null);
  scroller.value?.focus();
}

// Rows change as settings show and hide. Keep the cursor on a cell that still exists.
watch(
  () => props.rows,
  (after, before) => {
    if (current.value && cells.value.some((cell) => cell.key === current.value)) return;
    moveTo(settleCell(before ?? [], after, current.value));
  },
);

onMounted(() => {
  moveTo(cells.value[0] ?? null);
  if (props.autofocus) focus();
  void fillEmptyCurrency();
});

/** An empty currency setting becomes the company currency. A loaded value wins if it arrives first. */
async function fillEmptyCurrency(): Promise<void> {
  for (const setting of settings.value.values()) {
    if (setting.editor !== 'currency' || currencyOf(setting)) continue;
    const next = await companyCurrencyValue(setting.lookup);
    if (currencyOf(setting)) continue;
    emit('change', setting.key, next);
  }
}

// Each visible key is a field, so an issue for it shows on the cell; a server issue on it puts the cursor there.
watchEffect((onCleanup) => {
  if (!formIssues) return;
  const stops = [...settings.value.keys()].map((key) =>
    formIssues.mount(key, () => {
      const cell = cells.value.find((item) => item.key === key);
      if (!cell || !scroller.value) return false;
      moveTo(cell);
      scroller.value.focus();
      scroller.value.querySelector<HTMLElement>(`[data-setting="${CSS.escape(key)}"]`)?.scrollIntoView({ block: 'nearest' });
      return true;
    }),
  );
  onCleanup(() => {
    for (const stop of stops) stop();
  });
});

function onCurrency(setting: DeskSetting, value: DeskCurrencyValue | null): void {
  changed(setting.key, value);
}

/** Write the open editor, if any, and stay on the cell. A page calls this before it saves. */
function commitOpen(): void {
  const open = editingKey.value ? settings.value.get(editingKey.value) : undefined;
  if (!open) return;
  commit(open);
  scroller.value?.focus();
}

// While a cell is being typed in, Ctrl+S or a dialog's OK writes it first (`openEditors`).
let releaseOpenEditor: (() => void) | null = null;
watch(editingKey, (key) => {
  releaseOpenEditor?.();
  releaseOpenEditor = key ? registerOpenEditor(commitOpen) : null;
});
onUnmounted(() => {
  releaseOpenEditor?.();
  releaseOpenEditor = null;
});

const rootEl = ref<HTMLElement | null>(null);

function same(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Write a value the way the cell editor would: coerce by editor, search a lookup, then `change`. */
async function setSetting(key: string, value: unknown): Promise<unknown> {
  const setting = settings.value.get(key);
  if (!setting) return { ok: false, error: `no setting ${key}`, reason: `keys: ${[...settings.value.keys()].join(', ')}` };
  if (setting.readonly) return { ok: false, error: `${key} is read only` };
  switch (setting.editor) {
    case 'check': {
      const on = value === true || (typeof value === 'string' && ['yes', 'true', 'on', '1'].includes(value.toLowerCase()));
      changed(key, on);
      return { ok: true };
    }
    case 'number': {
      const num = value === null || value === '' ? null : Number(value);
      if (num !== null && !Number.isFinite(num)) return { ok: false, error: `${key} needs a number` };
      changed(key, num);
      return { ok: true };
    }
    case 'select': {
      const text = value === null ? '' : plainText(value);
      const option = (setting.options ?? []).find((item) => same(item.value, text) || same(item.label, text));
      if (!option) return { ok: false, error: `no option "${text}" for ${key}`, reason: `options: ${(setting.options ?? []).map((item) => item.label).join(' | ')}` };
      changed(key, setting.numeric ? Number(option.value) : option.value);
      return { ok: true };
    }
    case 'lookup':
    case 'chips': {
      if (value === null || value === '') {
        changed(key, null);
        return { ok: true };
      }
      const lookup = setting.lookup;
      const search = deskHost().searchLookup;
      if (!lookup || !search) return { ok: false, error: `${key} has no lookup search` };
      const text = typeof value === 'object' ? plainText((value as Record<string, unknown>).label ?? (value as Record<string, unknown>).id) : plainText(value);
      const rows = await search(lookup, text);
      const label = (row: Record<string, unknown>): string => objectLabel(row, lookup.labelKey);
      const hit = rows.find((row) => same(label(row), text) || plainText(row.id) === text) ?? (rows.length === 1 ? rows[0] : undefined);
      if (!hit) return { ok: false, error: `no single match for "${text}"`, reason: `candidates: ${rows.slice(0, 8).map(label).join(' | ')}` };
      if (setting.editor === 'chips') toggleChip(setting, hit);
      else changed(key, hit);
      return { ok: true, value: label(hit) };
    }
    case 'file':
      return { ok: false, error: `${key} is a file: use setInputFiles on the node input` };
    default:
      changed(key, value === null || value === undefined ? '' : plainText(value));
      return { ok: true };
  }
}

function describeRows(): Record<string, unknown>[] {
  return [...settings.value.values()].map((setting) => ({
    key: setting.key,
    label: setting.label,
    editor: setting.editor,
    value: props.read(setting.key) ?? null,
    shown: fullText(setting),
    required: setting.required === true,
    readonly: setting.readonly === true,
    ...(setting.hint ? { hint: setting.hint } : {}),
    ...(setting.options ? { options: setting.options.map((item) => item.label) } : {}),
    issue: issueOf(setting),
  }));
}

useDeskAutomationNode({
  kind: 'settings',
  name: () => gridId,
  el: () => rootEl.value,
  read: () => ({ rows: describeRows(), current: current.value }),
  brief: () => ({ values: [...settings.value.keys()].map((key) => [key, props.read(key) ?? null]) }),
  ops: () => ({
    set: { description: 'Set one setting by key, through the cell commit path', args: { key: { type: 'string' }, value: { type: 'any' } }, run: (args) => setSetting(String(args.key), args.value) },
    setMany: {
      description: 'Set several settings in order',
      args: { values: { type: 'object' } },
      run: async (args) => {
        const results: Record<string, unknown> = {};
        for (const [key, value] of Object.entries((args.values ?? {}) as Record<string, unknown>)) results[key] = await setSetting(key, value);
        const failed = Object.entries(results).filter(([, result]) => (result as { ok?: boolean }).ok === false);
        return failed.length > 0 ? { ok: false, error: `${failed.length} settings failed`, reason: JSON.stringify(Object.fromEntries(failed)) } : { ok: true };
      },
    },
    commitOpen: { description: 'Write the open editor', run: () => commitOpen() },
  }),
});

defineExpose({ focus, commitOpen });
</script>
