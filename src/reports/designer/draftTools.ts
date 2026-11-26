import type { Rdl2Report } from '../language';
import { AT_INPUTS, AT_REPORT, type Issue } from './checks';
import type { ReportDraft } from './useReportDraft';

/** The AI's tools that run here, in the open designer (backend `rd_read_draft`, `rd_apply_report`). */
export const CLIENT_TOOLS = ['rd_read_draft', 'rd_apply_report'] as const;

export function isClientTool(name: string): boolean {
  return (CLIENT_TOOLS as readonly string[]).includes(name);
}

/** A whole-report run with the inputs' starting values: its first rows, or the server's error. */
export interface RunCheck {
  ok: boolean;
  count?: number;
  rows?: Record<string, unknown>[];
  error?: string;
}

/** The open report as the AI reads it: on a chat's first message and from `rd_read_draft`. */
export interface DraftState {
  definition: Rdl2Report;
  issues: Issue[];
  /** False for a new report or a copy: it has no saved name yet. */
  saved: boolean;
  unsavedChanges: boolean;
  /** The step (or `inputs`, `output`) the user is looking at. */
  selected: string;
}

export function draftState(draft: ReportDraft): DraftState {
  return {
    definition: JSON.parse(JSON.stringify(draft.report)) as Rdl2Report,
    issues: draft.issues.value,
    saved: !!draft.report.name,
    unsavedChanges: draft.dirty.value,
    selected: draft.selected.value,
  };
}

export interface ClientToolAnswer extends Partial<DraftState> {
  ok: boolean;
  run?: RunCheck;
  error?: string;
}

/** The definition each designer last took from the AI that did not work, and why. */
const lastFailed = new WeakMap<ReportDraft, { definition: string; error: string }>();

function notAReport(definition: unknown): string | null {
  const report = definition as Partial<Rdl2Report> | null;
  if (!report || typeof report !== 'object') return 'definition is missing';
  if (report.lang !== 'rdl2') return 'lang must be "rdl2"';
  if (report.params !== undefined && !Array.isArray(report.params)) return 'params must be a list';
  if (!Array.isArray(report.stages)) return 'stages must be a list';
  if (!report.output || typeof report.output !== 'object' || !Array.isArray(report.output.columns))
    return 'output needs stage and columns';
  return null;
}

/**
 * Run one of the AI's designer tools and give its answer back. Applying makes a new report: the
 * name is cleared (Save names it from the title, and a saved report keeps a different title), so
 * a saved report the user opened stays as it is. It is one undo step, and answers with the
 * designer's problems, else with a run of the whole report, so the AI fixes either in the same
 * turn. The definition that just failed is refused unchanged, so the AI cannot loop on it.
 */
export async function runClientTool(
  draft: ReportDraft,
  name: string,
  args: Record<string, unknown>,
  test: (report: Rdl2Report) => Promise<RunCheck>,
): Promise<ClientToolAnswer> {
  if (name === 'rd_read_draft') return { ok: true, ...draftState(draft) };
  if (name === 'rd_apply_report') {
    const wrong = notAReport(args.definition);
    if (wrong) return { ok: false, error: `Not applied: ${wrong}` };
    const sent = JSON.stringify(args.definition);
    const before = lastFailed.get(draft);
    if (before?.definition === sent)
      return { ok: false, error: `Not applied: this is the definition that just failed (${before.error}). Change what the error names.` };
    const next = args.definition as Rdl2Report;
    const sameTitle = !!draft.report.name && next.title === draft.report.title;
    draft.load({ ...next, name: '', title: sameTitle ? `${next.title} (copy)` : next.title }, false);
    const issues = draft.issues.value;
    const first = issues[0];
    if (first) draft.selected.value = first.at === AT_REPORT ? AT_INPUTS : first.at;
    const run = first ? undefined : await test(JSON.parse(JSON.stringify(draft.report)) as Rdl2Report);
    const ok = !first && !!run?.ok;
    if (ok) lastFailed.delete(draft);
    else lastFailed.set(draft, { definition: sent, error: first ? `${first.at}: ${first.message}` : run?.error ?? 'it did not run' });
    return { ok, issues, ...(run ? { run } : {}) };
  }
  return { ok: false, error: `The designer has no tool named ${name}` };
}
