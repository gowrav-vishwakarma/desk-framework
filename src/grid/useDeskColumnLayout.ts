import { computed, ref, watch, type Ref } from 'vue';
import { readDeskPrefOrLocal, writeDeskPref } from '../storage/deskPrefs';
import {
  DESK_COLUMN_MIN_WIDTH,
  defaultTextLayoutForColumn,
  effectiveColumnWidth,
  mergeColumnWidths,
  mergeMiddleOrder,
  mergeTextLayouts,
  moveMiddleColumnOrder,
  partitionColumnLayout,
  type DeskColumnPin,
} from './deskColumnLayout';
import type { DeskColumn, DeskColumnTextLayout } from './types';

function prefWidthsKey(storageKey: string): string {
  return `grid-widths:${storageKey}`;
}

function prefOrderKey(storageKey: string): string {
  return `grid-order:${storageKey}`;
}

function prefTextLayoutKey(storageKey: string): string {
  return `grid-text-layout:${storageKey}`;
}

export function useDeskColumnLayout(options: {
  columns: Ref<DeskColumn[]>;
  storageKey: Ref<string>;
}) {
  const widths = ref<Record<string, number>>({});
  const middleOrder = ref<string[]>(mergeMiddleOrder(options.columns.value, []));
  const textLayouts = ref<Record<string, DeskColumnTextLayout>>(mergeTextLayouts(options.columns.value, {}));

  const layoutColumns = computed(() => partitionColumnLayout(options.columns.value, middleOrder.value));

  watch(
    () => options.columns.value,
    (columns) => {
      middleOrder.value = mergeMiddleOrder(columns, middleOrder.value);
      widths.value = mergeColumnWidths(columns, widths.value);
      textLayouts.value = mergeTextLayouts(columns, textLayouts.value);
    },
    { deep: true },
  );

  function effectiveWidth(id: string): number {
    const column = options.columns.value.find((item) => item.id === id)
      ?? layoutColumns.value.find((item) => item.id === id);
    return effectiveColumnWidth(column, widths.value);
  }

  function setWidth(id: string, px: number): void {
    const width = Math.max(DESK_COLUMN_MIN_WIDTH, Math.round(px));
    widths.value = { ...widths.value, [id]: width };
    const key = options.storageKey.value.trim();
    if (key) void writeDeskPref(prefWidthsKey(key), widths.value);
  }

  function effectiveTextLayout(id: string): DeskColumnTextLayout {
    const saved = textLayouts.value[id];
    if (saved) return saved;
    const column = options.columns.value.find((item) => item.id === id);
    if (column?.textLayoutMenu) return defaultTextLayoutForColumn(column);
    return 'ellipsis-end';
  }

  function setTextLayout(id: string, layout: DeskColumnTextLayout): void {
    const column = options.columns.value.find((item) => item.id === id);
    if (!column?.textLayoutMenu) return;
    textLayouts.value = { ...textLayouts.value, [id]: layout };
    const key = options.storageKey.value.trim();
    if (key) void writeDeskPref(prefTextLayoutKey(key), textLayouts.value);
  }

  function moveColumn(dragId: string, beforeId: string | null): boolean {
    const next = moveMiddleColumnOrder(options.columns.value, middleOrder.value, dragId, beforeId);
    if (!next) return false;
    middleOrder.value = next;
    const key = options.storageKey.value.trim();
    if (key) void writeDeskPref(prefOrderKey(key), middleOrder.value);
    return true;
  }

  function pinOf(id: string): DeskColumnPin | undefined {
    const column = options.columns.value.find((item) => item.id === id);
    if (!column) return undefined;
    if (column.pin === 'start' || column.pin === 'end') return column.pin;
    return undefined;
  }

  async function loadPrefs(): Promise<void> {
    const key = options.storageKey.value.trim();
    if (!key) return;
    const [savedWidths, savedOrder, savedTextLayouts] = await Promise.all([
      readDeskPrefOrLocal<Record<string, number>>(prefWidthsKey(key), key),
      readDeskPrefOrLocal<string[]>(prefOrderKey(key), `${key}-order`),
      readDeskPrefOrLocal<Record<string, DeskColumnTextLayout>>(prefTextLayoutKey(key), `${key}-text-layout`),
    ]);
    widths.value = mergeColumnWidths(options.columns.value, savedWidths);
    middleOrder.value = mergeMiddleOrder(options.columns.value, savedOrder);
    textLayouts.value = mergeTextLayouts(options.columns.value, savedTextLayouts);
  }

  return {
    layoutColumns,
    widths,
    middleOrder,
    textLayouts,
    effectiveWidth,
    effectiveTextLayout,
    setWidth,
    setTextLayout,
    moveColumn,
    pinOf,
    loadPrefs,
  };
}
