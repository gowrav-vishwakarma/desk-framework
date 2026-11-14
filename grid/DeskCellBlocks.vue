<template>
  <template v-for="(block, blockIndex) in blocks" :key="blockIndex">
    <span v-if="block.kind === 'text'" class="desk-cell-value">{{ block.text }}</span>
    <span v-else-if="block.kind === 'line'" class="desk-cell-line desk-cell-value" :class="{ 'has-place': block.spans.some((span) => span.place === 'right') }">
      <span v-for="(span, spanIndex) in block.spans" :key="spanIndex" :class="spanClass(span)" :style="spanStyle(span)">{{ span.text }}</span>
    </span>
    <table v-else class="desk-cell-table">
      <thead><tr><th v-for="(head, headIndex) in block.headers" :key="headIndex">{{ head }}</th></tr></thead>
      <tbody>
        <tr v-for="(cells, rowIndex) in block.rows" :key="rowIndex"><td v-for="(cell, cellIndex) in cells" :key="cellIndex">{{ cell }}</td></tr>
      </tbody>
      <caption v-if="block.more > 0">+{{ block.more }} more</caption>
    </table>
  </template>
</template>

<script setup lang="ts">
import { spanClass, spanStyle } from './layout/compile';
import type { DeskCellBlock } from './types';

/** The lines of a layout cell: plain text, styled spans, or a small table. */
defineProps<{ blocks: readonly DeskCellBlock[] }>();
</script>
