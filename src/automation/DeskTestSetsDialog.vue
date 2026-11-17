<template>
  <DeskDialog v-model:open="deskTestSetsOpen" name="test-sets" panel-class="desk-test-sets">
    <h3>Test sets</h3>
    <p class="desk-muted">Named states for the settings, rows and layouts a test needs. Dev only.</p>
    <p v-if="names.length === 0" class="desk-muted">No sets are loaded. Register them with <code>__desk.sets.register</code>.</p>
    <ul class="desk-test-sets-list">
      <li v-for="name in names" :key="name">
        <strong>{{ name }}</strong>
        <button type="button" :data-desk-field="`set-diff:${name}`" @click="run(name, 'diff')">What differs</button>
        <button type="button" :data-desk-field="`set-apply:${name}`" @click="run(name, 'apply')">Apply</button>
      </li>
    </ul>
    <pre v-if="output" class="desk-test-sets-out">{{ output }}</pre>
    <footer class="desk-dialog-actions">
      <button type="button" data-desk-field="set-close" @click="deskTestSetsOpen = false">Close</button>
    </footer>
  </DeskDialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import DeskDialog from '../form/DeskDialog.vue';
import { deskTestSetsOpen } from './testSets';

/** Apply or compare a named test set by hand. The Playwright client does the same through `__desk.sets`. */
const output = ref('');
const driver = () => (window as unknown as { __desk?: { sets: { library: () => string[]; apply: (name: string) => Promise<unknown>; diff: (name: string) => Promise<unknown> } } }).__desk;
const names = computed(() => (deskTestSetsOpen.value ? (driver()?.sets.library() ?? []) : []));

async function run(name: string, what: 'apply' | 'diff'): Promise<void> {
  const sets = driver()?.sets;
  if (!sets) return;
  output.value = JSON.stringify(await sets[what](name), null, 2);
}
</script>
