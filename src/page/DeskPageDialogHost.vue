<template>
  <DeskPageDialogEntry v-for="entry in entries" :key="entry.id" :entry="entry" />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount } from 'vue';
import DeskPageDialogEntry from './DeskPageDialogEntry.vue';
import { deskPageEntries, settleAllDeskPages } from './openDeskPage';

/**
 * Draws every page opened with `openDeskPage`. Each host mounts it once beside its confirm host,
 * so a page in a dialog sees the same base URL, workplace and shortcut layers as a routed page.
 */
const entries = computed(() => deskPageEntries());

onBeforeUnmount(settleAllDeskPages);
</script>
