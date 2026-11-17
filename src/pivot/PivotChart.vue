<template>
  <div class="desk-pivot-chart-wrap">
    <div ref="el" class="desk-pivot-chart" />
    <div v-if="note" class="desk-pivot-chart-note">{{ note }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts';
import type { PivotCube } from './pivotCube';
import type { PivotChartType } from './pivotTypes';
import type { PivotView } from './pivotView';

/** The pivot as it shows: one category per visible row item, one series per column item. */
const props = defineProps<{ view: PivotView; cube: PivotCube; valueLabels: string[]; type: PivotChartType }>();

const MAX_CATEGORIES = 60;
const MAX_SERIES = 24;
const el = ref<HTMLElement | null>(null);
let chart: echarts.ECharts | null = null;
let observer: ResizeObserver | null = null;

const data = computed(() => {
  const rows = props.view.rows.filter((row) => row.kind === 'item' && !(row.canToggle && row.expanded));
  const items = props.view.columns.filter((column) => column.kind === 'item');
  const columns = items.length ? items : props.view.columns;
  const multi = props.valueLabels.length > 1;
  return {
    categories: rows.slice(0, MAX_CATEGORIES).map((row) => row.labels.join(' › ') || row.label),
    series: columns.slice(0, MAX_SERIES).map((column) => ({
      name:
        column.node.depth === 0
          ? (props.valueLabels[column.valueIndex] ?? '')
          : `${column.path.join(' › ')}${multi ? ` · ${props.valueLabels[column.valueIndex] ?? ''}` : ''}`,
      data: rows.slice(0, MAX_CATEGORIES).map((row) => props.cube.shown(row.node, column.node, column.valueIndex) ?? 0),
    })),
    cut: rows.length > MAX_CATEGORIES || columns.length > MAX_SERIES,
  };
});

const note = computed(() => (data.value.cut ? `Chart shows the first ${MAX_CATEGORIES} rows and ${MAX_SERIES} series.` : ''));

function paint(): void {
  if (!el.value) return;
  chart = chart ?? echarts.init(el.value);
  const style = getComputedStyle(el.value);
  const textColor = style.getPropertyValue('--desk-text').trim() || '#212529';
  const line = style.getPropertyValue('--desk-grid-line').trim() || '#ccc';
  const { categories, series } = data.value;
  const legend = { type: 'scroll' as const, top: 0, textStyle: { color: textColor } };
  if (props.type === 'pie') {
    const first = series[0];
    chart.setOption(
      {
        tooltip: { trigger: 'item' },
        legend: { ...legend, orient: 'vertical' as const, left: 0 },
        series: [{ type: 'pie', radius: ['35%', '70%'], name: first?.name ?? '', data: categories.map((name, index) => ({ name, value: first?.data[index] ?? 0 })), label: { color: textColor } }],
      },
      true,
    );
    return;
  }
  chart.setOption(
    {
      tooltip: { trigger: 'axis' },
      legend,
      grid: { left: 8, right: 16, top: 32, bottom: 8, containLabel: true },
      xAxis: { type: 'category', data: categories, axisLabel: { color: textColor, rotate: categories.length > 8 ? 30 : 0 }, axisLine: { lineStyle: { color: line } } },
      yAxis: { type: 'value', axisLabel: { color: textColor }, splitLine: { lineStyle: { color: line } } },
      series: series.map((entry) => ({
        ...entry,
        type: props.type === 'line' ? 'line' : 'bar',
        ...(props.type === 'stacked' ? { stack: 'all' } : {}),
      })),
    },
    true,
  );
}

onMounted(() => {
  paint();
  if (typeof ResizeObserver !== 'undefined' && el.value) {
    observer = new ResizeObserver(() => chart?.resize());
    observer.observe(el.value);
  }
});
watch([data, () => props.type], paint);
onBeforeUnmount(() => {
  observer?.disconnect();
  chart?.dispose();
  chart = null;
});
</script>
