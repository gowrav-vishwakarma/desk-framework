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
