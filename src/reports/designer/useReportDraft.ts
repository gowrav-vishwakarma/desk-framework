import {
  computed,
  inject,
  onScopeDispose,
  provide,
  reactive,
  ref,
  watch,
  type ComputedRef,
  type InjectionKey,
  type Ref,
} from 'vue';
import type { Rdl2Param, Rdl2Report, Rdl2Stage } from '../language';
import type { CatalogModel } from '../studioApi';
import { AT_INPUTS, AT_OUTPUT, checkReport, type Issue } from './checks';
import { readsParam, renameParamIn } from './expr';
import { headingFromName, stageInputs, stageSchemas, type ColumnInfo } from './schema';
import { blankReport, freeStepId, stepInfo, type StepKind } from './steps';

/** What the editor shows: `inputs`, `output`, a step's id, or '' for the start panel. */
export type Selection = string;

export interface ReportDraft {
  report: Rdl2Report;
  models: Ref<CatalogModel[]>;
  catalog: ComputedRef<Map<string, CatalogModel>>;
  functions: Ref<string[]>;
  schemas: ComputedRef<Map<string, ColumnInfo[]>>;
  issues: ComputedRef<Issue[]>;
  selected: Ref<Selection>;
  selectedStage: ComputedRef<Rdl2Stage | null>;
  /** Steps a step may read: those before it. */
  stepsBefore: (id: string) => Rdl2Stage[];
  /** Columns a step's settings can name, by where they come from. */
  columnsFor: (stage: Rdl2Stage) => Record<'from' | 'with' | 'in' | 'self', ColumnInfo[]>;
  params: ComputedRef<Rdl2Param[]>;
  dirty: ComputedRef<boolean>;
  canUndo: ComputedRef<boolean>;
  canRedo: ComputedRef<boolean>;
  undo: () => void;
  redo: () => void;
  /** Replace the whole report (load, import, start from), as one history step. */
  load: (report: Rdl2Report, clean?: boolean) => void;
  markSaved: () => void;
  /** Add a step at `position` (default: the end), reading the step before it. */
  addStep: (kind: StepKind, position?: number, model?: string) => Rdl2Stage | null;
  removeStep: (id: string) => void;
  moveStep: (id: string, by: -1 | 1) => void;
  duplicateStep: (id: string) => void;
  renameStep: (id: string, next: string) => string | null;
  /** Steps that read this one. */
  readers: (id: string) => Rdl2Stage[];
  setResult: (id: string) => void;
  /** Steps whose settings read the input `@id`. */
  paramUses: (id: string) => string[];
  /** Rename an input and every `@id` that reads it. */
  renameParam: (from: string, to: string) => void;
  addOutputColumns: (names: string[]) => void;
}

const KEY: InjectionKey<ReportDraft> = Symbol('report-draft');

export function useReportDraftContext(): ReportDraft {
  const draft = inject(KEY);
  if (!draft) throw new Error('The report designer state is missing');
  return draft;
}

const HISTORY = 100;
const BURST_MS = 600;
const snapshot = (report: Rdl2Report): string => JSON.stringify(report);

/** The designer's state: the report being edited and everything worked out from it. */
export function provideReportDraft(): ReportDraft {
  const report = reactive<Rdl2Report>(blankReport());
  const models = ref<CatalogModel[]>([]);
  const functions = ref<string[]>([]);
  const selected = ref<Selection>('');

  const catalog = computed(() => new Map(models.value.map((model) => [model.name, model])));
  const schemas = computed(() => stageSchemas(report, catalog.value));
  // Before the catalog loads every model looks unknown; do not cry wolf.
  const issues = computed(() =>
    models.value.length ? checkReport(report, catalog.value, schemas.value, functions.value) : [],
  );
  // The inputs formulas may use: the report's, and the span of each periods step (`@p_from`, `@p_to`).
  const params = computed((): Rdl2Param[] => [
    ...report.params,
    ...report.stages.flatMap((stage): Rdl2Param[] =>
      stage.kind === 'periods' && stage.id
        ? [
            { id: `${stage.id}_from`, label: `Start of all periods of ${stage.id}`, type: 'date' },
            { id: `${stage.id}_to`, label: `End of all periods of ${stage.id}`, type: 'date' },
          ]
        : [],
    ),
  ]);
  const selectedStage = computed(
    () => report.stages.find((stage) => stage.id === selected.value) ?? null,
  );

  // ------------------------------------------------------------------ history
  // Snapshots of the whole report: small, and they make every change, however made, undoable.
  // Changes within a moment of each other (typing a formula) are one step.
  const past = ref<string[]>([]);
  const future = ref<string[]>([]);
  const savedAs = ref(snapshot(report));
  let current = snapshot(report);
  /** The state before a burst of changes that is not in the history yet. */
  let burstFrom: string | null = null;
  let burstTimer: ReturnType<typeof setTimeout> | null = null;
  const bursting = ref(false);

  function settle(): void {
    if (burstTimer) clearTimeout(burstTimer);
    burstTimer = null;
    if (burstFrom !== null && burstFrom !== current) {
      past.value = [...past.value.slice(-(HISTORY - 1)), burstFrom];
      future.value = [];
    }
    burstFrom = null;
    bursting.value = false;
  }

  watch(
    () => snapshot(report),
    (next) => {
      if (next === current) return;
      burstFrom ??= current;
      bursting.value = true;
      current = next;
      future.value = [];
      if (burstTimer) clearTimeout(burstTimer);
      burstTimer = setTimeout(settle, BURST_MS);
    },
  );
  onScopeDispose(() => {
    if (burstTimer) clearTimeout(burstTimer);
  });

  function restore(text: string): void {
    const parsed = JSON.parse(text) as Rdl2Report;
    // Keys a later state added must go too.
    for (const key of Object.keys(report))
      if (!(key in parsed)) delete (report as unknown as Record<string, unknown>)[key];
    Object.assign(report, parsed);
    // Taken after the change, so the watcher sees nothing new.
    current = snapshot(report);
    if (
      selected.value &&
      selected.value !== AT_INPUTS &&
      selected.value !== AT_OUTPUT &&
      !report.stages.some((stage) => stage.id === selected.value)
    ) {
      selected.value = report.stages[report.stages.length - 1]?.id ?? '';
    }
  }

  function undo(): void {
    settle();
    const previous = past.value[past.value.length - 1];
    if (previous === undefined) return;
    past.value = past.value.slice(0, -1);
    future.value = [current, ...future.value];
    restore(previous);
  }

  function redo(): void {
    settle();
    const next = future.value[0];
    if (next === undefined) return;
    future.value = future.value.slice(1);
    past.value = [...past.value, current];
    restore(next);
  }

  function load(next: Rdl2Report, clean = true): void {
    settle();
    if (!clean) past.value = [...past.value, current];
    restore(snapshot({ ...blankReport(), ...next }));
    future.value = [];
    if (clean) {
      past.value = [];
      savedAs.value = current;
    }
    // A report with no steps opens on the start panel.
    selected.value = report.stages.length ? report.output.stage || report.stages[0]!.id : '';
  }

  // ------------------------------------------------------------------ steps

  function stepsBefore(id: string): Rdl2Stage[] {
    const index = report.stages.findIndex((stage) => stage.id === id);
    return report.stages.slice(0, index < 0 ? report.stages.length : index);
  }

  function columnsFor(stage: Rdl2Stage): Record<'from' | 'with' | 'in' | 'self', ColumnInfo[]> {
    const of = (id: string | undefined) => (id ? (schemas.value.get(id) ?? []) : []);
    const s = stage as Rdl2Stage & { from?: string; with?: string; in?: string };
    return { from: of(s.from), with: of(s.with), in: of(s.in), self: of(stage.id) };
  }

  function readers(id: string): Rdl2Stage[] {
    return report.stages.filter((stage) => stage.id !== id && stageInputs(stage).includes(id));
  }

  /** Point every reference to `from` at `to` (or clear it). */
  function repoint(from: string, to: string): void {
    for (const stage of report.stages as (Rdl2Stage & Record<string, unknown>)[]) {
      for (const key of ['from', 'with', 'in']) if (stage[key] === from) stage[key] = to;
      if (stage.kind === 'union')
        for (const part of stage.parts) if (part.from === from) part.from = to;
    }
    if (report.output.stage === from) report.output.stage = to;
  }

  function addStep(
    kind: StepKind,
    position = report.stages.length,
    model?: string,
  ): Rdl2Stage | null {
    const info = stepInfo(kind);
    if (!info) return null;
    const at = Math.max(0, Math.min(position, report.stages.length));
    const previous = report.stages[at - 1]?.id ?? null;
    const base =
      kind === 'source' && model
        ? model.charAt(0).toLowerCase() + model.slice(1)
        : kind === 'source'
          ? 'records'
          : kind;
    const stage = info.make(freeStepId(report, base), kind === 'source' ? null : previous);
    if (stage.kind === 'source' && model) stage.model = model;
    // Put between two steps, it takes the place of the one before: the next step now reads it.
    const next = report.stages[at];
    if (next && previous && kind !== 'source' && stageInputs(next)[0] === previous) {
      if (next.kind === 'union') {
        if (next.parts[0]) next.parts[0].from = stage.id;
      } else if ('from' in next) next.from = stage.id;
    }
    report.stages.splice(at, 0, stage);
    // The report shows the last step unless another was chosen.
    const last = at === report.stages.length - 1;
    if (!report.output.stage || (last && report.output.stage === previous))
      report.output.stage = stage.id;
    selected.value = stage.id;
    return stage;
  }

  function removeStep(id: string): void {
    const index = report.stages.findIndex((stage) => stage.id === id);
    if (index < 0) return;
    const [removed] = report.stages.splice(index, 1);
    // Steps that read it read what it read instead, when that is a step; otherwise they need a choice.
    const input = removed ? (stageInputs(removed)[0] ?? '') : '';
    repoint(id, input || '');
    if (report.output.stage === '' && report.stages.length)
      report.output.stage = report.stages[report.stages.length - 1]!.id;
    if (selected.value === id) selected.value = report.stages[Math.max(0, index - 1)]?.id ?? '';
  }

  function moveStep(id: string, by: -1 | 1): void {
    const index = report.stages.findIndex((stage) => stage.id === id);
    const target = index + by;
    if (index < 0 || target < 0 || target >= report.stages.length) return;
    const [stage] = report.stages.splice(index, 1);
    report.stages.splice(target, 0, stage!);
  }

  function duplicateStep(id: string): void {
    const index = report.stages.findIndex((stage) => stage.id === id);
    const stage = report.stages[index];
    if (!stage) return;
    const copy = JSON.parse(JSON.stringify(stage)) as Rdl2Stage;
    copy.id = freeStepId(report, stage.id);
    report.stages.splice(index + 1, 0, copy);
    selected.value = copy.id;
  }

  /** Rename a step and every reference to it. Returns a problem, or null when done. */
  function renameStep(id: string, next: string): string | null {
    const name = next.trim();
    if (name === id) return null;
    if (!/^[A-Za-z_]\w*$/.test(name))
      return 'A step name uses letters, digits and _, and starts with a letter';
    if (report.stages.some((stage) => stage.id === name)) return `Another step is named ${name}`;
    const stage = report.stages.find((item) => item.id === id);
    if (!stage) return null;
    repoint(id, name);
    stage.id = name;
    if (selected.value === id) selected.value = name;
    return null;
  }

  /** Change every text setting in place (expressions live in strings); `visit` returns the new text or nothing. */
  function eachText(value: unknown, visit: (text: string) => string | void): unknown {
    if (typeof value === 'string') return visit(value) ?? value;
    if (Array.isArray(value)) return value.map((item) => eachText(item, visit));
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      for (const key of Object.keys(record)) record[key] = eachText(record[key], visit);
    }
    return value;
  }

  /** Every text in a step's settings. */
  function texts(value: unknown, out: string[] = []): string[] {
    if (typeof value === 'string') out.push(value);
    else if (Array.isArray(value)) value.forEach((item) => texts(item, out));
    else if (value && typeof value === 'object')
      Object.values(value).forEach((item) => texts(item, out));
    return out;
  }

  function paramUses(id: string): string[] {
    return report.stages
      .filter((stage) => texts(stage).some((text) => readsParam(text, id)))
      .map((stage) => stage.id);
  }

  function renameParam(from: string, to: string): void {
    const param = report.params.find((item) => item.id === from);
    if (!param || !to || from === to) return;
    param.id = to;
    for (const stage of report.stages)
      eachText(stage, (text) =>
        readsParam(text, from) ? renameParamIn(text, from, to) : undefined,
      );
    for (const item of report.params)
      if (item.lookup?.where && readsParam(item.lookup.where, from))
        item.lookup.where = renameParamIn(item.lookup.where, from, to);
  }

  function setResult(id: string): void {
    report.output.stage = id;
  }

  function addOutputColumns(names: string[]): void {
    const cols = schemas.value.get(report.output.stage) ?? [];
    const have = new Set(report.output.columns.map((col) => col.column));
    for (const name of names) {
      if (have.has(name)) continue;
      const info = cols.find((col) => col.name === name);
      const format =
        info?.type === 'date' ? 'date' : info?.type === 'boolean' ? 'boolean' : undefined;
      report.output.columns.push({
        column: name,
        label: headingFromName(name),
        ...(format ? { format } : {}),
      });
    }
  }

  const draft: ReportDraft = {
    report,
    models,
    catalog,
    functions,
    schemas,
    issues,
    selected,
    selectedStage,
    stepsBefore,
    columnsFor,
    params,
    dirty: computed(() => snapshot(report) !== savedAs.value),
    canUndo: computed(() => past.value.length > 0 || bursting.value),
    canRedo: computed(() => future.value.length > 0),
    undo,
    redo,
    load,
    markSaved: () => {
      savedAs.value = snapshot(report);
    },
    addStep,
    removeStep,
    moveStep,
    duplicateStep,
    renameStep,
    readers,
    setResult,
    paramUses,
    renameParam,
    addOutputColumns,
  };
  provide(KEY, draft);
  return draft;
}
