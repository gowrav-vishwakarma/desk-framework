import type { DeskClient } from './client';

/** One row of a settings sheet as the sheet reports it. */
export interface DeskSettingsRowView {
  key: string;
  value: unknown;
  shown?: string;
  editor?: string;
  required?: boolean;
  issue?: string | null;
}

/** A settings sheet's rows by key (`path` is the sheet, such as `page:charge-new/form:form/settings:charge`). */
export async function deskSettingsRows(client: DeskClient, path: string): Promise<Record<string, DeskSettingsRowView>> {
  const snap = (await client.snapshot({ path, depth: 1 })) as Array<{ state?: { rows?: DeskSettingsRowView[] } }>;
  const rows = snap[0]?.state?.rows;
  if (!rows) throw new Error(`${path} is not a settings sheet`);
  return Object.fromEntries(rows.map((row) => [row.key, row]));
}

/** The problems a settings sheet shows, by row key (client rules and server answers alike). */
export async function deskSettingsIssues(client: DeskClient, path: string): Promise<Record<string, string>> {
  const rows = await deskSettingsRows(client, path);
  return Object.fromEntries(Object.entries(rows).filter(([, row]) => row.issue).map(([key, row]) => [key, String(row.issue)]));
}

/** A form's values as the user sees them: each settings row (value and shown text) and each grid's shown rows. */
export interface DeskFormValues {
  rows: Record<string, { value: unknown; shown: string; editor?: string }>;
  grids: Record<string, string[]>;
}

/**
 * Capture a form to compare it after a save and reopen (`deskFormDiff`): the settings sheet's rows, and the shown text
 * of each grid's filled rows (`grids` are grid paths under the form, such as `.../grid:employees`).
 */
export async function deskFormValues(client: DeskClient, settingsPath: string, grids: string[] = []): Promise<DeskFormValues> {
  const rows = await deskSettingsRows(client, settingsPath);
  const out: DeskFormValues = { rows: {}, grids: {} };
  for (const [key, row] of Object.entries(rows)) out.rows[key] = { value: row.value, shown: String(row.shown ?? ''), ...(row.editor ? { editor: row.editor } : {}) };
  for (const grid of grids) {
    const read = await client.read<{ rows?: Array<{ cells?: Record<string, { shown?: string }> }> }>(grid);
    out.grids[grid.replace(/^.*\/grid:/, '')] = (read.rows ?? [])
      .map((row) => Object.values(row.cells ?? {}).map((cell) => (cell.shown ?? '').trim()).filter(Boolean).join(' | '))
      .filter(Boolean)
      .sort();
  }
  return out;
}

/**
 * What differs between two captures of a form (before a save, after reopening it): `key: before → after` for each row
 * whose value or shown text changed, and each grid whose rows changed. A lookup is compared by its shown text (the
 * record may come back with more fields); `ignore` lists keys the server sets or recomputes.
 */
export function deskFormDiff(before: DeskFormValues, after: DeskFormValues, ignore: string[] = []): string[] {
  const diffs: string[] = [];
  const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const empty = (v: unknown) => v === null || v === undefined || v === '';
  // The same number written two ways ("900" typed, "900.00000000" read back from a decimal column) is the same value.
  const sameNumber = (a: unknown, b: unknown) => !empty(a) && !empty(b) && typeof a !== 'object' && typeof b !== 'object' && Number.isFinite(Number(a)) && Number(a) === Number(b);
  for (const key of new Set([...Object.keys(before.rows), ...Object.keys(after.rows)])) {
    if (ignore.includes(key)) continue;
    const a = before.rows[key];
    const b = after.rows[key];
    if (!a || !b) {
      diffs.push(`${key}: ${a ? 'shown before, missing after' : 'missing before, shown after'}`);
      continue;
    }
    const lookup = a.editor === 'lookup' || b.editor === 'lookup' || (typeof a.value === 'object' && a.value !== null);
    const changed = lookup ? a.shown.trim() !== b.shown.trim() : !(same(a.value, b.value) || (empty(a.value) && empty(b.value)) || String(a.value) === String(b.value) || sameNumber(a.value, b.value));
    if (changed) diffs.push(`${key}: ${JSON.stringify(lookup ? a.shown : a.value)} → ${JSON.stringify(lookup ? b.shown : b.value)}`);
  }
  for (const grid of new Set([...Object.keys(before.grids), ...Object.keys(after.grids)])) {
    if (!same(before.grids[grid], after.grids[grid])) diffs.push(`grid ${grid}: ${JSON.stringify(before.grids[grid])} → ${JSON.stringify(after.grids[grid])}`);
  }
  return diffs;
}
