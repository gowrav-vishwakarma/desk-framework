<template>
  <div
    ref="root"
    class="desk-currency"
    :class="{ 'is-grid': variant === 'grid', 'is-invalid': invalid }"
    @focusout="onFocusOut"
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
        ...(title ? { title } : {}),
      }"
      @focus="onFocus"
      @input="onType"
      @keydown="onKey"
    />
    <label class="desk-currency-rate-wrap">
      <span>Rate</span>
      <input
        ref="rateBox"
        class="desk-currency-rate"
        inputmode="decimal"
        title="Rate: how many company-currency units equal 1 of this currency"
        :readonly="!foreign || rateLocked === true"
        :tabindex="foreign && !rateLocked ? 0 : -1"
        :value="rateText"
        @input="onRate"
        @keydown="onRateKey"
      />
    </label>
    <Teleport to="body">
      <div v-if="open" class="desk-currency-pop" :style="popStyle">
        <button
          v-for="(row, index) in filtered"
          :key="row.code"
          type="button"
          :class="{ active: index === active }"
          @mousedown.prevent="choose(row)"
        >
          <span>{{ row.code }}</span>
          <span>{{ row.name }}</span>
        </button>
        <p v-if="filtered.length === 0">No currency</p>
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
import { computed, nextTick, onMounted, ref } from 'vue';
import { claimDeskKey, isDeskNavKey } from '../focus/useDeskFocus';
import type { DeskCurrencyValue, DeskLookupConfig } from '../grid/types';
import DeskContextMenu from '../menu/DeskContextMenu.vue';
import { mergeDeskMenus, useDeskContextMenu, type DeskFieldMenu } from '../menu/fieldMenu';
import { companyCurrencyValue, currencyList } from './currencyDefault';
import { currencyFieldMenu } from './currencyMenu';
import { useCurrencyPrefs } from './currencyPrefs';
import { deskCompanyCurrency } from './money';

interface CurrencyRow {
  id: number | null;
  code: string;
  name: string;
  symbol: string | null;
}

const model = defineModel<DeskCurrencyValue | null>({ default: null });
const props = withDefaults(defineProps<{
  fieldId?: string;
  variant?: 'field' | 'grid';
  lookup?: DeskLookupConfig;
  initial?: boolean;
  readonly?: boolean;
  /** Rate stays 1 and cannot be typed. Used when the voucher Conversion Rate preference is off. */
  rateLocked?: boolean;
  placeholder?: string;
  title?: string;
  /** Groups added after the currency menu every currency control has. */
  menu?: DeskFieldMenu;
}>(), { variant: 'field' });

const emit = defineEmits<{
  advance: [via: 'enter' | 'tab'];
  back: [via: 'enter' | 'tab'];
  cancel: [];
}>();

const { prefs } = useCurrencyPrefs();
const ctx = useDeskContextMenu(() => mergeDeskMenus(currencyFieldMenu(), props.menu));
const root = ref<HTMLElement | null>(null);
const box = ref<HTMLInputElement | null>(null);
const rateBox = ref<HTMLInputElement | null>(null);
const focused = ref(false);
const invalid = ref(false);
const draft = ref('');
const open = ref(false);
const active = ref(0);
const rows = ref<CurrencyRow[]>([]);
const popStyle = ref({ top: '0px', left: '0px', width: '240px' });
/** A pick focuses the box again. That focus must not open the list a second time. */
let choosing = false;

const face = computed(() => {
  const value = model.value;
  if (!value?.code) return '';
  if (prefs.value.show === 'name' && value.name) return value.name;
  return value.code;
});

const foreign = computed(() => {
  const code = model.value?.code?.trim().toUpperCase() ?? '';
  return code !== '' && code !== deskCompanyCurrency();
});

const rateText = computed(() => {
  if (!foreign.value) return '1';
  const rate = model.value?.currencyRate;
  if (rate === null || rate === undefined || rate === 0) return '';
  return String(rate);
});

const filtered = computed(() => {
  const needle = focused.value ? draft.value.trim().toLowerCase() : '';
  if (!needle || needle === face.value.trim().toLowerCase()) return rows.value;
  return rows.value.filter((row) => row.code.toLowerCase().includes(needle) || row.name.toLowerCase().includes(needle));
});

async function ensureList(): Promise<void> {
  if (!props.lookup) return;
  rows.value = await currencyList(props.lookup);
}

function write(value: DeskCurrencyValue | null): void {
  model.value = value;
  invalid.value = false;
}

/** An empty control becomes the company currency, with factor 1. */
async function applyDefault(): Promise<void> {
  if (props.readonly || model.value?.code) return;
  const next = await companyCurrencyValue(props.lookup);
  if (model.value?.code) return;
  write(next);
}

function place(): void {
  const anchor = root.value ?? box.value;
  if (!anchor) return;
  const rect = anchor.getBoundingClientRect();
  const width = Math.max(rect.width, 240);
  let left = rect.left;
  if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - 8 - width);
  let top = rect.bottom;
  if (top + 180 > window.innerHeight && rect.top > 180) top = Math.max(4, rect.top - 180);
  popStyle.value = { top: `${top}px`, left: `${left}px`, width: `${width}px` };
}

async function showList(): Promise<void> {
  if (props.readonly) return;
  await ensureList();
  open.value = true;
  const code = model.value?.code?.toUpperCase() ?? '';
  const index = filtered.value.findIndex((row) => row.code === code);
  active.value = index >= 0 ? index : 0;
  void nextTick(() => place());
}

function choose(row: CurrencyRow): void {
  choosing = true;
  const same = row.code === deskCompanyCurrency();
  const kept = model.value?.code.toUpperCase() === row.code ? model.value.currencyRate : null;
  write({
    id: row.id,
    code: row.code,
    name: row.name,
    symbol: row.symbol,
    currencyRate: same || props.rateLocked ? 1 : kept ?? null,
  });
  draft.value = prefs.value.show === 'name' ? row.name : row.code;
  open.value = false;
  if (!same && !props.rateLocked) void nextTick(() => rateBox.value?.focus());
  else box.value?.focus();
  void nextTick(() => {
    choosing = false;
  });
}

function onFocus(): void {
  focused.value = true;
  invalid.value = false;
  draft.value = face.value;
  void nextTick(() => box.value?.select());
  // The list opens with the field, the way the classic currency box does.
  if (!choosing) void showList();
}

function onFocusOut(event: FocusEvent): void {
  const next = event.relatedTarget;
  if (next instanceof Node && event.currentTarget instanceof Node && event.currentTarget.contains(next)) return;
  focused.value = false;
  open.value = false;
  draft.value = face.value;
}

function onType(event: Event): void {
  draft.value = (event.target as HTMLInputElement).value;
  active.value = 0;
  void showList();
}

function finishRate(): boolean {
  if (!foreign.value || props.rateLocked) return true;
  const rate = model.value?.currencyRate;
  if (rate === null || rate === undefined || !(Number(rate) > 0)) {
    invalid.value = true;
    rateBox.value?.focus();
    return false;
  }
  return true;
}

function onKey(event: KeyboardEvent): void {
  if (isDeskNavKey(event)) return;
  claimDeskKey(event);
  if (event.key === 'Escape') {
    event.preventDefault();
    if (open.value) {
      open.value = false;
      draft.value = face.value;
      return;
    }
    if (props.variant === 'grid') emit('cancel');
    return;
  }
  if (!props.readonly && ((event.altKey && event.key === 'ArrowDown' && !event.shiftKey && !event.ctrlKey && !event.metaKey) || event.key === 'F4')) {
    event.preventDefault();
    if (open.value) open.value = false;
    else void showList();
    return;
  }
  if (open.value && (event.key === 'ArrowDown' || event.key === 'ArrowUp') && !event.altKey && !event.ctrlKey && !event.metaKey) {
    event.preventDefault();
    const count = filtered.value.length;
    if (count === 0) return;
    const delta = event.key === 'ArrowDown' ? 1 : -1;
    active.value = (active.value + delta + count) % count;
    return;
  }
  if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault();
    if (open.value) {
      const row = filtered.value[active.value];
      if (row) choose(row);
      else open.value = false;
      return;
    }
    if (event.shiftKey) {
      emit('back', 'enter');
      return;
    }
    if (foreign.value && !props.rateLocked && document.activeElement !== rateBox.value) {
      rateBox.value?.focus();
      return;
    }
    if (!finishRate()) return;
    emit('advance', 'enter');
    return;
  }
  if (event.key === 'Tab') {
    event.preventDefault();
    open.value = false;
    if (event.shiftKey) {
      emit('back', 'tab');
      return;
    }
    if (foreign.value && !props.rateLocked) {
      rateBox.value?.focus();
      return;
    }
    emit('advance', 'tab');
  }
}

function onRate(event: Event): void {
  if (!foreign.value || props.rateLocked) return;
  const text = (event.target as HTMLInputElement).value;
  const current = model.value;
  if (!current) return;
  const parsed = Number(text);
  write({ ...current, currencyRate: text.trim() !== '' && Number.isFinite(parsed) ? parsed : null });
}

function onRateKey(event: KeyboardEvent): void {
  if (isDeskNavKey(event)) return;
  claimDeskKey(event);
  if (event.key === 'Escape') {
    event.preventDefault();
    box.value?.focus();
    return;
  }
  if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault();
    if (event.shiftKey) {
      box.value?.focus();
      return;
    }
    if (!finishRate()) return;
    emit('advance', 'enter');
    return;
  }
  if (event.key === 'Tab') {
    event.preventDefault();
    if (event.shiftKey) {
      box.value?.focus();
      return;
    }
    if (!finishRate()) return;
    emit('advance', 'tab');
  }
}

onMounted(() => {
  void applyDefault();
  // The cell editor focuses its own box. This control is that box when a grid cell opens it.
  if (props.variant === 'grid') box.value?.focus();
});
</script>
