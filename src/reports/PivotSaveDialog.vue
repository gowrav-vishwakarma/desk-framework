<template>
  <DeskDialog v-model:open="open" panel-class="is-wide" @accept="submit">
    <DeskForm :issues="issues" initial-focus="title" @save="submit">
      <h3>{{ existing ? 'Save pivot' : 'Save as a pivot' }}</h3>
      <p class="desk-muted">
        Keeps this layout and the filter over {{ sourceTitle }}. Opening it later runs
        {{ sourceTitle }} again, working out only the {{ fieldCount }} fields the pivot uses.
      </p>
      <DeskSettingsGrid field-id="pivotSave" :rows="sheet" :read="read" @change="onChange" />
      <p v-if="message" class="desk-error">{{ message }}</p>
      <div class="desk-footer-bar">
        <DeskButton data-form-save-btn :loading="saving" @click="submit"
          >{{ deskKeyLabel('action-form-save') }} Save</DeskButton
        >
        <button data-desk-field="pivot-save-cancel" type="button" @click="open = false">Cancel</button>
      </div>
    </DeskForm>
  </DeskDialog>
</template>

<script setup lang="ts">
import { reportsHost } from './host';
import { computed, ref, watch } from 'vue';
import DeskButton from '../form/DeskButton.vue';
import DeskDialog from '../form/DeskDialog.vue';
import DeskForm from '../form/DeskForm.vue';
import type { DeskIssue } from '../form/issues';
import DeskSettingsGrid from '../grid/DeskSettingsGrid.vue';
import { sectionRows, type DeskSetting } from '../grid/settings';
import { deskKeyLabel } from '../keys/deskKeymap';
import type { Rdl2Menu, Rdl2PivotView } from './language';
import { pivotName } from './studioPivot';
import { savePivot, type PivotListItem } from './studioApi';

/**
 * Save the pivot on screen as a company pivot: its layout and filter over the source report,
 * listed in Report Studio and, when asked, in the Studio Reports menu with the pivot mark.
 */
const open = defineModel<boolean>('open', { required: true });
const props = defineProps<{
  source: { name: string; title: string; category: string; menu?: Rdl2Menu | undefined };
  /** The saved pivot on screen, when it was opened from one: Save updates it. */
  existing: PivotListItem | null;
  /** Names already taken by reports and pivots. */
  taken: ReadonlySet<string>;
  /** Whether the page keeps its rows on this computer now: the starting choice for a new pivot. */
  keep: boolean;
  /** What is saved: the layout and the filter as a saved tab keeps it. */
  layout: () => unknown;
  filter: () => Record<string, unknown>;
  fieldCount: number;
}>();
const emit = defineEmits<{ saved: [result: { name: string; isNew: boolean }] }>();

const values = ref<Record<string, unknown>>({});
const issues = ref<DeskIssue[]>([]);
const message = ref('');
const saving = ref(false);
const sourceTitle = computed(() => props.source.title);

const sheet = computed(() => {
  const fields: DeskSetting[] = [
    { key: 'title', label: 'Title', editor: 'text', required: true },
    { key: 'description', label: 'What it shows', editor: 'text' },
    { key: 'show', label: 'Show in the Studio Reports menu', editor: 'check' },
    { key: 'group', label: 'Menu group (Sales / Monthly nests)', editor: 'text' },
    { key: 'cache', label: 'Keep its data on each computer (opens at once; Reload for fresh data)', editor: 'check' },
  ];
  if (props.existing) fields.push({ key: 'asNew', label: 'Save as a new pivot', editor: 'check' });
  return sectionRows('pivot', 'Pivot', fields);
});

watch(open, (shown) => {
  if (!shown) return;
  const view = props.existing?.definition;
  values.value = {
    title: view?.title ?? `${props.source.title} pivot`,
    description: view?.description ?? '',
    show: view?.menu?.show ?? true,
    group: view?.menu?.group ?? props.source.menu?.group ?? 'Pivots',
    cache: view ? view.cache === true : props.keep,
    asNew: false,
  };
  issues.value = [];
  message.value = '';
});

function read(key: string): unknown {
  return values.value[key];
}

function onChange(key: string, value: unknown): void {
  values.value[key] = value;
  message.value = '';
}

function text(key: string): string {
  const value = values.value[key];
  return typeof value === 'string' ? value.trim() : '';
}

async function submit(): Promise<void> {
  if (saving.value) return;
  const title = text('title');
  issues.value = title ? [] : [{ fieldId: 'title', message: 'Give the pivot a title' }];
  if (!title) return;
  const update = props.existing && values.value.asNew !== true ? props.existing : null;
  const group = text('group');
  const description = text('description');
  const view: Rdl2PivotView = {
    lang: 'rdl2',
    kind: 'pivot',
    name: update ? update.name : pivotName(title, props.taken),
    title,
    ...(description ? { description } : {}),
    category: props.source.category,
    source: props.source.name,
    ...(values.value.cache === true ? { cache: true } : {}),
    filter: props.filter(),
    layout: props.layout(),
    menu: { show: values.value.show === true, ...(group ? { group } : {}) },
  };
  saving.value = true;
  message.value = '';
  try {
    const saved = await savePivot(view, update?.id);
    open.value = false;
    emit('saved', { name: saved.name, isNew: !update });
  } catch (caught) {
    message.value = reportsHost().failure(caught);
  } finally {
    saving.value = false;
  }
}
</script>
