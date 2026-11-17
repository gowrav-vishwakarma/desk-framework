import { catalogRelation, cloneLayout, listMaxItems, manyRelationOf, withLockedColumns } from './compile';
import { isFieldPart, isListPart, partFieldKey, type DeskCellPart, type DeskFieldCatalog, type DeskFieldPart, type DeskGridLayout, type DeskLayoutColumn, type DeskListPart } from './types';

/** What a designer drag or click carries. */
export type DeskDesignerPayload =
  | { type: 'field'; key: string }
  | { type: 'list'; path: string }
  | { type: 'chip'; column: string; line: number; index: number };

/** Where a part lands: a line of a column, or a new line after the last. */
export interface DeskDesignerSpot {
  column: string;
  line: number | null;
}

function copy(layout: DeskGridLayout): DeskGridLayout {
  return cloneLayout(layout);
}

function columnOf(layout: DeskGridLayout, id: string): DeskLayoutColumn | undefined {
  return layout.columns.find((column) => column.id === id);
}

function firstListField(catalog: DeskFieldCatalog, path: string): string | undefined {
  return catalog.fields.find((field) => field.key.startsWith(`${path}.`) && manyRelationOf(catalog, field.key)?.path === path)?.key;
}

/** The part a palette item becomes. A field under a child list becomes a list part. */
export function partFor(catalog: DeskFieldCatalog, payload: DeskDesignerPayload): DeskCellPart | null {
  if (payload.type === 'chip') return null;
  if (payload.type === 'field') {
    const many = manyRelationOf(catalog, payload.key);
    if (!many) return payload.key;
    return { list: many.path, fields: [payload.key], show: 'comma', max: listMaxItems(many) };
  }
  const relation = catalogRelation(catalog, payload.path);
  const key = firstListField(catalog, payload.path);
  if (!relation?.many || !key) return null;
  return { list: relation.path, fields: [key], show: 'comma', max: listMaxItems(relation) };
}

function insert(column: DeskLayoutColumn, line: number | null, part: DeskCellPart): { line: number; index: number } {
  if (line === null || !column.lines[line]) {
    column.lines.push([part]);
    return { line: column.lines.length - 1, index: 0 };
  }
  const target = column.lines[line];
  if (isListPart(part)) {
    const same = target.findIndex((item) => isListPart(item) && item.list === part.list);
    const existing = target[same];
    if (existing && isListPart(existing)) {
      for (const key of part.fields) if (!existing.fields.includes(key)) existing.fields.push(key);
      return { line, index: same };
    }
  }
  target.push(part);
  return { line, index: target.length - 1 };
}

export interface DeskDropResult {
  layout: DeskGridLayout;
  /** Where the part sits now, so the designer can open a list part's settings. */
  at: { column: string; line: number; index: number } | null;
}

export function dropPart(layout: DeskGridLayout, catalog: DeskFieldCatalog, payload: DeskDesignerPayload, spot: DeskDesignerSpot): DeskDropResult {
  const next = copy(layout);
  const target = columnOf(next, spot.column);
  if (!target) return { layout, at: null };
  let part: DeskCellPart | null;
  let line = spot.line;
  if (payload.type === 'chip') {
    const source = columnOf(next, payload.column);
    const sourceLine = source?.lines[payload.line];
    part = sourceLine?.[payload.index] ?? null;
    if (!source || !sourceLine || !part) return { layout, at: null };
    sourceLine.splice(payload.index, 1);
    if (sourceLine.length === 0) {
      source.lines.splice(payload.line, 1);
      if (source === target && line !== null && line > payload.line) line -= 1;
      else if (source === target && line === payload.line) line = null;
    }
  } else {
    part = partFor(catalog, payload);
  }
  if (!part) return { layout, at: null };
  const placed = insert(target, line, part);
  return { layout: next, at: { column: target.id, ...placed } };
}

export function removePart(layout: DeskGridLayout, column: string, line: number, index: number): DeskGridLayout {
  const next = copy(layout);
  const target = columnOf(next, column);
  const row = target?.lines[line];
  if (!target || !row) return layout;
  row.splice(index, 1);
  if (row.length === 0) target.lines.splice(line, 1);
  return next;
}

export type DeskPartMove = 'up' | 'down' | 'left' | 'right';

/**
 * Up and down move a part to the end of the line above or below. Past the first or last line it gets
 * a line of its own, unless it already is alone there. Left and right reorder it within its line.
 */
export function movePart(layout: DeskGridLayout, column: string, line: number, index: number, move: DeskPartMove): DeskGridLayout {
  const next = copy(layout);
  const lines = columnOf(next, column)?.lines;
  const row = lines?.[line];
  const part = row?.[index];
  if (!lines || !row || part === undefined) return layout;
  if (move === 'left' || move === 'right') {
    const to = move === 'left' ? index - 1 : index + 1;
    if (to < 0 || to >= row.length) return layout;
    row.splice(index, 1);
    row.splice(to, 0, part);
    return next;
  }
  const alone = row.length === 1;
  const to = move === 'up' ? line - 1 : line + 1;
  if (to < 0 || to >= lines.length) {
    if (alone) return layout;
    row.splice(index, 1);
    if (move === 'up') lines.unshift([part]);
    else lines.push([part]);
    return next;
  }
  lines[to]?.push(part);
  row.splice(index, 1);
  if (row.length === 0) lines.splice(line, 1);
  return next;
}

/** Moves this part and the ones after it to a new line just below. */
export function splitLine(layout: DeskGridLayout, column: string, line: number, index: number): DeskGridLayout {
  const next = copy(layout);
  const lines = columnOf(next, column)?.lines;
  const row = lines?.[line];
  if (!lines || !row || index <= 0 || index >= row.length) return layout;
  lines.splice(line + 1, 0, row.splice(index));
  return next;
}

export function updateFieldPart(
  layout: DeskGridLayout,
  column: string,
  line: number,
  index: number,
  patch: Partial<Pick<DeskFieldPart, 'label' | 'style' | 'rules'>>,
): DeskGridLayout {
  const next = copy(layout);
  const row = columnOf(next, column)?.lines[line];
  const part = row?.[index];
  const key = part ? partFieldKey(part) : null;
  if (!row || !part || !key) return layout;
  const current: DeskFieldPart = isFieldPart(part) ? { ...part, field: key } : { field: key };
  if (patch.label !== undefined) current.label = patch.label;
  if (patch.style !== undefined) current.style = patch.style;
  if (patch.rules !== undefined) current.rules = patch.rules;
  const label = current.label?.trim();
  const style = current.style;
  const rules = current.rules ?? [];
  row[index] = !label && !style && rules.length === 0 ? key : { field: key, ...(label ? { label } : {}), ...(style ? { style } : {}), ...(rules.length ? { rules } : {}) };
  return next;
}

export function setPartLabel(layout: DeskGridLayout, column: string, line: number, index: number, label: string): DeskGridLayout {
  const row = columnOf(layout, column)?.lines[line];
  const part = row?.[index];
  if (part && isListPart(part)) {
    const next = copy(layout);
    const target = columnOf(next, column)?.lines[line];
    const current = target?.[index];
    if (!target || !current || !isListPart(current)) return layout;
    const text = label.trim();
    const cleaned: DeskListPart = { list: current.list, fields: [...current.fields], show: current.show, max: current.max };
    if (text) cleaned.label = text;
    target[index] = cleaned;
    return next;
  }
  return updateFieldPart(layout, column, line, index, { label });
}

export function replacePart(layout: DeskGridLayout, column: string, line: number, index: number, part: DeskListPart): DeskGridLayout {
  const next = copy(layout);
  const row = columnOf(next, column)?.lines[line];
  if (!row || index >= row.length) return layout;
  row[index] = part;
  return next;
}

export function addColumn(layout: DeskGridLayout, id: string, header = 'Column'): DeskGridLayout {
  const next = copy(layout);
  next.columns.push({ id, header, lines: [], sortField: null, filterField: null });
  return next;
}

export function removeColumn(layout: DeskGridLayout, id: string): DeskGridLayout {
  return { ...layout, columns: layout.columns.filter((column) => column.id !== id) };
}

export function moveColumn(layout: DeskGridLayout, id: string, step: -1 | 1): DeskGridLayout {
  const columns = [...layout.columns];
  const from = columns.findIndex((column) => column.id === id);
  const to = from + step;
  if (from < 0 || to < 0 || to >= columns.length) return layout;
  const [moved] = columns.splice(from, 1);
  if (moved) columns.splice(to, 0, moved);
  return { ...layout, columns };
}

/** Put a column before the one now at `before`. `before` equal to the count puts it last. */
export function moveColumnTo(layout: DeskGridLayout, id: string, before: number): DeskGridLayout {
  const from = layout.columns.findIndex((column) => column.id === id);
  if (from < 0) return layout;
  const to = before > from ? before - 1 : before;
  if (to === from) return layout;
  const columns = [...layout.columns];
  const [moved] = columns.splice(from, 1);
  if (moved) columns.splice(Math.max(0, Math.min(to, columns.length)), 0, moved);
  return { ...layout, columns };
}

export function updateColumn(layout: DeskGridLayout, id: string, patch: Partial<DeskLayoutColumn>): DeskGridLayout {
  return { ...layout, columns: layout.columns.map((column) => (column.id === id ? { ...column, ...patch } : column)) };
}

/**
 * Drop view entries whose column is gone or no longer sorts or filters. Empty filter text stays,
 * so a filter row the user just added is not lost; saving drops it.
 */
export function pruneLayoutView(layout: DeskGridLayout, catalog: DeskFieldCatalog): DeskGridLayout {
  const view = layout.view;
  if (!view) return layout;
  const byId = new Map(withLockedColumns(layout, catalog).columns.map((column) => [column.id, column]));
  let changed = false;
  const next = { ...view };
  if (next.sort && !byId.get(next.sort.column)?.sortField) {
    delete next.sort;
    changed = true;
  }
  if (next.filters) {
    const filters: Record<string, string> = {};
    for (const [id, text] of Object.entries(next.filters)) {
      if (byId.get(id)?.filterField) filters[id] = text;
      else changed = true;
    }
    next.filters = filters;
  }
  return changed ? { ...layout, view: next } : layout;
}
