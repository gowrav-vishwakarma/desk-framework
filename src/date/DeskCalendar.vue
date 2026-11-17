<template>
  <div class="desk-calendar" @mousedown.prevent>
    <div class="desk-calendar-head">
      <button type="button" tabindex="-1" @click="emit('shift', -1)">‹</button>
      <strong>{{ label }}</strong>
      <button type="button" tabindex="-1" @click="emit('shift', 1)">›</button>
    </div>
    <div class="desk-calendar-week">
      <span v-for="name in WEEK" :key="name">{{ name }}</span>
    </div>
    <div class="desk-calendar-days">
      <button
        v-for="(cell, index) in cells"
        :key="`${cell.iso}-${index}`"
        type="button"
        tabindex="-1"
        :class="{ out: !cell.inMonth, on: cell.iso === selected, today: cell.iso === today }"
        @click="emit('pick', cell.iso)"
      >
        {{ cell.day }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ymd, type DeskDateParts } from './deskDate';

const WEEK = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const props = defineProps<{
  /** Month on screen. Day is ignored. */
  view: DeskDateParts;
  /** Stored date to highlight, when there is one. */
  selected: string | null;
  today: string;
}>();

const emit = defineEmits<{
  pick: [iso: string];
  shift: [months: number];
}>();

const label = computed(() => `${MONTHS[props.view.m - 1] ?? ''} ${props.view.y}`);

const cells = computed(() => {
  const first = new Date(props.view.y, props.view.m - 1, 1);
  const start = new Date(props.view.y, props.view.m - 1, 1 - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
    const iso = ymd(date.getFullYear(), date.getMonth() + 1, date.getDate());
    return {
      iso,
      day: date.getDate(),
      inMonth: date.getMonth() === props.view.m - 1,
    };
  });
});
</script>
