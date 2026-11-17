<template>
  <DeskDialog v-if="view" v-model:open="open" :name="pageName" page panel-class="is-page" :confirm-close="askDeskLeave" @close="settleDeskPage(entry.id, null)">
    <header v-if="entry.spec.title" class="desk-sheet-head">
      <h3>{{ entry.spec.title }}</h3>
      <button type="button" class="desk-sheet-close" aria-label="Close" @click="closeAsk">×</button>
    </header>
    <component :is="view" />
  </DeskDialog>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, type Component } from 'vue';
import DeskDialog from '../form/DeskDialog.vue';
import { askDeskLeave, pushDeskDirty } from '../form/leaveGuard';
import { settleDeskPage, shapeDeskPageResult, type DeskPageEntry } from './openDeskPage';
import { provideDeskPageFrame } from './pageContext';

/**
 * One open page. The page is loaded before the dialog shows, so the dialog opens with the
 * page already mounted and focus lands on the page's first field.
 */
const props = defineProps<{ entry: DeskPageEntry }>();

const open = ref(true);
const pageName = props.entry.spec.title ? props.entry.spec.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') : `page-${props.entry.id}`;
const view = shallowRef<Component | null>(null);

function asComponent(loaded: Component | { default: Component }): Component {
  return typeof loaded === 'object' && 'default' in loaded ? loaded.default : (loaded as Component);
}

function closeAsk(): void {
  void askDeskLeave().then((ok) => {
    if (ok) settleDeskPage(props.entry.id, null);
  });
}

// The page registers its own check above this one. A page that has none still answers for itself,
// so closing it never asks about the page underneath.
onBeforeUnmount(pushDeskDirty(() => false));

provideDeskPageFrame({
  params: props.entry.spec.params ?? {},
  close: closeAsk,
  saved: (payload) => settleDeskPage(props.entry.id, shapeDeskPageResult(props.entry.spec.result, payload)),
});

onMounted(async () => {
  try {
    view.value = asComponent(await props.entry.spec.page());
  } catch {
    settleDeskPage(props.entry.id, null);
  }
});
</script>
