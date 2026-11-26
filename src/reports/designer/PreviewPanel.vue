<template>
  <section
    class="preview"
    :class="{ collapsed: !open }"
    :style="open ? { height: `${height}px` } : undefined"
  >
    <div v-if="open" class="preview-grip" title="Drag to resize" @pointerdown="startResize" />
    <header class="preview-head">
      <button
        type="button"
        class="studio-icon-btn"
        :title="open ? 'Hide the preview' : 'Show the preview'"
        @click="open = !open"
      >
        <StudioIcon :name="open ? 'down' : 'up'" />
      </button>
      <strong>Preview</strong>
      <span v-if="target" class="desk-muted"
        >of <code>{{ target }}</code
        >{{ wholeReport ? ' (the report)' : '' }}</span
      >
      <span class="preview-status" :class="status.tone">
        <StudioIcon v-if="status.tone === 'bad'" name="warn" />
        <StudioIcon v-else-if="status.tone === 'good'" name="ok" />
        {{ status.text }}
      </span>
      <span class="preview-spacer" />
      <span class="preview-inputs desk-muted" :title="inputsTitle">{{ inputsLine }}</span>
      <label class="preview-auto" title="Run again a moment after each change"
        ><input v-model="auto" type="checkbox" /> Auto</label
      >
      <button data-desk-field="preview-panel-run"
        type="button"
        class="studio-btn primary"
        :disabled="!target || running"
        title="Run this step (Ctrl+Enter)"
        @click="run"
      >
        <StudioIcon name="play" /> Run
      </button>
    </header>

    <div v-if="open" class="preview-body">
      <DeskBusy :active="running" label="Running…" />
      <div v-if="blocking.length" class="preview-block">
        <p>
          <StudioIcon name="warn" /> Fix {{ blocking.length === 1 ? 'this' : 'these' }} first, then
          it runs:
        </p>
        <ul>
          <li
            v-for="issue in blocking.slice(0, 6)"
            :key="`${issue.at}|${issue.path}|${issue.message}`"
          >
            <button type="button" class="studio-link" @click="emit('go', issue)">
              {{ placeOf(issue) }}</button
            >: {{ issue.message }}
          </li>
        </ul>
      </div>
      <div v-else-if="error" class="preview-error">
        <p>
          <StudioIcon name="warn" />
          <template v-if="error.stage"
            >In step <code>{{ error.stage }}</code
            >: </template
          >{{ error.message }}
        </p>
        <button
          v-if="error.stage && error.stage !== draft.selected.value"
          type="button"
          class="studio-btn"
          @click="emit('go', { at: error.stage, message: error.message })"
        >
          Go to step {{ error.stage }}
        </button>
      </div>
      <p v-else-if="!rows.length && !running && ran" class="desk-muted preview-empty">
        No rows. Check the conditions and the inputs' values above.
      </p>
      <p v-else-if="!rows.length && !running" class="desk-muted preview-empty">
        Press Run to see this step's first rows.
      </p>
      <DeskGrid
        name="report-preview"
        v-if="rows.length && !blocking.length && !error"
        v-model:rows="rows"
        mode="report"
        :columns="columns"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { reportsHost, reportsPeriod, useReportsPlace } from '../host';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import DeskGrid from '../../grid/DeskGrid.vue';
import DeskBusy from '../../layout/DeskBusy.vue';
import type { DeskColumn, DeskGridRow } from '../../grid/types';
import type { Rdl2ColumnFormat, Rdl2Report, Rdl2RunResult } from '../language';
import { runReport } from '../studioApi';
import { formatStudioValue } from '../studioColumns';
import { studioDefaults, studioParams } from '../studioFilter';
import { AT_INPUTS, AT_OUTPUT, AT_REPORT, type Issue } from './checks';
import StudioIcon from './StudioIcon.vue';
import { useReportDraftContext } from './useReportDraft';

/**
 * The selected step's first rows, run on the server with the inputs' defaults. It runs again a
 * moment after a change; problems the browser already sees are listed instead of running, and a
 * server error names the step it came from.
 */
const emit = defineEmits<{
  go: [issue: Pick<Issue, 'at' | 'message'> & { path?: string }];
  count: [stage: string, rows: number];
}>();

const draft = useReportDraftContext();
const LIMIT = 50;
const AUTO_MS = 900;

const open = ref(true);
const auto = ref(true);
const height = ref(280);
const rows = ref<DeskGridRow[]>([]);
const columns = ref<DeskColumn[]>([]);
const ran = ref(false);
const message = ref('');
const error = ref<{ message: string; stage?: string } | null>(null);

/** What runs: the selected step; with the inputs or output open, the whole report. */
const wholeReport = computed(
  () => draft.selected.value === AT_INPUTS || draft.selected.value === AT_OUTPUT,
);
const target = computed(() =>
  wholeReport.value ? draft.report.output.stage : (draft.selectedStage.value?.id ?? ''),
);

/** Problems that stop this run: inputs, and the steps it is worked out from. */
const blocking = computed((): Issue[] => {
  const id = target.value;
  if (!id) return [];
  const upTo = draft.report.stages.findIndex((stage) => stage.id === id);
  const steps = new Set(draft.report.stages.slice(0, upTo + 1).map((stage) => stage.id));
  return draft.issues.value.filter(
    (issue) =>
      issue.at === AT_INPUTS ||
      steps.has(issue.at) ||
      (wholeReport.value && issue.at === AT_OUTPUT),
  );
});

const place = useReportsPlace();
const period = () => reportsPeriod(place);

const params = computed(() => studioParams(draft.report, studioDefaults(draft.report, period())));

/** An input's starting value in words: a date as dates show, several picks as a count. */
function shownValue(type: string, value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  if (Array.isArray(value)) return value.length ? `${value.length} picked` : '';
  if (type === 'date') return formatStudioValue(value, 'date');
  if (type === 'boolean') return value === true ? 'yes' : 'no';
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

const inputsLine = computed(() => {
  const shown = draft.report.params.flatMap((param) => {
    const value = shownValue(param.type, params.value[param.id]);
    return value ? [`${param.label || param.id} ${value}`] : [];
  });
  return shown.length ? `With ${shown.join(', ')}` : 'With the inputs empty';
});
const inputsTitle =
  'The preview uses each input\'s starting value. Use "Try it" to run with other values.';

const status = computed((): { text: string; tone: string } => {
  if (running.value) return { text: 'Running…', tone: '' };
  if (blocking.value.length) return { text: `${blocking.value.length} to fix`, tone: 'bad' };
  if (error.value) return { text: 'Failed', tone: 'bad' };
  return { text: message.value, tone: message.value ? 'good' : '' };
});

function placeOf(issue: Issue): string {
  if (issue.at === AT_INPUTS) return 'Inputs';
  if (issue.at === AT_OUTPUT) return 'Output';
  if (issue.at === AT_REPORT) return 'Report';
  return `Step ${issue.at}`;
}

/** Number and date columns of the step drawn as such, from the types the designer worked out. */
function columnsOf(
  names: { name: string; label: string; format?: Rdl2ColumnFormat }[],
): DeskColumn[] {
  const types = new Map(
    (draft.schemas.value.get(target.value) ?? []).map((col) => [col.name, col.type]),
  );
  return names.map((col) => {
    const type = types.get(col.name);
    const format: Rdl2ColumnFormat | undefined =
      col.format ??
      (type === 'date'
        ? 'date'
        : type === 'boolean'
          ? 'boolean'
          : type === 'number'
            ? 'number'
            : undefined);
    const numeric =
      format === 'money' || format === 'qty' || format === 'number' || format === 'percent';
    return {
      id: col.name,
      header: col.label,
      width: numeric ? 110 : 140,
      sortable: false,
      align: numeric ? 'right' : 'left',
      format: (value) => formatStudioValue(value, format),
    };
  });
}

/** A server error that names a step (`items: has no column "x"`) is shown at that step. */
function errorOf(text: string): { message: string; stage?: string } {
  const match = /^([A-Za-z_]\w*): (.+)$/s.exec(text);
  if (match && draft.report.stages.some((stage) => stage.id === match[1]))
    return { stage: match[1]!, message: match[2]! };
  return { message: text };
}

// ------------------------------------------------------------------ kept previews
/**
 * What a run depends on: the target, the steps up to it, the inputs and their values and, for the
 * whole report, the output. The same key gives the same rows, so its answer is kept and shown
 * again without a request; only a change that touches the key runs it again.
 */
const runKey = computed(() => {
  const id = target.value;
  const upTo = draft.report.stages.findIndex((stage) => stage.id === id);
  return JSON.stringify([
    id,
    draft.report.params,
    params.value,
    draft.report.stages.slice(0, upTo + 1),
    wholeReport.value ? draft.report.output : null,
  ]);
});

type Answer =
  | { ok: true; columns: Rdl2RunResult['columns']; rows: Record<string, unknown>[]; count: number; ms: number }
  | { ok: false; error: { message: string; stage?: string } };

/** Answers by run key, newest last. Small: at most 50 rows each. */
const kept = new Map<string, Answer>();
const KEEP = 40;
/** Keys with a request out, so one is never asked twice at once. */
const inFlight = ref(new Set<string>());
/** The selected step's run is out (another step's run can still be out in the back). */
const running = computed(() => inFlight.value.has(runKey.value));

function keep(key: string, answer: Answer): void {
  kept.delete(key);
  kept.set(key, answer);
  const oldest = kept.keys().next();
  if (kept.size > KEEP && !oldest.done) kept.delete(oldest.value);
}

/** Draws an answer, or clears the panel for a step that has none yet. */
function show(answer: Answer | null, earlier: boolean): void {
  if (!answer) {
    rows.value = [];
    error.value = null;
    message.value = '';
    ran.value = false;
    return;
  }
  ran.value = true;
  if (!answer.ok) {
    rows.value = [];
    error.value = answer.error;
    message.value = '';
    return;
  }
  error.value = null;
  columns.value = columnsOf(answer.columns);
  rows.value = answer.rows.map((row, index) => ({ ...row, id: index + 1 }));
  const count = answer.count;
  message.value = `${count.toLocaleString()} row${count === 1 ? '' : 's'}${count > LIMIT ? `, first ${LIMIT} shown` : ''} · ${answer.ms} ms${earlier ? ' · kept from the last run' : ''}`;
}

/** Runs the selected step on the server, even when an answer is kept (the Run button, Ctrl+Enter). */
async function run(): Promise<void> {
  const id = target.value;
  const key = runKey.value;
  if (!id || blocking.value.length || inFlight.value.has(key)) return;
  inFlight.value = new Set(inFlight.value).add(key);
  let answer: Answer;
  try {
    const definition = JSON.parse(JSON.stringify(draft.report)) as Rdl2Report;
    const result = await runReport({
      definition,
      params: params.value,
      limit: LIMIT,
      ...(wholeReport.value ? {} : { previewStage: id }),
    });
    answer = { ok: true, columns: result.columns, rows: result.rows, count: result.count, ms: result.meta.ms };
    emit('count', id, result.count);
  } catch (caught) {
    answer = { ok: false, error: errorOf(reportsHost().failure(caught)) };
  } finally {
    const rest = new Set(inFlight.value);
    rest.delete(key);
    inFlight.value = rest;
  }
  // Kept even when the user moved on meanwhile: going back shows it with no request.
  keep(key, answer);
  if (key === runKey.value) show(answer, false);
}

// ------------------------------------------------------------------ auto run
let timer: ReturnType<typeof setTimeout> | null = null;
let shownTarget = '';

watch(
  [runKey, auto, open],
  () => {
    if (timer) clearTimeout(timer);
    const answer = kept.get(runKey.value);
    if (answer) {
      show(answer, true);
      shownTarget = target.value;
      return;
    }
    // Another step: its rows are not this one's. The same step keeps its last rows until the new ones come.
    if (target.value !== shownTarget) show(null, false);
    shownTarget = target.value;
    if (!auto.value || !open.value || !target.value || blocking.value.length) return;
    timer = setTimeout(() => void run(), AUTO_MS);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer);
});

// ------------------------------------------------------------------ resize
function startResize(event: PointerEvent): void {
  const startY = event.clientY;
  const startHeight = height.value;
  const move = (e: PointerEvent) => {
    height.value = Math.min(
      window.innerHeight * 0.8,
      Math.max(140, startHeight + startY - e.clientY),
    );
  };
  const stop = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', stop);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', stop);
}

defineExpose({ run });
</script>
