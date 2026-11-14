import { cleanLayout } from './compile';
import { DESK_DEFAULT_LAYOUT_ID, type DeskFieldCatalog, type DeskGridLayout } from './types';

/** Marks a file as a desk grid layout export. */
export const DESK_LAYOUT_FILE_FORMAT = 'desk-grid-layout';
export const DESK_LAYOUT_FILE_VERSION = 1;
/** A layout is a few KB. Anything far larger is not one. */
export const DESK_LAYOUT_FILE_MAX_BYTES = 256 * 1024;

/** One layout (`layout`) or every layout of the list (`layouts`, Default included). */
export interface DeskLayoutFile {
  format: typeof DESK_LAYOUT_FILE_FORMAT;
  version: typeof DESK_LAYOUT_FILE_VERSION;
  /** The list's storage key. A file imports only into the list with the same key. */
  list: string;
  /** Where it was made, for people reading the file. Not checked. */
  page?: string;
  exportedAt: string;
  layout?: DeskGridLayout;
  layouts?: DeskGridLayout[];
}

export type DeskLayoutImport =
  | { ok: true; kind: 'one'; layout: DeskGridLayout; dropped: number; list: string }
  | { ok: true; kind: 'all'; layouts: DeskGridLayout[]; dropped: number; list: string }
  | { ok: false; error: string };

export type DeskLayoutImportMode = 'overwrite' | 'add';

/** At most this many layouts in one file. */
const MAX_LAYOUTS = 50;

function fileLayout(layout: DeskGridLayout, catalog: DeskFieldCatalog): DeskGridLayout {
  const clean = cleanLayout(layout, catalog);
  return {
    id: clean.id,
    name: clean.name,
    kind: clean.kind,
    columns: clean.columns,
    ...(clean.view ? { view: clean.view } : {}),
    ...(clean.hideActions ? { hideActions: true } : {}),
    ...(clean.note ? { note: clean.note } : {}),
  };
}

function fileText(body: Pick<DeskLayoutFile, 'layout' | 'layouts'>, list: string, page?: string): string {
  const file: DeskLayoutFile = {
    format: DESK_LAYOUT_FILE_FORMAT,
    version: DESK_LAYOUT_FILE_VERSION,
    list,
    ...(page ? { page } : {}),
    exportedAt: new Date().toISOString(),
    ...body,
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

/** The file text for one layout of one list. */
export function exportLayoutFile(layout: DeskGridLayout, list: string, catalog: DeskFieldCatalog, page?: string): string {
  return fileText({ layout: fileLayout(layout, catalog) }, list, page);
}

/** The file text for every layout of one list. Default keeps the id `default`. */
export function exportLayoutsFile(layouts: readonly DeskGridLayout[], list: string, catalog: DeskFieldCatalog, page?: string): string {
  return fileText({ layouts: layouts.map((layout) => fileLayout(layout, catalog)) }, list, page);
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/** A file name such as `products-low-range-products.layout.json`. */
export function layoutFileName(layout: DeskGridLayout, list: string): string {
  return `${slug(list) || 'list'}-${slug(layout.name) || 'layout'}.layout.json`;
}

/** A file name such as `products-all.layouts.json`. */
export function layoutsFileName(list: string): string {
  return `${slug(list) || 'list'}-all.layouts.json`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function looksLikeLayout(value: unknown): value is DeskGridLayout {
  if (!isRecord(value) || !Array.isArray(value.columns)) return false;
  return value.columns.every((column) => isRecord(column) && typeof column.id === 'string' && Array.isArray(column.lines));
}

/**
 * Check a file against this list and clean it with this list's catalog. Fields the list does not
 * have are dropped. The id is not taken from the file: the caller decides which layout it replaces.
 */
export function readLayoutFile(text: string, list: string, catalog: DeskFieldCatalog): DeskLayoutImport {
  if (text.length > DESK_LAYOUT_FILE_MAX_BYTES) return { ok: false, error: 'This file is too large to be a grid layout.' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This file is not a grid layout export (it is not valid JSON).' };
  }
  if (!isRecord(parsed) || parsed.format !== DESK_LAYOUT_FILE_FORMAT) {
    return { ok: false, error: 'This file is not a grid layout export.' };
  }
  if (parsed.version !== DESK_LAYOUT_FILE_VERSION) {
    return { ok: false, error: `This layout was exported by a newer version (format ${String(parsed.version)}). Update the app and try again.` };
  }
  if (typeof parsed.list !== 'string' || parsed.list !== list) {
    const from = typeof parsed.page === 'string' && parsed.page ? parsed.page : typeof parsed.list === 'string' ? parsed.list : 'another list';
    return { ok: false, error: `This layout belongs to "${from}". It can only be imported into that list.` };
  }
  if (Array.isArray(parsed.layouts)) {
    if (parsed.layouts.length === 0) return { ok: false, error: 'This file has no layouts.' };
    if (parsed.layouts.length > MAX_LAYOUTS) return { ok: false, error: `This file has more than ${MAX_LAYOUTS} layouts.` };
    const layouts: DeskGridLayout[] = [];
    let dropped = 0;
    for (const raw of parsed.layouts) {
      if (!looksLikeLayout(raw)) return { ok: false, error: 'A layout in this file is damaged.' };
      const isDefault = raw.id === DESK_DEFAULT_LAYOUT_ID;
      const read = readOne(raw, catalog, isDefault ? DESK_DEFAULT_LAYOUT_ID : `import-${layouts.length}`);
      dropped += read.dropped;
      if (read.layout) layouts.push(read.layout);
    }
    if (layouts.length === 0) return { ok: false, error: 'None of the fields in these layouts exist in this list.' };
    return { ok: true, kind: 'all', layouts, dropped, list };
  }
  if (!looksLikeLayout(parsed.layout)) return { ok: false, error: 'The layout in this file is damaged.' };
  const read = readOne(parsed.layout, catalog, 'import');
  if (!read.layout) return { ok: false, error: 'None of the fields in this layout exist in this list.' };
  return { ok: true, kind: 'one', layout: read.layout, dropped: read.dropped, list };
}

/** Clean one layout from a file. `layout` is null when none of its columns fit this list. */
function readOne(raw: DeskGridLayout, catalog: DeskFieldCatalog, id: string): { layout: DeskGridLayout | null; dropped: number } {
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 80) : 'Imported layout';
  const kind = raw.kind === 'tab' ? 'tab' : 'menu';
  const before = raw.columns.length;
  // Clean under a non-default id so `hideActions` survives; Default drops it below.
  const clean = cleanLayout({ ...raw, id: 'import', name, kind }, catalog);
  const dropped = Math.max(0, before - clean.columns.length);
  if (clean.columns.length === 0) return { layout: null, dropped };
  const layout: DeskGridLayout = { ...clean, id };
  if (id === DESK_DEFAULT_LAYOUT_ID) delete layout.hideActions;
  return { layout, dropped };
}

const sameName = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Merge a file's layouts into the list's layouts.
 * `overwrite`: Default and layouts with the same name are replaced (they keep their id); the rest are added.
 * `add`: every layout is added under a new id. Default comes in as "Default (imported)", and a name
 * already in use gets a number.
 */
export function mergeImportedLayouts(
  existing: readonly DeskGridLayout[],
  imported: readonly DeskGridLayout[],
  mode: DeskLayoutImportMode,
  makeId: () => string,
): DeskGridLayout[] {
  const out = existing.map((layout) => ({ ...layout }));
  const taken = (name: string): boolean => out.some((layout) => sameName(layout.name, name));
  const uniqueName = (name: string): string => {
    if (!taken(name)) return name;
    for (let n = 2; ; n += 1) if (!taken(`${name} (${n})`)) return `${name} (${n})`;
  };
  for (const layout of imported) {
    const isDefault = layout.id === DESK_DEFAULT_LAYOUT_ID;
    if (mode === 'overwrite') {
      const index = isDefault
        ? out.findIndex((item) => item.id === DESK_DEFAULT_LAYOUT_ID)
        : out.findIndex((item) => item.id !== DESK_DEFAULT_LAYOUT_ID && sameName(item.name, layout.name));
      const target = out[index];
      if (target) {
        out[index] = applyImported(target, layout);
        continue;
      }
      if (isDefault) {
        out.unshift({ ...layout, id: DESK_DEFAULT_LAYOUT_ID });
        continue;
      }
      out.push({ ...layout, id: makeId() });
      continue;
    }
    const name = uniqueName(isDefault ? `${layout.name} (imported)` : layout.name);
    out.push({ ...layout, id: makeId(), name });
  }
  return out;
}

/** Names in the file that `overwrite` would replace, Default first. */
export function overwrittenNames(existing: readonly DeskGridLayout[], imported: readonly DeskGridLayout[]): string[] {
  const names: string[] = [];
  for (const layout of imported) {
    if (layout.id === DESK_DEFAULT_LAYOUT_ID) {
      names.unshift('Default');
      continue;
    }
    const match = existing.find((item) => item.id !== DESK_DEFAULT_LAYOUT_ID && sameName(item.name, layout.name));
    if (match) names.push(match.name);
  }
  return names;
}

/** Apply an imported layout onto the one being edited: keep its id, take everything else. */
export function applyImported(target: DeskGridLayout, imported: DeskGridLayout): DeskGridLayout {
  const next: DeskGridLayout = { ...imported, id: target.id };
  if (target.id === DESK_DEFAULT_LAYOUT_ID) delete next.hideActions;
  return next;
}
