<template>
  <div v-if="column" class="sf">
    <div class="sf-field" :class="{ bad: problemAt('column') }">
      <label class="sf-label">Shows column</label>
      <PickButton
        :model-value="column.column"
        :items="columnItems(result)"
        show-sub
        placeholder="Choose a column…"
        @update:model-value="setColumn"
      />
      <p v-if="problemAt('column')" class="sf-problem">
        <StudioIcon name="warn" /> {{ problemAt('column') }}
      </p>
    </div>
    <div class="sf-field" :class="{ bad: problemAt('label') }">
      <label class="sf-label">Heading</label>
      <input
        type="text"
        class="sf-input"
        :value="column.label"
        @input="edit((c) => (c.label = ($event.target as HTMLInputElement).value))"
      />
      <p v-if="problemAt('label')" class="sf-problem">
        <StudioIcon name="warn" /> {{ problemAt('label') }}
      </p>
    </div>
    <div class="sf-field">
      <label class="sf-label">Shown as</label>
      <select
        class="sf-input"
        :value="column.format ?? ''"
        @change="setFormat(($event.target as HTMLSelectElement).value)"
      >
        <option value="">Automatic</option>
        <option v-for="item in formatsFor(type)" :key="item.value" :value="item.value">
          {{ item.label }}
        </option>
      </select>
    </div>
    <div v-if="numeric" class="sf-field">
      <label class="sf-switch"
        ><input
          type="checkbox"
          :checked="totalled"
          @change="setTotalled(($event.target as HTMLInputElement).checked)"
        />
        <span>Total this column at the bottom</span></label
      >
    </div>
    <div class="sf-field">
      <label class="sf-label">Width <span class="sf-optional">optional</span></label>
      <input
        type="number"
        class="sf-input sf-number"
        min="40"
        step="10"
        :value="column.width ?? ''"
        :placeholder="numeric ? '120' : '160'"
        @input="setOptional('width', numberOrNone(($event.target as HTMLInputElement).value))"
      />
    </div>

    <button type="button" class="sf-more" :aria-expanded="moreOpen" @click="moreOpen = !moreOpen">
      <StudioIcon :name="moreOpen ? 'open' : 'right'" /> More options
    </button>
    <div v-if="moreOpen" class="sf-advanced">
      <div class="sf-field in-switches">
        <label class="sf-switch"
          ><input
            type="checkbox"
            :checked="column.quiet === true"
            @change="setOptional('quiet', ($event.target as HTMLInputElement).checked || undefined)"
          />
          <span>Dim (secondary)</span></label
        >
        <label class="sf-switch"
          ><input
            type="checkbox"
            :checked="column.hidden === true"
            @change="
              setOptional('hidden', ($event.target as HTMLInputElement).checked || undefined)
            "
          />
          <span>Starts hidden; users can show it</span></label
        >
      </div>
      <div class="sf-field" :class="{ bad: problemAt('caption') }">
        <label class="sf-label">Second line <span class="sf-optional">optional</span></label>
        <PickButton
          :model-value="column.caption ?? ''"
          :items="columnItems(result)"
          clearable
          placeholder="None"
          @update:model-value="(caption) => setOptional('caption', caption || undefined)"
        />
        <p class="sf-hint">
          Another column shown small under the value, such as the variant under the product.
        </p>
      </div>
      <div class="sf-field">
        <label class="sf-label">Same value as the row above</label>
        <span class="cond-seg sf-seg" role="radiogroup" aria-label="Same value as the row above">
          <button
            v-for="item in REPEATS"
            :key="item.value"
            type="button"
            role="radio"
            :aria-checked="(column.repeats ?? '') === item.value"
            :class="{ on: (column.repeats ?? '') === item.value }"
            @click="setOptional('repeats', item.value || undefined)"
          >
            {{ item.label }}
          </button>
        </span>
      </div>
      <div v-if="totalled" class="sf-field">
        <label class="sf-label">Total colour</label>
        <ToneSwatches
          :model-value="column.tone"
          @update:model-value="(tone) => setOptional('tone', tone)"
        />
      </div>
      <div v-if="numeric" class="sf-field">
        <label class="sf-label">Total as a formula <span class="sf-optional">optional</span></label>
        <FormulaInput
          :model-value="column.total ?? ''"
          :scope="{ columns: result }"
          expect="number"
          placeholder="gp / sales * 100"
          @update:model-value="(total) => setOptional('total', total.trim() || undefined)"
        />
        <p class="sf-hint">
          Worked out from the other columns' totals, never summed: a percentage or a rate. Used in
          the totals line, group headings and the lines under the totals.
        </p>
      </div>
      <div class="sf-field">
        <label class="sf-label">Band heading <span class="sf-optional">optional</span></label>
        <input
          type="text"
          class="sf-input"
          :list="`bands-${index}`"
          :value="column.band ?? ''"
          placeholder="cur"
          @input="setOptional('band', ($event.target as HTMLInputElement).value.trim() || undefined)"
        />
        <datalist :id="`bands-${index}`">
          <option v-for="name in periodNames" :key="name" :value="name" />
        </datalist>
        <p class="sf-hint">
          A heading over neighbouring columns with the same band. A period's name shows that
          period's heading, such as FY-2026-27 Upto Aug-26.
        </p>
      </div>
      <div class="sf-field">
        <label class="sf-label">Colour from <span class="sf-optional">optional</span></label>
        <PickButton
          :model-value="column.toneBy ?? ''"
          :items="columnItems(result)"
          clearable
          placeholder="None"
          @update:model-value="(toneBy) => setOptional('toneBy', toneBy || undefined)"
        />
        <p class="sf-hint">
          A column holding the cell's colour: success, info, warning, alert or danger, such as
          if(gp &lt; 0, 'danger', null).
        </p>
      </div>
      <div class="sf-field">
        <label class="sf-label">Opens a voucher <span class="sf-optional">optional</span></label>
        <div class="out-drill">
          <PickButton
            :model-value="drillId"
            :items="numericItems"
            clearable
            placeholder="Voucher id column…"
            @update:model-value="setDrillId"
          />
          <template v-if="drillId">
            <span class="desk-muted">of type</span>
            <PickButton
              :model-value="drillType"
              :items="typeItems"
              placeholder="Type column or name…"
              @update:model-value="setDrillType"
            />
          </template>
        </div>
        <p class="sf-hint">
          Enter on a row opens that voucher. The type is a column holding it, or one fixed type.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { reportsHost } from '../host';
import type { Rdl2ColumnFormat, Rdl2OutputColumn } from '../language';
import type { Issue } from './checks';
import FormulaInput from './FormulaInput.vue';
import { formatsFor } from './output';
import PickButton from './PickButton.vue';
import { columnItems, type PickItem } from './pickItems';
import { headingFromName } from './schema';
import StudioIcon from './StudioIcon.vue';
import ToneSwatches from './ToneSwatches.vue';
import { useReportDraftContext } from './useReportDraft';

/** One column of the report. Edits that column in the draft by its place in the list. */
const props = defineProps<{ index: number; issues: readonly Issue[] }>();

const REPEATS = [
  { value: '', label: 'Show it' },
  { value: 'hide', label: 'Leave blank' },
  { value: 'dim', label: 'Show it dimmed' },
] as const;

const draft = useReportDraftContext();
const output = computed(() => draft.report.output);
const column = computed(() => output.value.columns[props.index] ?? null);
const result = computed(() => draft.schemas.value.get(output.value.stage) ?? []);
const numericItems = computed(() =>
  columnItems(result.value.filter((col) => col.type === 'number' || col.type === 'unknown')),
);
const type = computed(
  () => result.value.find((col) => col.name === column.value?.column)?.type ?? 'unknown',
);
const numeric = computed(
  () =>
    ['money', 'qty', 'number', 'percent'].includes(column.value?.format ?? '') ||
    type.value === 'number',
);
/** Names of the periods steps' periods, offered as bands. */
const periodNames = computed(() =>
  draft.report.stages.flatMap((stage) =>
    stage.kind === 'periods'
      ? stage.periods.flatMap((period) =>
          period.repeat
            ? Array.from({ length: period.repeat }, (_unused, at) => `${period.name}${at + 1}`)
            : [period.name],
        )
      : [],
  ),
);
const totalled = computed(() =>
  Boolean(column.value && output.value.totals?.includes(column.value.column)),
);
const drillId = computed(() =>
  column.value?.drill && 'voucher' in column.value.drill
    ? (column.value.drill.voucher?.id ?? '')
    : '',
);
const drillType = computed(() =>
  column.value?.drill && 'voucher' in column.value.drill
    ? (column.value.drill.voucher?.type ?? '')
    : '',
);
const typeItems = computed((): PickItem[] => [
  ...columnItems(result.value.filter((col) => col.type === 'text' || col.type === 'unknown')).map(
    (item) => ({ ...item, group: 'From a column' }),
  ),
  // Fixed types: those with a page to open (the host's record pages).
  ...(reportsHost().recordTypes?.() ?? []).map(({ value, label }) => ({
    value,
    label,
    sub: value,
    group: 'Always this type',
  })),
]);
const moreOpen = ref(
  Boolean(
    column.value &&
      (column.value.quiet ||
        column.value.hidden ||
        column.value.caption ||
        column.value.repeats ||
        column.value.drill ||
        column.value.tone),
  ),
);

function problemAt(path: string): string {
  return (
    props.issues.find((issue) => issue.path === `columns.${props.index}.${path}`)?.message ?? ''
  );
}

function edit(change: (target: Rdl2OutputColumn) => void): void {
  if (column.value) change(column.value);
}

function setOptional<K extends keyof Rdl2OutputColumn>(
  key: K,
  value: Rdl2OutputColumn[K] | undefined,
): void {
  edit((c) => {
    if (value === undefined) delete c[key];
    else c[key] = value;
  });
}

function numberOrNone(raw: string): number | undefined {
  return raw === '' ? undefined : Number(raw);
}

/** A heading that was made from the old column follows the new one; a typed heading stays. */
function setColumn(name: string): void {
  const totalledBefore = totalled.value;
  edit((c) => {
    const old = c.column;
    if (!c.label || c.label === headingFromName(old)) c.label = headingFromName(name);
    c.column = name;
    if (totalledBefore && output.value.totals)
      output.value.totals = output.value.totals.map((col) => (col === old ? name : col));
  });
}

function setFormat(value: string): void {
  setOptional('format', (value || undefined) as Rdl2ColumnFormat | undefined);
}

function setTotalled(on: boolean): void {
  const name = column.value?.column;
  if (!name) return;
  const current = output.value.totals ?? [];
  const next = on
    ? [...current.filter((col) => col !== name), name]
    : current.filter((col) => col !== name);
  if (next.length) output.value.totals = next;
  else delete output.value.totals;
}

function setDrillId(id: string): void {
  setOptional(
    'drill',
    id ? { voucher: { id, type: drillType.value || 'SALES_INVOICE' } } : undefined,
  );
}

function setDrillType(typeName: string): void {
  if (drillId.value) setOptional('drill', { voucher: { id: drillId.value, type: typeName } });
}
</script>
