<template>
  <DeskGridLayoutTabs :layouts="layouts.layouts.value" :active="layouts.active.value" :live="layouts.live.value" @select="layouts.select" @pin="layouts.togglePin" />
  <DeskGridLayoutNote :note="layouts.note.value" />
  <DeskGrid
    :key="layouts.gridStorageKey.value"
    :ref="bindGrid"
    v-model:rows="rows"
    mode="list"
    show-filter
    :storage-key="layouts.gridStorageKey.value"
    :columns="layouts.columns.value"
    v-bind="gridPaging"
    :sort-column="layouts.sortColumn.value"
    :sort-descending="layouts.sortDescending.value"
    :filter-values="layouts.filterValues.value"
    :row-actions="layouts.hideActions.value ? undefined : rowActions"
    :layout-designer="layouts.menu.value"
    @open="emit('open', $event)"
    @edit-record="emit('editRecord', $event)"
    @filter="layouts.onFilter"
    @sort="layouts.onSort"
    @action="emit('action', $event)"
    @update:hidden="layouts.onHidden"
    @layout="designer.onCommand"
  />
  <DeskGridDesigner
    v-if="designer.open.value"
    :open="designer.open.value"
    :layout="designer.draft.value"
    :catalog="layouts.catalog.value"
    :formatters="layouts.formatters.value"
    :samples="rows.slice(0, 3)"
    :list-key="layouts.storageKey"
    :all-layouts="layouts.layouts.value"
    :is-new="designer.isNew.value"
    @update:open="designer.setOpen"
    @save="designer.onSave"
    @delete="designer.onDelete"
    @import-all="designer.onImportAll"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import DeskGrid from '../DeskGrid.vue';
import DeskGridDesigner from './DeskGridDesigner.vue';
import DeskGridLayoutTabs from './DeskGridLayoutTabs.vue';
import DeskGridLayoutNote from './DeskGridLayoutNote.vue';
import type { useDeskGridDesigner } from './useDeskGridDesigner';
import type { DeskGridLayoutsApi } from './useDeskGridLayouts';
import type { DeskGridApi, DeskGridRow, DeskRowAction } from '../types';
import type { DeskGridPagingBind } from '../pageSize';

defineProps<{
  layouts: DeskGridLayoutsApi;
  designer: ReturnType<typeof useDeskGridDesigner>;
  gridPaging: DeskGridPagingBind;
  rowActions: (row: DeskGridRow) => DeskRowAction[];
}>();

const rows = defineModel<DeskGridRow[]>('rows', { required: true });

const emit = defineEmits<{
  open: [row: DeskGridRow];
  editRecord: [row: DeskGridRow];
  action: [payload: { name: string; row: DeskGridRow }];
}>();

const grid = ref<DeskGridApi | null>(null);

function bindGrid(el: unknown): void {
  grid.value = (el as DeskGridApi | null) ?? null;
}

defineExpose({ currentRow: (): DeskGridRow | null => grid.value?.currentRow() ?? null });
</script>
