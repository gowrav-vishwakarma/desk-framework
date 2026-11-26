<template>
  <div class="desk-page">
    <DeskPageHeader title="Report Studio">
      <template #actions>
        <button type="button" data-desk-field="report-new" @click="create">New report</button>
      </template>
    </DeskPageHeader>
    <p class="desk-muted">System reports ship with {{ product }}. Copy one into the designer to change it, or start a new report. Company reports and pivots can be deleted from the row menu. Pivots are layouts saved from a report's pivot.</p>
    <p v-if="message" class="desk-error">{{ message }}</p>
    <DeskGrid
      :rows="quick.rows.value"
      mode="list"
      selection="cell"
      soft-cursor
      initial
      field-id="report-list-grid"
      storage-key="desk-cols-report-studio"
      show-filter
      :columns="COLUMNS"
      :loading="loading"
      :row-actions="rowActions"
      @filter="quick.onFilter"
      @open="run"
      @open-page="edit"
      @action="onAction"
    >
      <template #status>{{ countText }} · Enter runs · Ctrl+Enter opens the designer</template>
    </DeskGrid>
  </div>
</template>

<script setup lang="ts">
import { reportsHost, reportsPeriod, useReportsPlace } from './host';
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import DeskGrid from '../grid/DeskGrid.vue';
import { useDeskLocalFilter } from '../grid/localFilter';
import type { DeskColumn, DeskGridRow, DeskRowAction } from '../grid/types';
import { askDeskConfirm } from '../form/confirm';
import DeskPageHeader from '../layout/DeskPageHeader.vue';
import { deleteReport, listPivots, listReports, type PivotListItem } from './studioApi';
import { refreshStudioMenu } from './studioMenu';

const router = useRouter();
const place = useReportsPlace();
const product = reportsHost().product ?? 'the system';

const COLUMNS: DeskColumn[] = [
  { id: 'title', header: 'Report', width: 260, sortable: false },
  { id: 'category', header: 'Category', width: 140, sortable: false },
  { id: 'origin', header: 'Kind', width: 100, sortable: false, format: (value) => (value === 'system' ? 'System' : value === 'pivot' ? 'Pivot' : 'Company') },
  { id: 'description', header: 'What it shows', width: 420, sortable: false, quiet: true },
  { id: 'name', header: 'Name', width: 200, sortable: false, quiet: true },
];

const rows = ref<DeskGridRow[]>([]);
const pivots = ref<PivotListItem[]>([]);
const loading = ref(false);
const message = ref('');

/** The whole list is loaded, so the filter row filters it here, with no request. */
const quick = useDeskLocalFilter(rows, COLUMNS);
const countText = computed(() =>
  quick.active.value ? `${quick.rows.value.length} of ${rows.value.length} reports` : `${rows.value.length} reports`,
);

async function load(): Promise<void> {
  loading.value = true;
  message.value = '';
  try {
    const [reports, pivotList] = await Promise.all([listReports(), listPivots()]);
    pivots.value = pivotList;
    rows.value = [
      ...reports.map((item) => ({ id: item.name, savedId: item.id, name: item.name, title: item.title, category: item.category, origin: item.origin, description: item.description })),
      ...pivotList.map((item) => ({ id: item.name, savedId: item.id, name: item.name, title: item.title, category: item.category, origin: 'pivot', description: item.description })),
    ].sort((a, b) => String(a.category).localeCompare(String(b.category)) || String(a.title).localeCompare(String(b.title)));
  } catch (caught) {
    message.value = reportsHost().failure(caught);
  } finally {
    loading.value = false;
  }
}

function rowActions(row: DeskGridRow): DeskRowAction[] {
  const remove: DeskRowAction = { name: 'delete', label: 'Delete', disabled: false, tone: 'danger', displayMode: 'menu' };
  if (row.origin === 'pivot') return [{ name: 'pivot', label: 'Open pivot', disabled: false }, remove];
  const actions: DeskRowAction[] = [
    { name: 'run', label: 'Run', disabled: false },
    { name: 'pivot', label: 'Pivot', disabled: false },
    { name: 'edit', label: row.origin === 'system' ? 'Copy to designer' : 'Edit', disabled: false },
  ];
  if (row.origin === 'saved') actions.push(remove);
  return actions;
}

/** Enter: a report runs, a saved pivot opens in the pivot. */
function run(row: DeskGridRow): void {
  void router.push(place.path(row.origin === 'pivot' ? 'pivot' : 'run', String(row.name)));
}

function edit(row: DeskGridRow): void {
  if (row.origin === 'pivot') run(row);
  else void router.push(place.path('design', String(row.name)));
}

function create(): void {
  void router.push(place.path('design'));
}

function onAction(payload: { name: string; row: DeskGridRow }): void {
  if (payload.name === 'delete') {
    void remove(payload.row);
    return;
  }
  if (payload.name === 'run') run(payload.row);
  else if (payload.name === 'pivot') void router.push(place.path('pivot', String(payload.row.name)));
  else edit(payload.row);
}

/** Company reports and saved pivots only. A report takes the pivots that use it. */
async function remove(row: DeskGridRow): Promise<void> {
  const id = row.savedId;
  if (typeof id !== 'number') return;
  const title = String(row.title || row.name);
  const over =
    row.origin === 'pivot' ? [] : pivots.value.filter((item) => item.definition.source === row.name).map((item) => item.title);
  const go = await askDeskConfirm({
    title: `Delete ${title}?`,
    message:
      row.origin === 'pivot'
        ? 'This saved pivot is removed. The report it uses stays.'
        : over.length > 0
          ? 'This company report is removed, and these pivots over it.'
          : 'This company report is removed.',
    ...(over.length > 0 ? { details: over } : {}),
    okLabel: 'Delete',
    tone: 'danger',
  });
  if (!go) return;
  loading.value = true;
  message.value = '';
  try {
    await deleteReport(id);
    refreshStudioMenu();
    await load();
  } catch (caught) {
    message.value = reportsHost().failure(caught);
    loading.value = false;
  }
}

onMounted(() => void load());
</script>
