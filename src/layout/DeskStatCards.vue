<template>
  <div v-if="lines.length" class="desk-stat-cards">
    <div v-for="line in lines" :key="line.line" class="desk-stat-line">
      <div v-for="card in line.cards" :key="card.id" class="desk-stat-card" :class="card.tone ? `is-${card.tone}` : ''">
        <span class="desk-stat-label">{{ card.label }}</span>
        <span class="desk-stat-value">{{ card.value }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { DeskStatCard } from './statCards';

/**
 * Figures above a report: totals, aging buckets. Each line of cards shares the width equally.
 * Display only: the cards take no focus, so keys go on to the grid below.
 */
const props = defineProps<{ cards: readonly DeskStatCard[] }>();

const lines = computed(() => {
  const byLine = new Map<number, DeskStatCard[]>();
  for (const card of props.cards) {
    const line = card.line ?? 1;
    byLine.set(line, [...(byLine.get(line) ?? []), card]);
  }
  return [...byLine.entries()].sort(([a], [b]) => a - b).map(([line, cards]) => ({ line, cards }));
});
</script>

<style scoped>
.desk-stat-cards {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0 0 6px;
}
.desk-stat-line {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  gap: 4px;
}
.desk-stat-card {
  --tone: var(--desk-muted);
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 3px 10px;
  border: 1px solid var(--desk-grid-line);
  border-left: 3px solid var(--tone);
  background: var(--desk-row-bg);
  color: var(--desk-text);
}
.desk-stat-card.is-success {
  --tone: var(--desk-tone-success);
}
.desk-stat-card.is-info {
  --tone: var(--desk-tone-info);
}
.desk-stat-card.is-warning {
  --tone: var(--desk-tone-warning);
}
.desk-stat-card.is-alert {
  --tone: var(--desk-tone-alert);
}
.desk-stat-card.is-danger {
  --tone: var(--desk-tone-danger);
}
.desk-stat-card[class*='is-'] {
  background: color-mix(in srgb, var(--tone) 10%, var(--desk-row-bg));
}
.desk-stat-label {
  font-size: 0.75rem;
  color: var(--desk-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.desk-stat-value {
  font-size: 1.05rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
/* Narrow screens: cards wrap instead of squeezing. */
@media (max-width: 700px) {
  .desk-stat-line {
    grid-auto-flow: row;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  }
}
</style>
