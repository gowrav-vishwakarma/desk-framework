import { reportsHost, type ReportsAction } from './host';
import type { Rdl2PivotView, Rdl2Report, Rdl2RunRequest, Rdl2RunResult } from './language';

/**
 * One studio action, through the host (`ReportsHost.call`). `shared`: a load kept for every page (the catalog, the
 * list), which leaving the page that started it does not abort.
 */
function post<T>(action: ReportsAction, body: unknown, shared = false) {
  return reportsHost().call<T>(action, body, shared ? { shared: true } : {});
}

export type CatalogFieldType = 'number' | 'text' | 'date' | 'datetime' | 'boolean' | 'json' | 'enum';

export interface CatalogField {
  name: string;
  label: string;
  type: CatalogFieldType;
  column: string;
  values?: string[];
  primaryKey?: boolean;
}

export interface CatalogRelation {
  name: string;
  label: string;
  type: 'one' | 'many';
  target: string;
  sourceKey: string;
  targetKey: string;
}

export interface CatalogModel {
  name: string;
  label: string;
  fields: CatalogField[];
  relations: CatalogRelation[];
  scope: { company: boolean; row: 'own' | 'path' | 'none'; rowPath?: string; softDelete: boolean };
}

export interface ReportCatalog {
  version: string;
  models: CatalogModel[];
  functions: string[];
}

export interface ReportListItem {
  origin: 'system' | 'saved';
  id?: number;
  name: string;
  title: string;
  category: string;
  description: string;
  status?: string;
  definition: Rdl2Report;
}

let catalogLoad: Promise<ReportCatalog> | null = null;

/** The model catalog, fetched once per session (the backend builds it from the models). */
export function loadReportCatalog(): Promise<ReportCatalog> {
  catalogLoad ??= post<ReportCatalog>('catalog', {}, true).then((response) => response.data);
  catalogLoad.catch(() => {
    catalogLoad = null;
  });
  return catalogLoad;
}

/** A saved pivot: a layout over a report, listed apart from reports. */
export interface PivotListItem {
  id: number;
  name: string;
  title: string;
  category: string;
  description: string;
  definition: Rdl2PivotView;
}

interface StudioList {
  reports: ReportListItem[];
  pivots: PivotListItem[];
}

let reportsLoad: { companyId: string | number; list: Promise<StudioList> } | null = null;

/**
 * Shipped and saved reports, and saved pivots, for the company. One load is shared by the menu and
 * every page that needs the list (run, pivot, designer, the list itself), so a reload asks the
 * server once. A save drops it; `fresh` reads it again.
 */
function loadList(options: { fresh?: boolean }): Promise<StudioList> {
  const companyId = reportsHost().companyKey();
  if (!options.fresh && reportsLoad?.companyId === companyId) return reportsLoad.list;
  const list = post<{ reports?: ReportListItem[]; pivots?: PivotListItem[] }>('list', {}, true)
    .then(({ data }) => ({ reports: data.reports ?? [], pivots: data.pivots ?? [] }));
  const entry = { companyId, list };
  reportsLoad = entry;
  // A failed load is not kept: the next caller tries again.
  list.catch(() => {
    if (reportsLoad === entry) reportsLoad = null;
  });
  return list;
}

export function listReports(options: { fresh?: boolean } = {}): Promise<ReportListItem[]> {
  return loadList(options).then((list) => list.reports);
}

export function listPivots(options: { fresh?: boolean } = {}): Promise<PivotListItem[]> {
  return loadList(options).then((list) => list.pivots);
}

export async function runReport(request: Rdl2RunRequest): Promise<Rdl2RunResult> {
  const { data } = await post<Rdl2RunResult>('run', request);
  return data;
}

/** Grouped rows a pivot asks for per request; the server's "all rows" cap. */
export const PIVOT_BATCH = 50_000;
/** Grouped rows a pivot holds at most. Past it the figures are incomplete, and the page says so in red. */
export const PIVOT_MAX_ROWS = 1_000_000;

export interface PivotRows {
  rows: Record<string, unknown>[];
  /** Grouped rows in the whole result. */
  count: number;
  /** Stopped at `PIVOT_MAX_ROWS`: some groups are missing. */
  truncated: boolean;
}

/**
 * Every grouped row of a summary run, a batch at a time. The server orders them by the keys, so
 * the batches neither overlap nor skip. `progress` hears the rows so far and the total.
 */
export async function runPivotRows(request: Rdl2RunRequest, progress: (loaded: number, total: number) => void): Promise<PivotRows> {
  const rows: Record<string, unknown>[] = [];
  let count = 0;
  for (let offset = 0; ; offset += PIVOT_BATCH) {
    const page = await runReport({ ...request, limit: PIVOT_BATCH, offset });
    for (const row of page.rows) rows.push(row);
    count = Math.max(page.count, rows.length);
    progress(rows.length, count);
    if (page.rows.length < PIVOT_BATCH || rows.length >= count) return { rows, count, truncated: false };
    if (rows.length >= PIVOT_MAX_ROWS) return { rows, count, truncated: true };
  }
}

export function saveReport(definition: Rdl2Report, id?: number): Promise<{ id: number; name: string }> {
  return saveDefinition(definition, id);
}

/** Remove a company report or a saved pivot. System reports are not deleted. Pivots over a report go with it. */
export async function deleteReport(id: number): Promise<void> {
  await post('delete', { id });
  reportsLoad = null;
}

async function saveDefinition(definition: Rdl2Report | Rdl2PivotView, id?: number): Promise<{ id: number; name: string }> {
  const { data } = await post<{ id: number; name: string }>('save', { definition, ...(id ? { id } : {}) });
  // The saved report is new or changed: the next list read comes from the server.
  reportsLoad = null;
  return data;
}

export async function lookupChoices(request: { model: string; label: string; value?: string; query: string }): Promise<{ value: unknown; label: unknown }[]> {
  const { data } = await post<{ rows?: { value: unknown; label: unknown }[] }>('lookup', request);
  return data.rows ?? [];
}

/** A report by name: shipped or saved. */
export async function findReport(name: string): Promise<ReportListItem | null> {
  const all = await listReports();
  return all.find((item) => item.name === name) ?? null;
}

/** A saved pivot by name. Reports and pivots share one set of names. */
export async function findPivot(name: string): Promise<PivotListItem | null> {
  const all = await listPivots();
  return all.find((item) => item.name === name) ?? null;
}

/** Save a pivot (new, or the one with `id`). The server checks its source report. */
export function savePivot(view: Rdl2PivotView, id?: number): Promise<{ id: number; name: string }> {
  return saveDefinition(view, id);
}
