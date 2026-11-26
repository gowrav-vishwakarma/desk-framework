<template>
  <div class="desk-page">
    <DeskPageHeader :title="pageTitle">
      <template #actions>
        <label v-if="item" class="desk-pivot-keep" title="Open with the rows kept on this computer; Reload fetches fresh ones">
          <input type="checkbox" data-desk-field="pivot-keep" :checked="keep" @change="setKeep(!keep)" /> Keep data on this computer
        </label>
        <DeskButton data-desk-field="pivot-load" :action="reload">Reload</DeskButton>
        <button v-if="item" type="button" data-desk-field="pivot-save" @click="saving = true">{{ view ? 'Save pivot' : 'Save as pivot' }}</button>
        <button v-if="item" type="button" @click="toReport">Open report</button>
        <button v-if="view" type="button" class="desk-pivot-delete" data-desk-field="pivot-delete" @click="removeView">Delete pivot</button>
      </template>
      <template v-if="message || keptAt" #meta>
        <span>{{ message }}</span>
        <span v-if="keptAt" class="desk-pivot-kept" title="Reload fetches fresh rows">Kept on this computer · fetched {{ keptAt }}</span>
      </template>
    </DeskPageHeader>
    <p v-if="truncated" class="desk-error desk-pivot-capped" role="alert">
      Only the first {{ facts.length.toLocaleString() }} of {{ groupCount.toLocaleString() }} totals were loaded, so the figures below are incomplete. Narrow the filter, or take a field out of the layout.
    </p>
    <template v-if="item && spec">
      <DeskFilterPanel v-model:values="values" :spec="spec" :shortcut="true" @apply="load(false)" />
      <div class="desk-busy-host">
        <PivotDesigner
          :fields="fields"
          :facts="facts"
          :grouped="loadedKeys"
          :storage-key="storageKey"
          :defaults="defaults"
          :start="start"
          :remember="!view"
          :file-name="`${view?.name ?? item.name}-pivot`"
          @layout="onLayout"
          @drill="onDrill"
        />
        <DeskBusy :active="loading" :label="progress" />
      </div>
      <section v-if="drillRows.length" class="desk-pivot-drill">
        <header>
          <strong>{{ drillTitle }}</strong>
          <span>{{ drillNote }}</span>
          <button data-desk-field="report-pivot-close" type="button" @click="drillRows = []">Close</button>
        </header>
        <DeskGrid name="pivot-drill" v-model:rows="drillRows" mode="list" :columns="factColumns" />
      </section>
      <PivotSaveDialog
        v-model:open="saving"
        :source="{ name: item.name, title: item.title, category: item.category, menu: item.definition.menu }"
        :existing="view"
        :taken="taken"
        :keep="keep"
        :layout="() => layout"
        :filter="() => (spec ? freezeDeskFilter(spec, values) : {})"
        :field-count="loaded ? summaryColumns(loaded).length : 0"
        @saved="onSaved"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { reportsHost, reportsPeriod, useReportsPlace } from './host';
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import DeskFilterPanel from '../filter/DeskFilterPanel.vue';
import { freezeDeskFilter, thawDeskFilter } from '../filter/saved';
import type { DeskFilterSpec, DeskFilterValues } from '../filter/types';
import DeskButton from '../form/DeskButton.vue';
import { askDeskConfirm } from '../form/confirm';
import DeskGrid from '../grid/DeskGrid.vue';
import type { DeskColumn, DeskGridRow } from '../grid/types';
import DeskPageHeader from '../layout/DeskPageHeader.vue';
import DeskBusy from '../layout/DeskBusy.vue';
import PivotDesigner from '../pivot/PivotDesigner.vue';
import { normalizePivotLayout } from '../pivot/pivotLayout';
import type { PivotField, PivotLayout } from '../pivot/pivotTypes';
import { readDeskData, removeDeskData, writeDeskData } from '../storage/deskDataCache';
import { readDeskPref, writeDeskPref } from '../storage/deskPrefs';
import PivotSaveDialog from './PivotSaveDialog.vue';
import { deleteReport, findPivot, findReport, listPivots, listReports, runPivotRows, type PivotListItem, type ReportListItem } from './studioApi';
import { formatStudioValue, studioColumns } from './studioColumns';
import { studioDefaults, studioFilterSpec, studioParams } from './studioFilter';
import { refreshStudioMenu } from './studioMenu';
import { pivotSummary, pivotSummaryAll, summaryColumns, summaryCovers } from './studioPivot';
import type { Rdl2ColumnFormat, Rdl2RunSummary } from './language';

/**
 * A pivot over any report, or a saved pivot (a layout and filter over one). The report's inputs
 * are the filter and its output columns the fields. The server groups the rows by the layout's
 * fields (a summary run) and sends them in batches; the pivot only adds groups up. A layout that
 * needs a field the rows do not carry loads again. With "Keep data on this computer" the rows are
 * kept in IndexedDB per company, report and inputs: the page opens with them, and Reload fetches
 * fresh ones.
 */
const route = useRoute();
const router = useRouter();
const place = useReportsPlace();

/** What is kept on this computer for one report and its inputs. */
interface KeptRows {
  summary: Rdl2RunSummary;
  rows: Record<string, unknown>[];
  count: number;
  truncated: boolean;
}

/** The report whose rows the pivot sums. */
const item = ref<ReportListItem | null>(null);
/** The saved pivot, when the page opened one. */
const view = ref<PivotListItem | null>(null);
const spec = shallowRef<DeskFilterSpec<DeskFilterValues> | null>(null);
const values = ref<DeskFilterValues>({});
const facts = shallowRef<Record<string, unknown>[]>([]);
/** How the loaded rows are grouped; null before the first load. */
const loaded = shallowRef<Rdl2RunSummary | null>(null);
const groupCount = ref(0);
const truncated = ref(false);
/** When the rows on screen were fetched, if they came from this computer. */
const keptAt = ref('');
const keep = ref(false);
const layout = shallowRef<PivotLayout | null>(null);
const drillRows = ref<DeskGridRow[]>([]);
const drillTitle = ref('');
const drillNote = ref('');
const message = ref('');
const progress = ref('Loading…');
const loading = ref(false);
const saving = ref(false);
const taken = shallowRef<ReadonlySet<string>>(new Set());

const DRILL_MAX = 1000;
/** A layout change waits this long, so a few quick changes load once. */
const LOAD_DELAY = 300;
const NUMERIC = new Set<Rdl2ColumnFormat>(['money', 'qty', 'number', 'percent']);
const isNumeric = (format: Rdl2ColumnFormat | undefined) => format !== undefined && NUMERIC.has(format);

const pageTitle = computed(() => (view.value ? view.value.title : item.value ? `${item.value.title} · pivot` : 'Pivot'));
const storageKey = computed(() => (view.value ? `desk-pivot-view-${view.value.name}` : `desk-pivot-report-${item.value?.name ?? ''}`));
const reportColumns = computed(() => (item.value?.definition.output.columns ?? []).map((column) => column.column));
const loadedKeys = computed(() => loaded.value?.keys.map((key) => key.column));

const fields = computed<PivotField[]>(() =>
  (item.value?.definition.output.columns ?? []).map((column) => ({
    id: column.column,
    label: column.label || column.column,
    kind: isNumeric(column.format) ? 'number' : column.format === 'date' || column.format === 'datetime' ? 'date' : 'text',
    format: (value: unknown) => formatStudioValue(value, column.format),
  })),
);

/** A saved pivot opens with its layout. */
const start = computed(() => (view.value && fields.value.length ? (normalizePivotLayout(view.value.definition.layout, fields.value) ?? undefined) : undefined));

/** Without a saved pivot: the first shown text column down the side and the report's first total. */
const defaults = computed(() => {
  const output = item.value?.definition.output;
  if (!output) return undefined;
  const shown = output.columns.filter((column) => !column.hidden);
  const row = shown.find((column) => !column.format || column.format === 'text');
  const value = output.totals?.[0] ?? shown.find((column) => column.format === 'money')?.column ?? shown.find((column) => isNumeric(column.format))?.column;
  return { rows: row ? [row.column] : [], values: value ? [value] : [] };
});

/**
 * What to load: with `columnsOnDemand`, the fields the layout uses (a new one loads again);
 * otherwise every column at once, so no layout change loads again.
 */
const wanted = computed(() => {
  if (!layout.value || !item.value) return null;
  const needs = pivotSummary(layout.value, reportColumns.value);
  const output = item.value.definition.output;
  return output.columnsOnDemand === true ? needs : pivotSummaryAll(output.columns, needs);
});

/** The grouped rows behind a figure: their keys and totals, and how many rows each stands for. */
const factColumns = computed((): DeskColumn[] => {
  if (!item.value || !loaded.value) return [];
  const carried = new Set(summaryColumns(loaded.value));
  return [
    ...studioColumns(item.value.definition).filter((column) => carried.has(column.id)),
    { id: '__rows', header: 'Rows', width: 80, sortable: false, align: 'right', format: (value) => Number(value).toLocaleString() },
  ];
});

function period(): { yearStart: string; today: string } {
  return reportsPeriod(place);
}

watch(
  () => String(route.params.name ?? ''),
  async (name) => {
    item.value = null;
    view.value = null;
    spec.value = null;
    facts.value = [];
    loaded.value = null;
    layout.value = null;
    truncated.value = false;
    keptAt.value = '';
    drillRows.value = [];
    message.value = '';
    try {
      const [reports, pivots] = await Promise.all([listReports(), listPivots()]);
      taken.value = new Set([...reports, ...pivots].map((entry) => entry.name));
      const savedPivot = await findPivot(name);
      const sourceName = savedPivot ? savedPivot.definition.source : name;
      const found = await findReport(sourceName);
      if (!found) {
        message.value = savedPivot ? `The report "${sourceName}" this pivot is over is gone` : `No report is named "${name}"`;
        return;
      }
      const defaultValues = () => studioDefaults(found.definition, period());
      // A saved pivot's description leads the filter sentence, in bold.
      const filterSpec = studioFilterSpec(found.definition, { defaults: defaultValues, period, ...(place.lookup ? { lookup: (preset: string) => place.lookup!(preset) } : {}), heading: () => view.value?.description ?? '' });
      // A saved pivot's choice, unless this user changed it here.
      const keepKey = `pivot-keep:${savedPivot ? `desk-pivot-view-${savedPivot.name}` : `desk-pivot-report-${found.name}`}`;
      const chosen = await readDeskPref<boolean>(keepKey);
      keep.value = typeof chosen === 'boolean' ? chosen : savedPivot?.definition.cache === true;
      spec.value = filterSpec;
      // A saved pivot's filter keeps a period by its name, so it opens on this year's dates.
      values.value = savedPivot ? thawDeskFilter(filterSpec, savedPivot.definition.filter) : defaultValues();
      view.value = savedPivot;
      item.value = found;
    } catch (caught) {
      message.value = reportsHost().failure(caught);
    }
  },
  { immediate: true },
);

let pending: ReturnType<typeof setTimeout> | null = null;
function cancelPending(): void {
  if (pending) clearTimeout(pending);
  pending = null;
}
onBeforeUnmount(cancelPending);

/** The layout changed: load again when the rows on screen cannot give it. */
function onLayout(next: PivotLayout): void {
  layout.value = next;
  if (!wanted.value || summaryCovers(loaded.value, wanted.value)) return;
  cancelPending();
  pending = setTimeout(() => {
    pending = null;
    void load(false);
  }, LOAD_DELAY);
}

/** Where this report's rows for these inputs are kept. */
function keptKey(): string | null {
  const report = item.value?.definition;
  if (!report) return null;
  return `pivot-rows|${reportsHost().companyKey()}|${report.name}|${JSON.stringify(studioParams(report, values.value))}`;
}

function show(rows: KeptRows, fetchedAt: number | null): void {
  const report = item.value!.definition;
  const numeric = new Set(report.output.columns.filter((column) => isNumeric(column.format)).map((column) => column.column));
  // Sums and counts arrive as text from the database.
  facts.value = rows.rows.map((row) => {
    const out: Record<string, unknown> = { ...row, __rows: Number(row.__rows) || 0 };
    for (const [key, value] of Object.entries(row)) {
      if (numeric.has(key) || key.endsWith('__n') || key.endsWith('__min') || key.endsWith('__max')) out[key] = value === null ? null : Number(value);
    }
    return out;
  });
  loaded.value = rows.summary;
  groupCount.value = rows.count;
  truncated.value = rows.truncated;
  keptAt.value = fetchedAt === null ? '' : new Date(fetchedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  drillRows.value = [];
  const reportRows = facts.value.reduce((total, row) => total + (Number(row.__rows) || 0), 0);
  // The server sends one total per combination of the pivot's fields, not every row.
  message.value = `${reportRows.toLocaleString()} report rows · added up into ${rows.count.toLocaleString()} totals for the pivot · ${summaryColumns(rows.summary).length} of ${reportColumns.value.length} fields used`;
}

/**
 * Rows for the layout: the ones kept on this computer when they can give it (unless `fresh`),
 * else from the server, grouped, in batches; then kept when the user asked.
 */
async function load(fresh: boolean): Promise<boolean> {
  cancelPending();
  const report = item.value?.definition;
  const summary = wanted.value;
  const key = keptKey();
  if (!report || !summary || !key) return false;
  if (!summary.keys.length && !summary.values.length) {
    facts.value = [];
    loaded.value = summary;
    message.value = 'Add fields to the pivot to load rows';
    return true;
  }
  if (keep.value && !fresh) {
    const kept = await readDeskData<KeptRows>(key);
    if (kept && summaryCovers(kept.value.summary, summary)) {
      show(kept.value, kept.savedAt);
      return true;
    }
  }
  loading.value = true;
  progress.value = 'Loading…';
  message.value = 'Loading…';
  try {
    const result = await runPivotRows({ name: report.name, params: studioParams(report, values.value), summary }, (done, total) => {
      progress.value = total > done ? `Loading ${done.toLocaleString()} of ${total.toLocaleString()} totals…` : 'Loading…';
    });
    const rows: KeptRows = { summary, rows: result.rows, count: result.count, truncated: result.truncated };
    show(rows, null);
    if (keep.value) void writeDeskData(key, rows);
    // The layout may have moved on while the rows loaded.
    if (wanted.value && !summaryCovers(loaded.value, wanted.value)) void load(true);
    return true;
  } catch (caught) {
    message.value = reportsHost().failure(caught);
    return false;
  } finally {
    loading.value = false;
  }
}

function reload(): Promise<boolean> {
  return load(true);
}

/** Keep the rows on this computer, or stop and forget them. */
async function setKeep(next: boolean): Promise<void> {
  keep.value = next;
  await writeDeskPref(`pivot-keep:${storageKey.value}`, next);
  const key = keptKey();
  if (!key) return;
  if (!next) {
    keptAt.value = '';
    await removeDeskData(key);
  } else if (loaded.value && facts.value.length) {
    await writeDeskData(key, { summary: loaded.value, rows: facts.value, count: groupCount.value, truncated: truncated.value } satisfies KeptRows);
  }
}

function onDrill(payload: { facts: Record<string, unknown>[]; title: string }): void {
  drillTitle.value = payload.title;
  const rows = payload.facts.reduce((total, fact) => total + (Number(fact.__rows) || 0), 0);
  const shown = payload.facts.length > DRILL_MAX ? `first ${DRILL_MAX} of ${payload.facts.length.toLocaleString()} totals` : `${payload.facts.length.toLocaleString()} totals`;
  drillNote.value = `${shown} · ${rows.toLocaleString()} report rows (open the report for each line)`;
  drillRows.value = payload.facts.slice(0, DRILL_MAX).map((fact, index) => ({ ...fact, id: index }));
}

function onSaved(result: { name: string; isNew: boolean }): void {
  refreshStudioMenu();
  if (result.isNew) {
    void router.push(place.path('pivot', result.name));
    return;
  }
  // Saved over itself: read it again, so the page has what was stored.
  void findPivot(result.name).then((saved) => {
    if (saved) view.value = saved;
  });
}

function toReport(): void {
  if (item.value) void router.push(place.path('run', item.value.name));
}

/** A saved pivot. The report it uses stays. */
async function removeView(): Promise<void> {
  const saved = view.value;
  if (!saved) return;
  const go = await askDeskConfirm({
    title: `Delete ${saved.title}?`,
    message: 'This saved pivot is removed. The report it uses stays.',
    okLabel: 'Delete',
    tone: 'danger',
  });
  if (!go) return;
  try {
    await deleteReport(saved.id);
    refreshStudioMenu();
    void router.push(place.path('list'));
  } catch (caught) {
    message.value = reportsHost().failure(caught);
  }
}
</script>

<style scoped>
.desk-pivot-capped {
  margin: 0 0 6px;
  padding: 6px 10px;
  border: 1px solid var(--desk-tone-danger);
  border-left-width: 4px;
  background: color-mix(in srgb, var(--desk-tone-danger) 10%, transparent);
  font-weight: 600;
}
/* On the header's line under the title, at the right: under the Reload button. */
.desk-pivot-kept {
  margin-left: auto;
  color: var(--desk-muted);
  font-size: 0.82rem;
}
.desk-pivot-delete {
  color: var(--desk-danger);
}
.desk-pivot-keep {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}
.desk-pivot-drill {
  display: flex;
  flex-direction: column;
  height: 240px;
  flex-shrink: 0;
  gap: 4px;
}
.desk-pivot-drill > header {
  display: flex;
  align-items: center;
  gap: 8px;
}
.desk-pivot-drill > header > span {
  color: var(--desk-muted);
}
.desk-pivot-drill > header > button {
  margin-left: auto;
}
</style>
