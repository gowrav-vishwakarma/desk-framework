<template>
  <div class="desk-page">
    <DeskPageHeader :title="item?.title ?? 'Report'">
      <template #actions>
        <button v-if="item" type="button" data-desk-field="report-edit" @click="edit">{{ item.origin === 'system' ? 'Copy to designer' : 'Edit' }}</button>
        <button v-if="item" type="button" data-desk-field="report-pivot" @click="pivot">Pivot</button>
        <button type="button" data-desk-field="report-list" @click="toList">All reports</button>
      </template>
    </DeskPageHeader>
    <p v-if="message" class="desk-error">{{ message }}</p>
    <ReportView v-if="item" :key="item.name" :report="item.definition" :initial="initial" />
  </div>
</template>

<script setup lang="ts">
import { reportsHost, reportsPeriod, useReportsPlace } from './host';
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import DeskPageHeader from '../layout/DeskPageHeader.vue';
import ReportView from './ReportView.vue';
import { findReport, type ReportListItem } from './studioApi';

const route = useRoute();
const router = useRouter();
const place = useReportsPlace();
const item = ref<ReportListItem | null>(null);
const message = ref('');

const name = computed(() => String(route.params.name ?? ''));
/** Parameter values a drill-down passed in the URL. */
const initial = computed((): Record<string, unknown> | null => {
  const raw = route.query.p;
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
});

watch(
  name,
  async (next) => {
    item.value = null;
    message.value = '';
    try {
      item.value = await findReport(next);
      if (!item.value) message.value = `No report is named "${next}"`;
    } catch (caught) {
      message.value = reportsHost().failure(caught);
    }
  },
  { immediate: true },
);

function edit(): void {
  void router.push(place.path('design', name.value));
}

function pivot(): void {
  void router.push(place.path('pivot', name.value));
}

function toList(): void {
  void router.push(place.path('list'));
}
</script>
