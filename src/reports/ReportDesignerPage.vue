<template>
  <div ref="rootEl" class="desk-page studio-page" @keydown="onKeys">
    <DeskPageHeader title="Report designer">
      <template #actions>
        <component :is="assistant" v-if="assistant" />
        <button
          type="button"
          class="studio-icon-btn"
          title="Undo (Ctrl+Z)"
          :disabled="!draft.canUndo.value"
          @click="draft.undo"
        >
          <StudioIcon name="undo" />
        </button>
        <button
          type="button"
          class="studio-icon-btn"
          title="Redo (Ctrl+Shift+Z)"
          :disabled="!draft.canRedo.value"
          @click="draft.redo"
        >
          <StudioIcon name="redo" />
        </button>
        <button
          ref="problemsButton"
          type="button"
          class="studio-health"
          :class="problemCount ? 'bad' : 'good'"
          :title="problemCount ? 'Show what to fix' : 'Nothing to fix'"
          @click="problemsOpen = problemCount > 0 && !problemsOpen"
        >
          <StudioIcon :name="problemCount ? 'warn' : 'ok'" />
          {{ problemCount ? `${problemCount} to fix` : 'Ready' }}
        </button>
        <button
          type="button"
          class="studio-btn"
          :disabled="!runnable"
          title="Run the report with its inputs, as users will see it"
          data-desk-field="studio-try"
          @click="tryOpen = true"
        >
          <StudioIcon name="play" /> Try it
        </button>
        <DeskButton data-desk-field="studio-save" :action="save">Save</DeskButton>
        <button
          ref="moreButton"
          type="button"
          class="studio-icon-btn"
          title="More"
          @click="moreOpen = !moreOpen"
        >
          <StudioIcon name="more" />
        </button>
        <button type="button" class="studio-btn" data-desk-field="studio-close" @click="close">
          Close
        </button>
        <input
          ref="fileInput"
          type="file"
          accept="application/json,.json"
          hidden
          @change="importJson"
        />
      </template>
      <template v-if="message" #meta>
        <span :class="{ 'desk-error': !ok }">{{ message }}</span>
      </template>
    </DeskPageHeader>

    <!-- The host's assistant panel (`ReportsHost.assistant`, an AI) docks here, beside studio-main. -->
    <div class="studio-work">
      <div class="studio-main">
        <div class="studio-titlebar">
          <input
            v-model="draft.report.title"
            type="text"
            class="studio-title"
            aria-label="Report title"
            data-desk-field="studio-title"
            placeholder="Name the report"
          />
          <span class="desk-muted">
            {{
              saveId
                ? `Saved as ${draft.report.name}`
                : `Saves as ${draft.report.name || nameFromTitle(draft.report.title) || '…'}`
            }}{{ origin === 'system' ? ' · a copy of a system report' : '' }}
          </span>
          <span v-if="draft.dirty.value" class="studio-unsaved">Unsaved changes</span>
        </div>

        <div class="studio-body" :class="{ narrow: !railOpen }">
          <aside class="studio-rail">
            <button
              type="button"
              class="studio-rail-toggle"
              :title="railOpen ? 'Fold the steps' : 'Show the steps'"
              @click="railOpen = !railOpen"
            >
              <StudioIcon :name="railOpen ? 'left' : 'right'" />
            </button>
            <FlowRail v-show="railOpen" :counts="counts" @preview="previewStep" />
          </aside>
          <main class="studio-editor">
            <InputsEditor v-if="draft.selected.value === AT_INPUTS" />
            <OutputEditor v-else-if="draft.selected.value === AT_OUTPUT" />
            <StepEditor v-else-if="draft.selectedStage.value" :stage="draft.selectedStage.value" />
            <div v-else class="studio-start">
              <h2>Build a report in steps</h2>
              <p class="desk-muted">
                Read records, then narrow, calculate and total them. Each step shows its rows below
                as you go.
              </p>
              <button type="button" class="studio-btn primary" @click="draft.addStep('source')">
                <StudioIcon name="source" /> Read some records
              </button>
              <button type="button" class="studio-btn" @click="startOpen = true">
                Or start from a system report
              </button>
            </div>
          </main>
        </div>

        <PreviewPanel ref="preview" @go="goTo" @count="(stage, rows) => (counts[stage] = rows)" />
      </div>
    </div>

    <StudioPopup v-model:open="problemsOpen" :anchor="problemsButton" :width="420">
      <ul class="studio-problems">
        <li v-for="issue in draft.issues.value" :key="`${issue.at}|${issue.path}|${issue.message}`">
          <button type="button" class="studio-problem" @click="goTo(issue)">
            <strong>{{ placeOf(issue.at) }}</strong> {{ issue.message }}
          </button>
        </li>
      </ul>
    </StudioPopup>

    <StudioPopup v-model:open="moreOpen" :anchor="moreButton" :width="260">
      <div class="studio-menu">
        <button type="button" @click="openStart">
          <StudioIcon name="copy" /> Start from a system report…
        </button>
        <button type="button" @click="startBlank">
          <StudioIcon name="plus" /> Start a blank report
        </button>
        <button type="button" data-desk-field="studio-import" @click="fileInput?.click()">
          <StudioIcon name="down" /> Import a report file
        </button>
        <button type="button" data-desk-field="studio-export" @click="exportJson">
          <StudioIcon name="up" /> Export as a file
        </button>
        <button v-if="canDelete" type="button" class="is-danger" data-desk-field="studio-delete" @click="removeSaved">
          <StudioIcon name="close" /> Delete this report
        </button>
      </div>
    </StudioPopup>

    <DeskDialog v-model:open="startOpen" panel-class="is-wide">
      <h3>Start from a system report</h3>
      <p class="desk-muted">The designer opens a copy; the system report stays as it is.</p>
      <div class="studio-start-list">
        <PickList
          :items="systemItems"
          placeholder="Search reports"
          empty="Loading reports…"
          @pick="startFrom"
        />
      </div>
    </DeskDialog>

    <DeskDialog v-model:open="tryOpen" panel-class="is-full">
      <div class="studio-try">
        <header class="studio-try-head">
          <h3>{{ draft.report.title }}</h3>
          <span class="desk-muted">The unsaved design, run as users will see it</span>
          <button type="button" class="studio-btn" @click="tryOpen = false">
            Back to the designer
          </button>
        </header>
        <ReportView v-if="tryOpen" :report="draft.report" draft />
      </div>
    </DeskDialog>
  </div>
</template>

<script setup lang="ts">
import { reportsHost, reportsPeriod, useReportsPlace } from './host';
import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useDeskAutomationNode } from '../automation/registry';
import { draftState, runClientTool } from './designer/draftTools';
import { testReportRun } from './designer/testRun';
import DeskButton from '../form/DeskButton.vue';
import DeskDialog from '../form/DeskDialog.vue';
import { askDeskConfirm } from '../form/confirm';
import { useDeskDirty } from '../form/leaveGuard';
import { isEditableTarget } from '../keys/combo';
import { useDeskLayer } from '../keys/useDeskLayer';
import DeskPageHeader from '../layout/DeskPageHeader.vue';
import { AT_INPUTS, AT_OUTPUT, AT_REPORT, type Issue } from './designer/checks';
import FlowRail from './designer/FlowRail.vue';
import InputsEditor from './designer/InputsEditor.vue';
import OutputEditor from './designer/OutputEditor.vue';
import type { PickItem } from './designer/pickItems';
import PickList from './designer/PickList.vue';
import PreviewPanel from './designer/PreviewPanel.vue';
import StepEditor from './designer/StepEditor.vue';
import { blankReport } from './designer/steps';
import StudioIcon from './designer/StudioIcon.vue';
import StudioPopup from './designer/StudioPopup.vue';
import { provideReportDraft } from './designer/useReportDraft';
import type { Rdl2Report } from './language';
import ReportView from './ReportView.vue';
import { deleteReport, listPivots, listReports, loadReportCatalog, saveReport, type ReportListItem } from './studioApi';
import { refreshStudioMenu } from './studioMenu';
import './designer/designer.css';

const route = useRoute();
const router = useRouter();
const place = useReportsPlace();
const draft = provideReportDraft();
/** The host's assistant (an AI panel), beside the designer's actions. */
const assistant = reportsHost().assistant;
const rootEl = ref<HTMLElement | null>(null);

// The open report as an agent reads and changes it: the same tools the designer's own AI uses.
useDeskAutomationNode({
  kind: 'reportDraft',
  name: 'report',
  el: () => rootEl.value,
  read: () => ({ ...draftState(draft), problemCount: problemCount.value, origin: origin.value }),
  brief: () => ({ dirty: draft.dirty.value, issues: draft.issues.value.length, title: draft.report.title }),
  ops: () => ({
    rd_read_draft: { description: 'Read the open report definition, its problems and which step is selected', run: () => runClientTool(draft, 'rd_read_draft', {}, testRun) },
    rd_apply_report: {
      description: 'Put a complete RDL2 definition into the designer as a new report (one undo step), then run it. ok=false means it does not work yet: fix the cause named and apply again.',
      args: { definition: { type: 'object' } },
      run: (args) => runClientTool(draft, 'rd_apply_report', { definition: args.definition }, testRun),
    },
    undo: { description: 'Undo the last change', run: () => draft.undo() },
    redo: { description: 'Redo', run: () => draft.redo() },
    try: { description: 'Run the report with its starting inputs and return the first rows', run: () => testRun(JSON.parse(JSON.stringify(draft.report)) as Rdl2Report) },
    save: { description: 'Save the report (the user must ask for this)', run: async () => ({ ok: await save() }) },
  }),
});

function testRun(report: Rdl2Report) {
  return testReportRun(report, reportsPeriod(place));
}

const origin = ref<'new' | 'system' | 'saved'>('new');
const savedId = ref<number | undefined>(undefined);
const message = ref('');
const ok = ref(true);
const systemReports = ref<ReportListItem[]>([]);
/** Rows each step had in its last preview, for the step cards. */
const counts = reactive<Record<string, number>>({});

const railOpen = ref(true);
const problemsOpen = ref(false);
const moreOpen = ref(false);
const startOpen = ref(false);
const tryOpen = ref(false);
const problemsButton = ref<HTMLButtonElement | null>(null);
const moreButton = ref<HTMLButtonElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const preview = ref<{ run: () => Promise<void> } | null>(null);

/** The saved report Save updates; none once the name is cleared (the AI's changes are a new report). */
const saveId = computed(() => (draft.report.name ? savedId.value : undefined));
const problemCount = computed(() => draft.issues.value.length);
const runnable = computed(
  () =>
    draft.report.stages.length > 0 &&
    Boolean(draft.report.output.stage) &&
    draft.report.output.columns.length > 0,
);
const canDelete = computed(() => origin.value === 'saved' && savedId.value != null);
const systemItems = computed((): PickItem[] =>
  systemReports.value.map((item) => ({
    value: item.name,
    label: item.title,
    sub: item.category,
    group: item.category || 'Reports',
    hint: item.description,
  })),
);

// Leaving with unsaved changes asks first, and offers to save.
useDeskDirty(
  () => draft.dirty.value,
  () => save,
);
useDeskLayer({
  handlers: {
    'action-save': () => void save(),
    'action-form-save': () => void save(),
  },
});

function say(text: string, good = true): void {
  message.value = text;
  ok.value = good;
}

function placeOf(at: string): string {
  if (at === AT_INPUTS) return 'Inputs';
  if (at === AT_OUTPUT) return 'Output';
  if (at === AT_REPORT) return 'Report';
  return `Step ${at}`;
}

/** Open the place a problem is in and put the cursor on its setting. */
async function goTo(issue: Pick<Issue, 'at'> & { path?: string }): Promise<void> {
  problemsOpen.value = false;
  draft.selected.value = issue.at === AT_REPORT ? AT_INPUTS : issue.at;
  if (!issue.path) return;
  await nextTick();
  await nextTick();
  const field = document.querySelector<HTMLElement>(`[data-desk-field="studio-${issue.path}"]`);
  field?.scrollIntoView({ block: 'center' });
  field?.focus();
}

function previewStep(id: string): void {
  draft.selected.value = id;
  void nextTick(() => preview.value?.run());
}

/** Undo and redo outside text boxes (inside them the box's own undo works); Ctrl+Enter runs the preview. */
function onKeys(event: KeyboardEvent): void {
  const mod = event.ctrlKey || event.metaKey;
  if (!mod) return;
  const key = event.key.toLowerCase();
  if (key === 'enter') {
    void preview.value?.run();
  } else if (isEditableTarget(event.target)) {
    return;
  } else if (key === 'z' && !event.shiftKey) {
    draft.undo();
  } else if ((key === 'z' && event.shiftKey) || key === 'y') {
    draft.redo();
  } else return;
  event.preventDefault();
}

/** The report's link name from its title: "Account Movement 2" → `account-movement-2`. */
function nameFromTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80);
}

async function save(): Promise<boolean> {
  const first = draft.issues.value[0];
  if (first) {
    say(
      `Fix ${problemCount.value === 1 ? 'the problem' : `the ${problemCount.value} problems`} before saving; the first one is open`,
      false,
    );
    await goTo(first);
    return false;
  }
  const report = draft.report;
  // A new report takes its name from the title unless one was given.
  if (!report.name) report.name = nameFromTitle(report.title);
  if (report.name.length < 3) {
    say('Give the report a title of at least 3 letters', false);
    return false;
  }
  try {
    const saved = await saveReport(JSON.parse(JSON.stringify(report)) as Rdl2Report, saveId.value);
    savedId.value = saved.id;
    origin.value = 'saved';
    draft.markSaved();
    // The Studio Reports menu reads the saved list; show the change at once.
    refreshStudioMenu();
    say('Saved');
    if (route.params.name !== saved.name)
      void router.replace(place.path('design', saved.name));
    return true;
  } catch (caught) {
    say(reportsHost().failure(caught), false);
    return false;
  }
}

/** Replacing the design asks first when there are unsaved changes. Undo also brings it back. */
async function replaceDesign(next: Rdl2Report, what: string): Promise<boolean> {
  if (draft.dirty.value) {
    const go = await askDeskConfirm({
      title: `${what}?`,
      message: 'The changes not saved yet are replaced. Undo brings them back.',
      okLabel: what,
    });
    if (!go) return false;
  }
  draft.load(next, false);
  savedId.value = undefined;
  origin.value = 'new';
  return true;
}

function openStart(): void {
  moreOpen.value = false;
  startOpen.value = true;
}

async function startFrom(name: string): Promise<void> {
  startOpen.value = false;
  const item = systemReports.value.find((report) => report.name === name);
  if (!item) return;
  if (
    await replaceDesign(
      { ...item.definition, name: '', title: `${item.definition.title} (copy)` },
      'Start from this report',
    )
  ) {
    origin.value = 'system';
    say(`Started from ${item.title}`);
  }
}

async function startBlank(): Promise<void> {
  moreOpen.value = false;
  if (await replaceDesign(blankReport(), 'Start a blank report')) say('');
}

function exportJson(): void {
  moreOpen.value = false;
  const blob = new Blob([JSON.stringify(draft.report, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${draft.report.name || nameFromTitle(draft.report.title) || 'report'}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function importJson(event: Event): void {
  moreOpen.value = false;
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  void file.text().then(async (text) => {
    try {
      const parsed = JSON.parse(text) as Rdl2Report;
      if (parsed.lang !== 'rdl2') throw new Error('This file is not a report made in the studio');
      if (await replaceDesign(parsed, 'Import this report'))
        say(`Imported ${parsed.title}. Save to keep it.`);
    } catch (caught) {
      say(caught instanceof Error ? caught.message : 'Could not read the file', false);
    }
  });
}

function close(): void {
  void router.push(place.path('list'));
}

/** A saved company report. System reports are copies here and are not deleted. */
async function removeSaved(): Promise<void> {
  moreOpen.value = false;
  const id = savedId.value;
  if (id == null) return;
  let over: string[] = [];
  try {
    const pivots = await listPivots();
    over = pivots.filter((item) => item.definition.source === draft.report.name).map((item) => item.title);
  } catch (caught) {
    say(reportsHost().failure(caught), false);
    return;
  }
  const go = await askDeskConfirm({
    title: `Delete ${draft.report.title || 'this report'}?`,
    message: over.length > 0 ? 'This company report is removed, and these pivots over it.' : 'This company report is removed.',
    ...(over.length > 0 ? { details: over } : {}),
    okLabel: 'Delete',
    tone: 'danger',
  });
  if (!go) return;
  try {
    await deleteReport(id);
    draft.markSaved();
    refreshStudioMenu();
    void router.push(place.path('list'));
  } catch (caught) {
    say(reportsHost().failure(caught), false);
  }
}

onMounted(async () => {
  try {
    const [catalog, reports] = await Promise.all([loadReportCatalog(), listReports()]);
    draft.models.value = catalog.models;
    draft.functions.value = catalog.functions ?? [];
    systemReports.value = reports.filter((item) => item.origin === 'system');
    const name = typeof route.params.name === 'string' ? route.params.name : '';
    const item = name ? reports.find((report) => report.name === name) : null;
    if (item?.origin === 'saved') {
      draft.load(item.definition);
      savedId.value = item.id;
      origin.value = 'saved';
    } else if (item) {
      // A system report is never changed in place: the designer works on a copy.
      draft.load({ ...item.definition, name: '', title: `${item.definition.title} (copy)` });
      origin.value = 'system';
    } else if (name) {
      say(`No report is named "${name}"`, false);
    }
  } catch (caught) {
    say(reportsHost().failure(caught), false);
  }
});
</script>
