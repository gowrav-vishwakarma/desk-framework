<template>
  <div
    ref="rootEl"
    class="desk-field"
    :class="[`is-${labelStyle}`, { 'is-invalid': invalid }]"
    v-bind="noMove ? { 'data-desk-no-move': '' } : {}"
    @focusout="onFocusOut"
  >
    <label :for="fieldId" :class="{ 'desk-label-clip': labelStyle === 'placeholder' || labelStyle === 'inset' }">{{ label }}<span v-if="required" class="desk-req" aria-hidden="true"> *</span></label>
    <div class="desk-field-control">
    <span v-if="labelStyle === 'inset'" class="desk-inset-label" :title="label">{{ label }}<span v-if="required" class="desk-req" aria-hidden="true"> *</span></span>
    <DeskCombo
      v-if="kind === 'select'"
      v-model="selectValue"
      :field-id="fieldId"
      :options="options ?? []"
      :blank="blank === true"
      v-bind="{
        ...(menu ? { menu } : {}),
        ...(initial ? { initial: true } : {}),
        ...(hint ? { placeholder: hint } : {}),
        ...(hoverTitle ? { title: hoverTitle } : {}),
      }"
      @advance="(via) => focusNextDeskField(fieldId, via)"
      @back="focusPrevDeskField(fieldId)"
    />
    <DeskLookupBox
      v-else-if="kind === 'lookup' && lookup"
      ref="lookupBox"
      v-model="textValue"
      :field-id="fieldId"
      :lookup="lookup"
      v-bind="{
        ...(menu ? { menu } : {}),
        ...(initial ? { initial: true } : {}),
        ...(hint ? { placeholder: hint } : {}),
        ...(hoverTitle ? { title: hoverTitle } : {}),
      }"
      @pick="emit('pick', $event)"
      @advance="(via) => focusNextDeskField(fieldId, via)"
      @back="focusPrevDeskField(fieldId)"
    />
    <DeskDateInput
      v-else-if="kind === 'date'"
      :model-value="dateValue"
      :field-id="fieldId"
      v-bind="{
        ...(menu ? { menu } : {}),
        ...(initial ? { initial: true } : {}),
        ...(readonly ? { readonly: true } : {}),
        ...hintAttrs,
      }"
      @update:model-value="onDate"
      @advance="(via) => focusNextDeskField(fieldId, via)"
      @back="focusPrevDeskField(fieldId)"
    />
    <DeskCurrencyInput
      v-else-if="kind === 'currency'"
      :model-value="currencyModel ?? null"
      :field-id="fieldId"
      v-bind="{
        ...(lookup ? { lookup } : {}),
        ...(menu ? { menu } : {}),
        ...(initial ? { initial: true } : {}),
        ...(readonly ? { readonly: true } : {}),
        ...(rateLocked ? { rateLocked: true } : {}),
        ...hintAttrs,
      }"
      @update:model-value="onCurrency"
      @advance="(via) => focusNextDeskField(fieldId, via)"
      @back="focusPrevDeskField(fieldId)"
    />
    <textarea
      v-else-if="kind === 'textarea'"
      :id="fieldId"
      :data-desk-field="fieldId"
      :value="shown"
      v-bind="{
        ...hintAttrs,
        ...(initial ? { 'data-desk-initial': '' } : {}),
      }"
      rows="2"
      @focus="onControlFocus"
      @input="onInput"
      @keydown.enter.exact.prevent="focusNextDeskField(fieldId)"
      @keydown.tab.prevent="onTab"
      @contextmenu="ctx.open($event)"
    />
    <input
      v-else
      :id="fieldId"
      :data-desk-field="fieldId"
      :type="kind === 'password' ? 'password' : 'text'"
      :value="shown"
      :class="{ 'desk-opens': opens }"
      v-bind="{
        ...hintAttrs,
        ...(autocomplete ? { autocomplete } : {}),
        ...(initial ? { 'data-desk-initial': '' } : {}),
        ...(readonly || opens ? { readonly: true } : {}),
        ...(opens ? { 'data-desk-opens': '' } : {}),
      }"
      @focus="onControlFocus"
      @input="onInput"
      @keydown.enter.ctrl="onOpensKey"
      @keydown.enter.alt="onOpensKey"
      @keydown.enter.meta="onOpensKey"
      @keydown.enter.shift.exact="onShiftEnter"
      @keydown.enter.exact.prevent="onEnter"
      @keydown.tab.prevent="onTab"
      @dblclick="opens && emit('open')"
      @contextmenu="ctx.open($event)"
    />
    <button
      v-if="opens && kind !== 'select' && kind !== 'lookup' && kind !== 'date' && kind !== 'currency' && kind !== 'textarea'"
      type="button"
      class="desk-opens-mark"
      tabindex="-1"
      :title="`${deskKeyLabel('grid-cell-dialog')} opens`"
      @mousedown.prevent
      @click="emit('open')"
    >
      <svg viewBox="0 0 12 12" aria-hidden="true">
        <rect x="1.2" y="1.6" width="9.6" height="8.8" rx="1" fill="none" stroke="currentColor" stroke-width="1.2" />
        <path d="M1.2 4.4h9.6" fill="none" stroke="currentColor" stroke-width="1.2" />
      </svg>
    </button>
    <DeskContextMenu
      v-if="ctx.state.value"
      :menu="ctx.state.value.menu"
      :x="ctx.state.value.x"
      :y="ctx.state.value.y"
      @close="ctx.close"
    />
    <slot name="suffix" />
    </div>
    <span v-if="issue" class="desk-field-msg" :title="issue">{{ issue }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, ref, watchEffect } from 'vue';
import { plainText } from '../automation/text';
import { useDeskAutomationNode } from '../automation/registry';
import { invalidPaint, shownText } from '../automation/visible';
import { lookupField } from './lookupField';
import { isDeskBlankHit } from './blank';
import type { DeskFieldLabelStyle } from '../formLayout/types';
import type { DeskCurrencyValue, DeskLookupConfig, DeskSelectOption } from '../grid/types';
import { claimDeskKey, focusDeskField, focusNextDeskField, focusPrevDeskField, selectDeskControl } from '../focus/useDeskFocus';
import { keyInputOf, toCombo } from '../keys/combo';
import { deskActionsFor, deskKeyLabel } from '../keys/deskKeymap';
import { DESK_FORM_ISSUES } from './issues';
import DeskContextMenu from '../menu/DeskContextMenu.vue';
import { useDeskContextMenu, type DeskFieldMenu } from '../menu/fieldMenu';
import DeskCombo from './DeskCombo.vue';
import DeskCurrencyInput from '../currency/DeskCurrencyInput.vue';
import DeskDateInput from '../date/DeskDateInput.vue';
import { dateParseOptions } from '../date/datePrefs';
import { parseDeskDate } from '../date/deskDate';
import DeskLookupBox from './DeskLookupBox.vue';

const model = defineModel<string | number | null>({ required: true });
/** Currency and factor. Used when `kind` is `currency`. The text model stays unused for that kind. */
const currencyModel = defineModel<DeskCurrencyValue | null>('currency');
const props = withDefaults(defineProps<{
  fieldId: string;
  label: string;
  kind?: 'text' | 'number' | 'date' | 'select' | 'textarea' | 'lookup' | 'currency' | 'password';
  options?: DeskSelectOption[];
  lookup?: DeskLookupConfig;
  /** A select shows "---" first. Choosing it stores null. A lookup uses `lookup.blank`. */
  blank?: boolean;
  /** This field takes focus when its page or dialog opens. */
  initial?: boolean;
  readonly?: boolean | undefined;
  /** Currency kind: Rate stays 1 and cannot be typed when Conversion Rate is off. */
  rateLocked?: boolean;
  /** Ctrl+Arrow is not a field move while this field has focus. */
  noMove?: boolean;
  /** Shows * on the label. Leaving it empty turns the field reddish. */
  required?: boolean;
  /**
   * Where the label sits. `placeholder` uses it as the empty hint.
   * `inset` keeps a short label inside the input. Defaults to beside the input.
   */
  labelStyle?: DeskFieldLabelStyle;
  /**
   * Right-click menu. A date shows its own groups first. A lookup shows the lookup's menu first.
   * Without a menu, the browser's own shows.
   */
  menu?: DeskFieldMenu;
  /**
   * A summary field whose value is set in a dialog. It cannot be typed in. Enter and Tab stop on it and
   * move on, as on a grid cell with a dialog; Ctrl+Enter (`grid-cell-dialog`), a double-click or its
   * dialog mark emits `open`. Text kind only.
   */
  opens?: boolean;
  /** Enter emits `submit` instead of moving to the next field, as on the last field of a sign-in form. Text and password kinds. */
  submits?: boolean;
  /** The browser `autocomplete` hint, such as `username` or `current-password`. Text and password kinds. */
  autocomplete?: string;
  /** Hint shown while the field is empty. Wins over the hint of the `placeholder` label style. */
  placeholder?: string;
  /** Longest value kept, counted after `formatter`. Typed kinds (text, number, password, textarea). */
  maxlength?: number | string;
  /** Runs on every input; what it returns is shown and stored. Typed kinds (text, number, password, textarea). */
  formatter?: (value: string) => string;
  /** Number kind: store a Number, or null when empty, instead of the typed text. Text that is not a number stays text. */
  numeric?: boolean;
}>(), { labelStyle: 'side' });
const emit = defineEmits<{ pick: [Record<string, unknown>]; open: []; submit: [] }>();

const form = inject(DESK_FORM_ISSUES, null);
const ctx = useDeskContextMenu(() => props.menu ?? null);
const hint = computed(() => props.placeholder ?? (props.labelStyle === 'placeholder' ? `${props.label}${props.required ? ' *' : ''}` : ''));
const maxLength = computed(() => (props.maxlength === undefined || props.maxlength === '' ? undefined : Number(props.maxlength)));
const hoverTitle = computed(() => (props.labelStyle === 'placeholder' || props.labelStyle === 'inset' ? props.label : ''));
const hintAttrs = computed(() => ({
  ...(hint.value ? { placeholder: hint.value } : {}),
  ...(hoverTitle.value ? { title: hoverTitle.value } : {}),
}));
const shown = computed(() => (model.value === null || model.value === undefined ? '' : String(model.value)));
function stored(value: string, clearable: boolean): string | null {
  return clearable && value === '' ? null : value;
}

const textValue = computed({
  get: () => shown.value,
  set: (value: string) => {
    form?.edited(props.fieldId);
    model.value = stored(value, props.lookup?.blank === true);
  },
});
const selectValue = computed({
  get: () => shown.value,
  set: (value: string) => {
    form?.edited(props.fieldId);
    model.value = stored(value, props.blank === true);
  },
});
const dateValue = computed(() => (model.value === null || model.value === undefined || model.value === '' ? null : String(model.value)));

function onCurrency(value: DeskCurrencyValue | null): void {
  form?.edited(props.fieldId);
  currencyModel.value = value;
}

/** The form's message for this field, or null. */
const issue = computed(() => form?.issueFor(props.fieldId) ?? null);
/** Set once focus has left the field, so a required field is not red before anyone touched it. */
const touched = ref(false);
const invalid = computed(() => {
  if (issue.value !== null) return true;
  if (props.required !== true || !touched.value) return false;
  if (props.kind === 'currency') return !(currencyModel.value?.code);
  return shown.value.trim() === '';
});

// The form learns this field is on screen (its issue shows here) and how to focus it (a server issue on it).
watchEffect((onCleanup) => {
  if (form) onCleanup(form.mount(props.fieldId, focusSelf));
});

function onFocusOut(event: FocusEvent): void {
  if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) touched.value = true;
}

function onControlFocus(event: FocusEvent): void {
  selectDeskControl(event.target);
}

function onDate(value: string | null): void {
  form?.edited(props.fieldId);
  model.value = value;
}

function onInput(event: Event): void {
  form?.edited(props.fieldId);
  const target = event.target as HTMLInputElement | HTMLTextAreaElement;
  let value = props.formatter ? props.formatter(target.value) : target.value;
  // Capped here, after the formatter, not by a native maxlength: that would cut a paste before the formatter drops its spaces.
  if (maxLength.value !== undefined) value = value.slice(0, maxLength.value);
  if (target.value !== value) target.value = value;
  model.value = props.numeric && props.kind === 'number' ? numberOrText(value) : value;
}

function numberOrText(value: string): number | string | null {
  if (value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : value;
}

function onEnter(event: KeyboardEvent): void {
  if (props.submits && !props.opens) {
    claimDeskKey(event);
    emit('submit');
    return;
  }
  focusNextDeskField(props.fieldId);
}

/** The dialog key (Ctrl+Enter by default) opens a summary field's dialog; it wins over the section jump here. */
function onOpensKey(event: KeyboardEvent): void {
  if (!props.opens || event.key !== 'Enter') return;
  const combo = toCombo(keyInputOf(event));
  if (!combo || !deskActionsFor(combo).includes('grid-cell-dialog')) return;
  event.preventDefault();
  claimDeskKey(event);
  emit('open');
}

function onShiftEnter(event: KeyboardEvent): void {
  claimDeskKey(event);
  event.preventDefault();
  focusPrevDeskField(props.fieldId);
}

function onTab(event: KeyboardEvent): void {
  if (event.shiftKey) focusPrevDeskField(props.fieldId);
  else focusNextDeskField(props.fieldId, 'tab');
}

const rootEl = ref<HTMLElement | null>(null);

/** Focus this field: through its layer (the desk's focus rules), else its own control. */
function focusSelf(): boolean {
  if (focusDeskField(props.fieldId)) return true;
  const control = rootEl.value?.querySelector<HTMLElement>('input, textarea, select, button');
  control?.focus();
  return control !== null && control !== undefined;
}
/** What the lookup box exposes to automation. Typed here because the box is generic, so its instance type is lost. */
interface LookupBoxApi {
  automationSearch: (query: string) => Promise<Record<string, unknown>[]>;
  automationRows: () => Record<string, unknown>[];
  automationPick: (hit: Record<string, unknown>) => void;
  automationList: () => { open: boolean; loading: boolean; active: number; rows: number };
  automationText: () => string;
}
const lookupBox = ref<LookupBoxApi | null>(null);

function control(): Element | null {
  return rootEl.value?.querySelector('[data-desk-field]') ?? null;
}

/** A password is never read back, only whether one was typed. */
function masked(): string {
  return shown.value === '' ? '' : '********';
}

function readValue(): unknown {
  if (props.kind === 'currency') return currencyModel.value ?? null;
  if (props.kind === 'password') return masked();
  return model.value ?? null;
}

function sameText(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Search the lookup and pick the row the same way a user does: type, then choose. */
async function pickLookup(target: unknown): Promise<unknown> {
  const box = lookupBox.value;
  const config = props.lookup;
  if (!box || !config) return { ok: false, error: `${props.fieldId} is not a lookup` };
  if (target === null || target === '') {
    const blank = box.automationRows().find((row) => isDeskBlankHit(row));
    if (!blank) {
      model.value = null;
      return { ok: true, value: null };
    }
    box.automationPick(blank);
    return { ok: true, value: null };
  }
  const wanted = typeof target === 'object' ? target as Record<string, unknown> : null;
  const text = wanted ? plainText(wanted.label ?? wanted.id) : plainText(target);
  const hits = (await box.automationSearch(text)).filter((row) => lookupField(row, config.labelKey) !== '');
  const exact = hits.find((row) => sameText(lookupField(row, config.labelKey), text) || plainText(row.id) === text);
  const chosen = exact ?? (hits.length === 1 ? hits[0] : undefined);
  if (!chosen) {
    return { ok: false, error: `no single match for "${text}"`, reason: `candidates: ${hits.slice(0, 8).map((row) => lookupField(row, config.labelKey)).join(' | ')}` };
  }
  box.automationPick(chosen);
  return { ok: true, value: lookupField(chosen, config.labelKey), id: chosen.id ?? null };
}

function setValue(value: unknown): unknown {
  if (props.readonly) return { ok: false, error: `${props.fieldId} is read only` };
  const kind = props.kind ?? 'text';
  if (kind === 'lookup') return pickLookup(value);
  if (kind === 'select') {
    const text = value === null ? '' : plainText(value);
    const option = (props.options ?? []).find((item) => sameText(item.value, text) || sameText(item.label, text));
    if (!option && text !== '') return { ok: false, error: `no option "${text}"`, reason: `options: ${(props.options ?? []).map((item) => item.label).join(' | ')}` };
    selectValue.value = option ? option.value : '';
    return { ok: true, value: option?.value ?? '' };
  }
  if (kind === 'date') {
    if (value === null || value === '') {
      onDate(null);
      return { ok: true, value: null };
    }
    const text = plainText(value).trim();
    // `20260827` reads as year-first here; the typed-date parser would read it in the user's own order.
    const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(text);
    const iso = parseDeskDate(compact ? `${compact[1]}-${compact[2]}-${compact[3]}` : text, dateParseOptions());
    if (!iso) {
      return { ok: false, error: `"${text}" is not a date`, reason: 'send YYYY-MM-DD, for example 2026-08-27. The field also reads what a person types: 27/08/2026, 27 aug, t (today), +3 (in three days).' };
    }
    onDate(iso);
    return { ok: true, value: iso };
  }
  if (kind === 'currency') {
    onCurrency((value ?? null) as DeskCurrencyValue | null);
    return { ok: true };
  }
  form?.edited(props.fieldId);
  model.value = value === null || value === undefined ? '' : (typeof value === 'number' ? value : plainText(value));
  return { ok: true };
}

useDeskAutomationNode({
  kind: 'field',
  name: () => props.fieldId,
  el: () => rootEl.value,
  read: () => {
    const el = control();
    const paint = invalidPaint(rootEl.value);
    return {
      id: props.fieldId,
      label: props.label,
      editor: props.kind ?? 'text',
      value: readValue(),
      shown: props.kind === 'password' ? masked() : shownText(el),
      required: props.required === true,
      readonly: props.readonly === true || props.opens === true,
      invalid: paint.invalid,
      issue: issue.value ?? paint.text,
      focused: el !== null && el === document.activeElement,
      ...(props.kind === 'select' ? { options: (props.options ?? []).map((item) => ({ value: item.value, label: item.label })) } : {}),
    };
  },
  brief: () => ({ value: readValue(), issue: issue.value }),
  ops: () => ({
    set: { description: 'Set the value through the same path typing and picking use', args: { value: { type: 'any', description: 'text, number, ISO date, option label or lookup label' } }, run: (args) => setValue(args.value) },
    blank: { description: 'Clear the value', run: () => setValue(null) },
    ...(props.kind === 'lookup'
      ? {
          search: {
            description: 'Search the lookup and return the candidates',
            args: { query: { type: 'string' } },
            run: async (args: Record<string, unknown>) => {
              const rows = (await lookupBox.value?.automationSearch(plainText(args.query))) ?? [];
              return rows.slice(0, 20).map((row) => ({ id: row.id ?? null, label: props.lookup ? lookupField(row, props.lookup.labelKey) : '' }));
            },
          },
          pick: { description: 'Pick a lookup row by label or id', args: { target: { type: 'any' } }, run: (args: Record<string, unknown>) => pickLookup(args.target) },
        }
      : {}),
    ...(props.opens ? { open: { description: 'Open the dialog this field summarises', run: () => emit('open') } } : {}),
  }),
});
</script>