<template>
  <div class="output-editor">
    <section class="ed-section">
      <h3>The report shows</h3>
      <div class="sf-field" :class="{ bad: problemAt('stage') }">
        <label class="sf-label">The rows of step</label>
        <PickButton
          :model-value="output.stage"
          :items="stepItems(report.stages)"
          placeholder="Choose a step…"
          show-sub
          empty="Add a step first"
          @update:model-value="draft.setResult"
        />
        <p v-if="problemAt('stage')" class="sf-problem">
          <StudioIcon name="warn" /> {{ problemAt('stage') }}
        </p>
        <p v-else class="sf-hint">
          Usually the last step. Any step can be shown while you check your work.
        </p>
      </div>
    </section>

    <section class="ed-section">
      <h3>
        Columns <span class="desk-muted">({{ output.columns.length }})</span>
      </h3>
      <div v-if="available.length" class="out-available">
        <span class="desk-muted">Add:</span>
        <button
          v-for="col in available"
          :key="col.name"
          type="button"
          class="out-add-chip"
          :title="`${col.origin} · ${TYPE_WORD[col.type]}`"
          @click="draft.addOutputColumns([col.name])"
        >
          <span :class="`tone-${col.type}`"><StudioIcon :name="TYPE_ICON[col.type]" /></span>
          {{ col.name }}
        </button>
        <button data-desk-field="output-editor-add-all"
          v-if="available.length > 1"
          type="button"
          class="studio-link"
          @click="draft.addOutputColumns(available.map((col) => col.name))"
        >
          Add all {{ available.length }}
        </button>
      </div>
      <p v-if="problemAt('columns')" class="sf-problem">
        <StudioIcon name="warn" /> {{ problemAt('columns') }}
      </p>
      <FoldList
        :items="output.columns"
        :blank="blankColumn"
        :problems="(index) => countUnder(`columns.${index}`)"
        add-label="Add a column"
        empty-text="Pick the columns the report shows from the chips above."
        @update="(columns) => (output.columns = columns)"
      >
        <template #summary="{ item }">
          <span class="out-type" :class="`tone-${typeOf(item.column)}`"
            ><StudioIcon :name="TYPE_ICON[typeOf(item.column)]"
          /></span>
          <strong>{{ item.label || item.column || 'New column' }}</strong>
          <span v-if="item.column && item.label !== headingFromName(item.column)" class="out-col">{{
            item.column
          }}</span>
          <span v-if="item.format" class="in-tag">{{ formatLabel(item.format) }}</span>
          <span v-if="item.hidden" class="in-tag">starts hidden</span>
          <span v-if="item.quiet" class="in-tag">dim</span>
          <span v-if="item.drill" class="in-tag">opens voucher</span>
        </template>
        <template #tools="{ item }">
          <button
            v-if="isNumeric(item)"
            type="button"
            class="studio-icon-btn out-sigma"
            :class="{ on: totals.includes(item.column) }"
            :title="totals.includes(item.column) ? 'Totalled — click to stop' : 'Total this column'"
            @click="toggleTotal(item.column)"
          >
            <StudioIcon name="sigma" />
          </button>
        </template>
        <template #default="{ index }">
          <OutputColumnForm :index="index" :issues="issues" />
        </template>
      </FoldList>
    </section>

    <section class="ed-section">
      <h3>Rows</h3>
      <div class="sf-field" :class="{ bad: countUnder('groups') }">
        <label class="sf-label">Group rows by <span class="sf-optional">optional</span></label>
        <PickChips
          :model-value="groupColumns"
          :items="resultItems"
          add-label="Choose a column"
          @update:model-value="setGroups"
        />
        <p class="sf-hint">Each group gets a heading line with its subtotals.</p>
      </div>
      <div v-if="output.groups?.length" class="sf-field">
        <label class="sf-label"
          >Subtotal in group headings <span class="sf-optional">optional</span></label
        >
        <PickChips
          :model-value="output.groups[0]?.subtotals ?? []"
          :items="numericItems"
          add-label="Same as the totals"
          @update:model-value="setSubtotals"
        />
      </div>
      <div class="sf-field" :class="{ bad: countUnder('sort') }">
        <label class="sf-label">Sort by <span class="sf-optional">optional</span></label>
        <div class="order-list">
          <div v-for="(item, index) in output.sort ?? []" :key="index" class="order-row">
            <span class="order-word desk-muted">{{ index === 0 ? 'By' : 'then' }}</span>
            <PickButton
              compact
              :model-value="item.column"
              :items="resultItems"
              :invalid="countUnder(`sort.${index}`) > 0"
              @update:model-value="(column) => setSort(index, { ...item, column })"
            />
            <button
              type="button"
              class="studio-chip-btn order-dir"
              @click="setSort(index, { ...item, dir: item.dir === 'desc' ? 'asc' : 'desc' })"
            >
              <StudioIcon :name="item.dir === 'desc' ? 'sortDown' : 'sortUp'" />
              {{ item.dir === 'desc' ? 'Descending' : 'Ascending' }}
            </button>
            <button
              type="button"
              class="studio-icon-btn danger"
              title="Remove"
              @click="removeSort(index)"
            >
              <StudioIcon name="close" />
            </button>
          </div>
          <button type="button" class="studio-chip-btn" @click="addSort">
            <StudioIcon name="plus" /> {{ output.sort?.length ? 'Then by' : 'Choose an order' }}
          </button>
        </div>
      </div>
    </section>

    <section class="ed-section">
      <h3>Figures above the report</h3>
      <FoldList
        :items="output.cards ?? []"
        :blank="blankCard"
        :problems="(index) => countUnder(`cards.${index}`)"
        add-label="Add a card"
        empty-text="Cards show a column's total over the whole report, such as total sales."
        @update="setCards"
      >
        <template #summary="{ item }">
          <span class="out-card-swatch" :class="`tone-${item.tone ?? 'info'}`" />
          <strong>{{ item.label || item.column || 'New card' }}</strong>
          <span v-if="item.column" class="out-col">Σ {{ item.column }}</span>
        </template>
        <template #default="{ item, index }">
          <div class="sf-field">
            <label class="sf-label">Total of</label>
            <PickButton
              :model-value="item.column"
              :items="numericItems"
              @update:model-value="
                (column) => setCard(index, { column, label: item.label || headingFromName(column) })
              "
            />
          </div>
          <div class="sf-field">
            <label class="sf-label">Label</label>
            <input
              type="text"
              class="sf-input"
              :value="item.label"
              @input="setCard(index, { label: ($event.target as HTMLInputElement).value })"
            />
          </div>
          <div class="sf-field">
            <label class="sf-label">Colour</label>
            <ToneSwatches
              :model-value="item.tone"
              @update:model-value="(tone) => setCard(index, { tone })"
            />
          </div>
          <div class="sf-field">
            <label class="sf-label">Row <span class="sf-optional">optional</span></label>
            <input
              type="number"
              class="sf-input sf-number"
              min="1"
              :value="item.line ?? ''"
              placeholder="1"
              @input="
                setCard(index, { line: numberOrNone(($event.target as HTMLInputElement).value) })
              "
            />
            <p class="sf-hint">Cards with the same row number sit side by side.</p>
          </div>
        </template>
      </FoldList>
    </section>

    <section class="ed-section">
      <h3>Lines under the totals</h3>
      <FoldList
        :items="output.footers ?? []"
        :blank="blankFooter"
        :problems="(index) => countUnder(`footers.${index}`)"
        add-label="Add a line"
        empty-text="Totals of only some rows under the main totals, such as all but one category."
        @update="setFooters"
      >
        <template #summary="{ item }">
          <strong>{{ item.label || 'New line' }}</strong>
          <span v-if="item.where" class="out-col">where {{ item.where }}</span>
          <span v-if="item.needs" class="in-tag">when @{{ item.needs }} is picked</span>
        </template>
        <template #default="{ item, index }">
          <div class="sf-field">
            <label class="sf-label">Label</label>
            <input
              type="text"
              class="sf-input"
              :value="item.label"
              @input="setFooter(index, { label: ($event.target as HTMLInputElement).value })"
            />
          </div>
          <div class="sf-field">
            <label class="sf-label">Rows it totals <span class="sf-optional">optional</span></label>
            <FormulaInput
              :model-value="item.where ?? ''"
              :scope="{ columns: result }"
              expect="boolean"
              placeholder="not (categoryId in @excludeCategories)"
              @update:model-value="(where) => setFooter(index, { where: where.trim() || undefined })"
            />
          </div>
          <div class="sf-field">
            <label class="sf-label">Only when an input is picked <span class="sf-optional">optional</span></label>
            <PickButton
              :model-value="item.needs ?? ''"
              :items="paramPicks"
              clearable
              placeholder="Always"
              @update:model-value="(needs) => setFooter(index, { needs: needs || undefined })"
            />
          </div>
        </template>
      </FoldList>
    </section>

    <section class="ed-section">
      <h3>Display</h3>
      <div class="sf-field">
        <label class="sf-label">Negative numbers</label>
        <span class="cond-seg sf-seg" role="radiogroup" aria-label="Negative numbers">
          <button
            v-for="item in NEGATIVES"
            :key="item.value"
            type="button"
            role="radio"
            :aria-checked="(output.negatives ?? '') === item.value"
            :class="{ on: (output.negatives ?? '') === item.value }"
            @click="setNegatives(item.value)"
          >
            {{ item.label }}
          </button>
        </span>
      </div>
      <div class="sf-field">
        <label class="sf-label">Zero amounts</label>
        <span class="cond-seg sf-seg" role="radiogroup" aria-label="Zero amounts">
          <button
            v-for="item in ZEROS"
            :key="item.value"
            type="button"
            role="radio"
            :aria-checked="(output.zeros ?? '') === item.value"
            :class="{ on: (output.zeros ?? '') === item.value }"
            @click="setZeros(item.value)"
          >
            {{ item.label }}
          </button>
        </span>
      </div>
      <div class="sf-field">
        <label class="sf-label">Columns worked out</label>
        <span class="cond-seg sf-seg" role="radiogroup" aria-label="Columns worked out">
          <button
            v-for="item in COLUMN_LOADS"
            :key="String(item.value)"
            type="button"
            role="radio"
            :aria-checked="(output.columnsOnDemand === true) === item.value"
            :class="{ on: (output.columnsOnDemand === true) === item.value }"
            @click="setColumnsOnDemand(item.value)"
          >
            {{ item.label }}
          </button>
        </span>
        <p v-if="output.columnsOnDemand" class="sf-hint">
          Only the columns on screen and the fields a pivot uses are worked out: quick for a small
          report, but showing a column or adding a pivot field runs the report again.
        </p>
        <p v-else class="sf-hint">
          Every column comes at once: one wait, then showing columns and changing the pivot need no
          more runs. Best for a costly report.
        </p>
      </div>
      <div v-if="groupColumns.length" class="sf-field" :class="{ bad: problemAt('pageBy') }">
        <label class="sf-label">Each page holds</label>
        <span class="cond-seg sf-seg" role="radiogroup" aria-label="Each page holds">
          <button
            v-for="item in pageByItems"
            :key="item.value"
            type="button"
            role="radio"
            :aria-checked="(output.pageBy ?? '') === item.value"
            :class="{ on: (output.pageBy ?? '') === item.value }"
            @click="setPageBy(item.value)"
          >
            {{ item.label }}
          </button>
        </span>
        <p v-if="problemAt('pageBy')" class="sf-problem">
          <StudioIcon name="warn" /> {{ problemAt('pageBy') }}
        </p>
        <p v-else-if="output.pageBy" class="sf-hint">
          A group is never split across pages: {{ output.pageSize || 100 }} means
          {{ output.pageSize || 100 }} {{ groupWord(output.pageBy) }} groups with all their rows.
        </p>
        <p v-else class="sf-hint">
          The page size counts rows, so a group can carry on to the next page.
        </p>
      </div>
      <div class="sf-field">
        <label class="sf-label"
          >{{ output.pageBy ? 'Groups' : 'Rows' }} per page
          <span class="sf-optional">optional</span></label
        >
        <input
          type="number"
          class="sf-input sf-number"
          min="0"
          :value="output.pageSize ?? ''"
          placeholder="100"
          @input="setPageSize(($event.target as HTMLInputElement).value)"
        />
        <p class="sf-hint">0 shows every row on one page.</p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Rdl2Card, Rdl2OutputColumn } from '../language';
import { AT_OUTPUT } from './checks';
import FoldList from './FoldList.vue';
import FormulaInput from './FormulaInput.vue';
import { FORMATS } from './output';
import OutputColumnForm from './OutputColumnForm.vue';
import PickButton from './PickButton.vue';
import PickChips from './PickChips.vue';
import { columnItems, stepItems, TYPE_ICON, TYPE_WORD } from './pickItems';
import { headingFromName } from './schema';
import StudioIcon from './StudioIcon.vue';
import ToneSwatches from './ToneSwatches.vue';
import { useReportDraftContext } from './useReportDraft';

/** What the report shows: its step, columns, totals, cards, grouping, order and display. Edits the draft. */
const draft = useReportDraftContext();
const report = draft.report;
/** Read through the report each time: undo replaces the output object. */
const output = computed(() => report.output);

const NEGATIVES = [
  { value: '', label: '-1,234' },
  { value: 'brackets', label: '(1,234)' },
] as const;

type Footer = NonNullable<typeof report.output.footers>[number];
/** Inputs a line under the totals can wait for. */
const paramPicks = computed(() =>
  report.params.filter((param) => param.id).map((param) => ({ value: param.id, label: param.label || param.id, sub: `@${param.id}` })),
);

function blankFooter(): Footer {
  return { label: '' };
}

function setFooters(footers: Footer[]): void {
  if (footers.length) output.value.footers = footers;
  else delete output.value.footers;
}

/** Settings to change on a line; `undefined` clears one. */
type FooterPatch = { [K in keyof Footer]?: Footer[K] | undefined };

function setFooter(index: number, change: FooterPatch): void {
  setFooters(
    (output.value.footers ?? []).map((footer, at) => {
      if (at !== index) return footer;
      const next = { ...footer, ...change } as Record<string, unknown>;
      for (const [key, value] of Object.entries(change)) if (value === undefined) delete next[key];
      return next as unknown as Footer;
    }),
  );
}

const COLUMN_LOADS = [
  { value: false, label: 'All at once' },
  { value: true, label: 'Only those shown' },
] as const;

function setColumnsOnDemand(on: boolean): void {
  if (on) output.value.columnsOnDemand = true;
  else delete output.value.columnsOnDemand;
}

function setNegatives(value: '' | 'brackets'): void {
  if (value) output.value.negatives = value;
  else delete output.value.negatives;
}

const ZEROS = [
  { value: '', label: 'Show them' },
  { value: 'dim', label: 'Faint' },
  { value: 'hide', label: 'Leave empty' },
] as const;

const issues = computed(() => draft.issues.value.filter((issue) => issue.at === AT_OUTPUT));
const result = computed(() => draft.schemas.value.get(output.value.stage) ?? []);
const resultItems = computed(() => columnItems(result.value));
const numericItems = computed(() =>
  columnItems(result.value.filter((col) => col.type === 'number' || col.type === 'unknown')),
);
const available = computed(() =>
  result.value.filter((col) => !output.value.columns.some((shown) => shown.column === col.name)),
);
const totals = computed(() => output.value.totals ?? []);
const groupColumns = computed(() => (output.value.groups ?? []).map((group) => group.column));

function problemAt(path: string): string {
  return issues.value.find((issue) => issue.path === path)?.message ?? '';
}

function countUnder(prefix: string): number {
  return issues.value.filter(
    (issue) => issue.path === prefix || issue.path?.startsWith(`${prefix}.`),
  ).length;
}

function typeOf(column: string) {
  return result.value.find((col) => col.name === column)?.type ?? 'unknown';
}

function isNumeric(column: Rdl2OutputColumn): boolean {
  return (
    ['money', 'qty', 'number', 'percent'].includes(column.format ?? '') ||
    typeOf(column.column) === 'number'
  );
}

function formatLabel(format: string): string {
  return FORMATS.find((item) => item.value === format)?.label ?? format;
}

function toggleTotal(column: string): void {
  const next = totals.value.includes(column)
    ? totals.value.filter((col) => col !== column)
    : [...totals.value, column];
  if (next.length) output.value.totals = next;
  else delete output.value.totals;
}

function setGroups(columns: string[]): void {
  const kept = new Map((output.value.groups ?? []).map((group) => [group.column, group]));
  if (columns.length) output.value.groups = columns.map((column) => kept.get(column) ?? { column });
  else delete output.value.groups;
  // Pages can only be cut on a group the report still has.
  if (output.value.pageBy && !columns.includes(output.value.pageBy)) delete output.value.pageBy;
}

/** A group column as people read it: its heading in the report. */
function groupWord(column: string): string {
  return (
    output.value.columns.find((col) => col.column === column)?.label || headingFromName(column)
  );
}

const pageByItems = computed(() => [
  { value: '', label: 'Rows' },
  ...groupColumns.value.map((column) => ({ value: column, label: `Whole ${groupWord(column)} groups` })),
]);

function setPageBy(column: string): void {
  if (column) output.value.pageBy = column;
  else delete output.value.pageBy;
}

function setSubtotals(columns: string[]): void {
  const [first, ...rest] = output.value.groups ?? [];
  if (!first) return;
  const { subtotals: _old, ...plain } = first;
  output.value.groups = [columns.length ? { ...plain, subtotals: columns } : plain, ...rest];
}

function setSort(index: number, item: { column: string; dir?: 'asc' | 'desc' }): void {
  output.value.sort = (output.value.sort ?? []).map((current, at) =>
    at === index ? item : current,
  );
}

function addSort(): void {
  output.value.sort = [...(output.value.sort ?? []), { column: '', dir: 'asc' }];
}

function removeSort(index: number): void {
  const next = (output.value.sort ?? []).filter((_item, at) => at !== index);
  if (next.length) output.value.sort = next;
  else delete output.value.sort;
}

function setCards(cards: Rdl2Card[]): void {
  if (cards.length) output.value.cards = cards;
  else delete output.value.cards;
}

function blankColumn(): Rdl2OutputColumn {
  return { column: '', label: '' };
}

function blankCard(): Rdl2Card {
  return { column: '', label: '' };
}

/** Settings to change on a card; `undefined` clears one. */
type CardPatch = { [K in keyof Rdl2Card]?: Rdl2Card[K] | undefined };

function setCard(index: number, change: CardPatch): void {
  setCards(
    (output.value.cards ?? []).map((card, at) => {
      if (at !== index) return card;
      const next = { ...card, ...change } as Record<string, unknown>;
      for (const [key, value] of Object.entries(change)) if (value === undefined) delete next[key];
      return next as unknown as Rdl2Card;
    }),
  );
}

function numberOrNone(raw: string): number | undefined {
  return raw === '' ? undefined : Number(raw);
}

function setZeros(value: '' | 'dim' | 'hide'): void {
  if (value) output.value.zeros = value;
  else delete output.value.zeros;
}

function setPageSize(raw: string): void {
  if (raw === '') delete output.value.pageSize;
  else output.value.pageSize = Math.max(0, Math.floor(Number(raw)));
}
</script>
