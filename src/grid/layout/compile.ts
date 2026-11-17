import type { DeskCellBlock, DeskCellSpan, DeskColumn, DeskEditorKind, DeskGridRow } from '../types';
import { evalRule, expressionKey, parseRule, type RuleScalar } from './ruleExpr';
import { formatDeskDate } from '../../date/deskDate';
import { datePrefs, ensureDatePrefs } from '../../date/datePrefs';
import { formatDeskNumber, moneyFromKeys, moneyFromRow, moneyLines, type DeskMoneyView } from '../../currency/money';
import {
  DESK_LIST_MAX_ITEMS,
  isFieldPart,
  isListPart,
  partFieldKey,
  type DeskCatalogField,
  type DeskCatalogRelation,
  type DeskCellPart,
  type DeskColumnQueryInfo,
  type DeskFieldCatalog,
  type DeskFieldFormatters,
  type DeskFieldPart,
  type DeskFieldSelection,
  type DeskFieldType,
  type DeskFieldUse,
  DESK_DEFAULT_LAYOUT_ID,
  type DeskGridLayout,
  type DeskGridLayoutView,
  type DeskLayoutColumn,
  type DeskListPart,
  type DeskLockedColumn,
  type DeskPartLook,
  type DeskPartPad,
  type DeskPartPlace,
  type DeskPartSize,
  type DeskPartStyle,
  type DeskPartTone,
  type DeskRuleTerm,
  type DeskStyleOp,
  type DeskStyleRule,
  DESK_FIELD_PAD,
  DESK_LAYOUT_NOTE_MAX,
} from './types';

/** A plain copy. Layouts are JSON, and a reactive proxy cannot go through `structuredClone`. */
export function cloneLayout<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function catalogField(catalog: DeskFieldCatalog, key: string): DeskCatalogField | undefined {
  return catalog.fields.find((field) => field.key === key);
}

export function catalogRelation(catalog: DeskFieldCatalog, path: string): DeskCatalogRelation | undefined {
  return catalog.relations.find((relation) => relation.path === path);
}

/** The outermost `many` relation a key sits under, or null. */
export function manyRelationOf(catalog: DeskFieldCatalog, key: string): DeskCatalogRelation | null {
  const segments = key.split('.');
  for (let i = 1; i < segments.length; i += 1) {
    const relation = catalogRelation(catalog, segments.slice(0, i).join('.'));
    if (relation?.many) return relation;
  }
  return null;
}

export function fieldSortable(catalog: DeskFieldCatalog, key: string): boolean {
  const field = catalogField(catalog, key);
  if (!field || manyRelationOf(catalog, key)) return false;
  return field.sortable !== false;
}

export function fieldFilterable(catalog: DeskFieldCatalog, key: string): boolean {
  const field = catalogField(catalog, key);
  if (!field) return false;
  if (manyRelationOf(catalog, key)) return field.filterable === true;
  return field.filterable !== false;
}

export function listMaxItems(relation: DeskCatalogRelation | undefined): number {
  return Math.max(1, relation?.maxItems ?? DESK_LIST_MAX_ITEMS);
}

export function readPath(value: unknown, path: string): unknown {
  let current: unknown = value;
  for (const segment of path.split('.')) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function relativeKey(listPath: string, key: string): string {
  return key.startsWith(`${listPath}.`) ? key.slice(listPath.length + 1) : key;
}

export function formatFieldValue(
  field: DeskCatalogField | undefined,
  value: unknown,
  row: Record<string, unknown>,
  formatters: DeskFieldFormatters = {},
): string {
  const named = field?.format ? formatters[field.format] : undefined;
  if (named) return named(value, row);
  if (value === null || value === undefined) return '';
  if (field?.type === 'date' && typeof value === 'string') {
    ensureDatePrefs();
    return formatDeskDate(value, datePrefs.value.show);
  }
  if (field?.type === 'currency') return moneyLines(value, moneyFromRow(field.moneyFrom, row)).primary;
  if (field?.type === 'number' && field.decimals !== undefined) return formatDeskNumber(value, field.decimals);
  if (typeof value === 'boolean' || field?.type === 'boolean') return value === true || value === 'true' || value === 1 ? 'Yes' : 'No';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && 'name' in value) {
    const name = (value as { name?: unknown }).name;
    return typeof name === 'string' ? name : '';
  }
  return '';
}

function listItems(row: Record<string, unknown>, part: DeskListPart): Record<string, unknown>[] {
  const items = readPath(row, part.list);
  if (!Array.isArray(items)) return [];
  return items.filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object');
}

function itemText(catalog: DeskFieldCatalog, part: DeskListPart, item: Record<string, unknown>, formatters: DeskFieldFormatters): string {
  return part.fields
    .map((key) => formatFieldValue(catalogField(catalog, key), readPath(item, relativeKey(part.list, key)), item, formatters))
    .filter((text) => text !== '')
    .join(' ');
}

function moreText(more: number): string {
  return more > 0 ? `+${more} more` : '';
}

const LOOKS = new Set<DeskPartLook>(['text', 'chip', 'box']);
const TONES = new Set<DeskPartTone>(['default', 'muted', 'success', 'warning', 'danger', 'info']);
const SIZES = new Set<DeskPartSize>(['small', 'normal', 'large']);
const OPS = new Set<DeskStyleOp>(['eq', 'ne', 'gt', 'lt', 'contains', 'empty']);

const PLACES = new Set<DeskPartPlace>(['left', 'right']);
const PAD_CAP = 32;

function cleanPad(pad: DeskPartPad | undefined): DeskPartPad | undefined {
  if (!pad) return undefined;
  const next: DeskPartPad = {};
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    const value = pad[side];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    const clamped = Math.min(PAD_CAP, Math.max(0, Math.round(value)));
    if (clamped !== DESK_FIELD_PAD[side]) next[side] = clamped;
  }
  return next.top !== undefined || next.right !== undefined || next.bottom !== undefined || next.left !== undefined ? next : undefined;
}

function cleanStyle(style: DeskPartStyle | undefined): DeskPartStyle | undefined {
  if (!style) return undefined;
  const next: DeskPartStyle = {};
  if (style.look && LOOKS.has(style.look) && style.look !== 'text') next.look = style.look;
  if (style.tone && TONES.has(style.tone) && style.tone !== 'default') next.tone = style.tone;
  if (style.size && SIZES.has(style.size) && style.size !== 'normal') next.size = style.size;
  if (style.bold) next.bold = true;
  if (style.place && PLACES.has(style.place) && style.place !== 'left') next.place = style.place;
  const pad = cleanPad(style.pad);
  if (pad) next.pad = pad;
  return next.look || next.tone || next.size || next.bold || next.place || next.pad ? next : undefined;
}

function singleValueField(catalog: DeskFieldCatalog, key: string): boolean {
  return Boolean(catalogField(catalog, key) && !manyRelationOf(catalog, key));
}

/** Catalog fields a condition may name. List fields stay out. */
export function ruleFieldKeys(catalog: DeskFieldCatalog): string[] {
  return catalog.fields.filter((field) => expressionKey(field.key) && !manyRelationOf(catalog, field.key)).map((field) => field.key);
}

function cleanTerm(term: DeskRuleTerm | undefined, catalog: DeskFieldCatalog): DeskRuleTerm | undefined {
  if (!term || typeof term !== 'object') return undefined;
  if ('number' in term && typeof term.number === 'number' && Number.isFinite(term.number)) return { number: term.number };
  if ('text' in term && typeof term.text === 'string') {
    const text = term.text.slice(0, 80);
    return text ? { text } : undefined;
  }
  if ('field' in term && typeof term.field === 'string' && singleValueField(catalog, term.field)) return { field: term.field };
  return undefined;
}

function cleanRules(rules: DeskStyleRule[] | undefined, catalog: DeskFieldCatalog): DeskStyleRule[] {
  if (!Array.isArray(rules)) return [];
  const allowed = ruleFieldKeys(catalog);
  const out: DeskStyleRule[] = [];
  for (const rule of rules.slice(0, 5)) {
    if (!rule) continue;
    const next: DeskStyleRule = {};
    const when = typeof rule.when === 'string' ? rule.when.trim() : '';
    if (typeof rule.when === 'string') {
      if (!when || !parseRule(when, allowed).ok) continue;
      next.when = when;
    } else if (rule.op && OPS.has(rule.op)) {
      next.op = rule.op;
      const left = cleanTerm(rule.left, catalog);
      const right = cleanTerm(rule.right, catalog);
      if (left) next.left = left;
      if (right) next.right = right;
      else if (rule.op !== 'empty' && typeof rule.value === 'string') next.value = rule.value.slice(0, 80);
    } else {
      continue;
    }
    if (rule.look && LOOKS.has(rule.look)) next.look = rule.look;
    if (rule.tone && TONES.has(rule.tone)) next.tone = rule.tone;
    if (rule.bold) next.bold = true;
    if (!next.look && !next.tone && !next.bold) continue;
    out.push(next);
  }
  return out;
}

function numeric(raw: unknown): number {
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') return Number(raw.replace(/,/g, ''));
  return Number.NaN;
}

function termValue(
  term: DeskRuleTerm | undefined,
  row: Record<string, unknown>,
  catalog: DeskFieldCatalog,
  formatters: DeskFieldFormatters,
): { raw: unknown; shown: string } | undefined {
  if (!term) return undefined;
  if ('number' in term) return { raw: term.number, shown: String(term.number) };
  if ('text' in term) return { raw: term.text, shown: term.text };
  const raw = readPath(row, term.field);
  return { raw, shown: formatFieldValue(catalogField(catalog, term.field), raw, row, formatters) };
}

function ruleMatches(
  rule: DeskStyleRule,
  part: DeskFieldPart,
  row: Record<string, unknown>,
  catalog: DeskFieldCatalog,
  formatters: DeskFieldFormatters,
): boolean {
  if (typeof rule.when === 'string') {
    const parsed = parseRule(rule.when, ruleFieldKeys(catalog));
    if (!parsed.ok || !parsed.ast) return false;
    const scalar = (key: string): RuleScalar => {
      const raw = readPath(row, key);
      return { num: numeric(raw), text: formatFieldValue(catalogField(catalog, key), raw, row, formatters) };
    };
    return evalRule(parsed.ast, { self: scalar(part.field), field: scalar });
  }
  if (!rule.op) return false;
  const selfRaw = readPath(row, part.field);
  const selfShown = formatFieldValue(catalogField(catalog, part.field), selfRaw, row, formatters);
  const left = termValue(rule.left, row, catalog, formatters) ?? { raw: selfRaw, shown: selfShown };
  if (rule.op === 'empty') return left.shown === '';
  const right = termValue(rule.right, row, catalog, formatters);
  if (!right) {
    if (rule.op === 'eq') return left.shown === (rule.value ?? '');
    if (rule.op === 'ne') return left.shown !== (rule.value ?? '');
    if (rule.op === 'contains') return left.shown.toLowerCase().includes((rule.value ?? '').toLowerCase());
    const parsedLeft = numeric(left.raw);
    const parsedRight = Number(rule.value);
    if (!Number.isFinite(parsedLeft) || !Number.isFinite(parsedRight)) return false;
    return rule.op === 'gt' ? parsedLeft > parsedRight : parsedLeft < parsedRight;
  }
  if (rule.op === 'eq') return left.shown === right.shown;
  if (rule.op === 'ne') return left.shown !== right.shown;
  if (rule.op === 'contains') return left.shown.toLowerCase().includes(right.shown.toLowerCase());
  const parsedLeft = numeric(left.raw);
  const parsedRight = numeric(right.raw);
  if (!Number.isFinite(parsedLeft) || !Number.isFinite(parsedRight)) return false;
  return rule.op === 'gt' ? parsedLeft > parsedRight : parsedLeft < parsedRight;
}

/** Base look, then the first matching rule's look, color, and bold. */
export function styleFor(
  part: DeskFieldPart,
  row: Record<string, unknown>,
  catalog: DeskFieldCatalog,
  formatters: DeskFieldFormatters = {},
): DeskPartStyle | undefined {
  const base = cleanStyle(part.style) ?? {};
  const rule = cleanRules(part.rules, catalog).find((item) => ruleMatches(item, part, row, catalog, formatters));
  const merged: DeskPartStyle = { ...base };
  if (rule?.look === 'text') delete merged.look;
  else if (rule?.look) merged.look = rule.look;
  if (rule?.tone === 'default') delete merged.tone;
  else if (rule?.tone) merged.tone = rule.tone;
  if (rule?.bold) merged.bold = true;
  return cleanStyle(merged);
}

function spanOf(text: string, style?: DeskPartStyle): DeskCellSpan {
  const span: DeskCellSpan = { text };
  if (style?.look) span.look = style.look;
  if (style?.tone) span.tone = style.tone;
  if (style?.size) span.size = style.size;
  if (style?.bold) span.bold = true;
  if (style?.place === 'right') span.place = 'right';
  if (style?.pad) span.pad = style.pad;
  return span;
}

export function spanClass(span: DeskCellSpan): string[] {
  const classes = ['desk-cell-span'];
  if (span.look) classes.push(`is-${span.look}`);
  if (span.tone) classes.push(`is-${span.tone}`);
  if (span.size) classes.push(`is-${span.size}`);
  if (span.bold) classes.push('is-bold');
  if (span.place === 'right') classes.push('is-end');
  return classes;
}

/** Inline padding only where a side differs from the default. */
export function spanStyle(span: DeskCellSpan): Record<string, string> | undefined {
  const pad = span.pad;
  if (!pad) return undefined;
  const top = pad.top ?? DESK_FIELD_PAD.top;
  const right = pad.right ?? DESK_FIELD_PAD.right;
  const bottom = pad.bottom ?? DESK_FIELD_PAD.bottom;
  const left = pad.left ?? DESK_FIELD_PAD.left;
  return { padding: `${top}px ${right}px ${bottom}px ${left}px` };
}

function cleanField(part: DeskCellPart, key: string, catalog: DeskFieldCatalog): DeskCellPart {
  if (!isFieldPart(part)) return key;
  const label = part.label?.trim();
  const style = cleanStyle(part.style);
  const rules = cleanRules(part.rules, catalog);
  if (!label && !style && rules.length === 0) return key;
  return { field: key, ...(label ? { label } : {}), ...(style ? { style } : {}), ...(rules.length ? { rules } : {}) };
}

function labeled(label: string | undefined, value: string): string {
  const text = label?.trim();
  if (!text || value === '') return value;
  return `${text}: ${value}`;
}

/** Blocks one layout column draws for a row. */
export function cellBlocks(
  column: DeskLayoutColumn,
  row: Record<string, unknown>,
  catalog: DeskFieldCatalog,
  formatters: DeskFieldFormatters = {},
): DeskCellBlock[] {
  const blocks: DeskCellBlock[] = [];
  const separator = column.separator ?? ' ';
  for (const line of column.lines) {
    let pieces: DeskCellSpan[] = [];
    const flush = (): void => {
      const kept = pieces.filter((piece) => piece.text !== '');
      pieces = [];
      if (kept.length === 0) return;
      const faced = kept.some((piece) => piece.look || piece.tone || piece.size || piece.bold || piece.place || piece.pad);
      if (!faced) {
        blocks.push({ kind: 'text', text: kept.map((piece) => piece.text).join(separator) });
        return;
      }
      blocks.push({ kind: 'line', spans: kept });
    };
    const pushText = (text: string, style?: DeskPartStyle): void => {
      if (text === '') return;
      pieces.push(spanOf(text, style));
    };
    for (const part of line) {
      const key = partFieldKey(part);
      const field = key ? catalogField(catalog, key) : undefined;
      if (key && field?.type === 'currency' && !(field.format && formatters[field.format])) {
        // The face's amount stays on this line; the other currency gets its own quiet line below.
        const money = moneyLines(readPath(row, key), moneyFromRow(field.moneyFrom, row), column.money ?? {});
        const text = labeled(isFieldPart(part) ? part.label : undefined, money.primary);
        pushText(text, isFieldPart(part) ? styleFor(part, row, catalog, formatters) : undefined);
        if (money.caption) {
          flush();
          blocks.push({ kind: 'line', spans: [{ text: money.caption, size: 'small', tone: 'muted' }] });
        }
        continue;
      }
      if (key) {
        const raw = readPath(row, key);
        const value = formatFieldValue(field, raw, row, formatters);
        const text = labeled(isFieldPart(part) ? part.label : undefined, value);
        pushText(text, isFieldPart(part) ? styleFor(part, row, catalog, formatters) : undefined);
        continue;
      }
      if (!isListPart(part)) continue;
      const all = listItems(row, part);
      const shown = all.slice(0, part.max);
      const more = all.length - shown.length;
      if (part.show === 'table') {
        flush();
        const caption = part.label?.trim();
        if (caption) blocks.push({ kind: 'text', text: caption });
        blocks.push({
          kind: 'table',
          headers: part.fields.map((key) => catalogField(catalog, key)?.label ?? key),
          rows: shown.map((item) =>
            part.fields.map((key) => formatFieldValue(catalogField(catalog, key), readPath(item, relativeKey(part.list, key)), item, formatters)),
          ),
          more,
        });
        continue;
      }
      if (part.show === 'lines') {
        flush();
        for (const item of shown) {
          const text = labeled(part.label, itemText(catalog, part, item, formatters));
          if (text) blocks.push({ kind: 'text', text });
        }
        if (more > 0) blocks.push({ kind: 'text', text: moreText(more) });
        continue;
      }
      const joined = shown.map((item) => itemText(catalog, part, item, formatters)).filter((text) => text !== '');
      const text = labeled(part.label, joined.join(part.show === 'comma' ? ', ' : ' '));
      pushText([text, moreText(more)].filter((item) => item !== '').join(' '));
    }
    flush();
  }
  return blocks;
}

export function blockLineCount(blocks: readonly DeskCellBlock[]): number {
  let lines = 0;
  for (const block of blocks) {
    if (block.kind === 'text' || block.kind === 'line') lines += 1;
    else lines += 1 + block.rows.length + (block.more > 0 ? 1 : 0);
  }
  return Math.max(1, lines);
}

export function blocksText(blocks: readonly DeskCellBlock[]): string {
  return blocks
    .map((block) => {
      if (block.kind === 'text') return block.text;
      if (block.kind === 'line') return block.spans.map((span) => span.text).join(' ');
      const rows = block.rows.map((cells) => cells.filter((cell) => cell !== '').join(', ')).join('; ');
      return [rows, moreText(block.more)].filter((item) => item !== '').join(' ');
    })
    .filter((text) => text !== '')
    .join(' / ');
}

function editorKind(type: DeskFieldType | undefined): DeskEditorKind | undefined {
  if (type === 'currency') return 'currency';
  if (type === 'number') return 'number';
  if (type === 'date') return 'date';
  return undefined;
}

/** Field keys a part reads, including fields a rule compares. */
export function partKeys(part: DeskCellPart, catalog?: DeskFieldCatalog): string[] {
  const key = partFieldKey(part);
  if (!key) return isListPart(part) ? part.fields : [];
  const extra: string[] = [];
  const add = (field: string): void => {
    if (field && field !== key && !extra.includes(field)) extra.push(field);
  };
  // A currency amount needs its row's currency and rate to read right.
  if (catalog) for (const moneyKey of moneyFromKeys(catalogField(catalog, key)?.moneyFrom)) add(moneyKey);
  if (isFieldPart(part)) {
    const allowed = catalog ? ruleFieldKeys(catalog) : [];
    for (const rule of part.rules ?? []) {
      if (rule.left && 'field' in rule.left) add(rule.left.field);
      if (rule.right && 'field' in rule.right) add(rule.right.field);
      if (catalog && typeof rule.when === 'string') for (const field of parseRule(rule.when, allowed).fields) add(field);
    }
  }
  return [key, ...extra];
}

export function lockedColumns(catalog: DeskFieldCatalog, pin: 'start' | 'end'): DeskLockedColumn[] {
  return (catalog.locked ?? []).filter((column) => (column.pin ?? 'start') === pin);
}

export function isLockedColumn(catalog: DeskFieldCatalog, id: string): boolean {
  return (catalog.locked ?? []).some((column) => column.id === id);
}

/** Locked start columns, the user's columns, then locked end columns. */
export function withLockedColumns(layout: DeskGridLayout, catalog: DeskFieldCatalog): DeskGridLayout {
  const own = layout.columns.filter((column) => !isLockedColumn(catalog, column.id));
  return { ...layout, columns: [...lockedColumns(catalog, 'start'), ...own, ...lockedColumns(catalog, 'end')] };
}

/** Drop fields the catalog no longer has, columns left empty, and any copy of a locked column. */
export function cleanLayout(layout: DeskGridLayout, catalog: DeskFieldCatalog): DeskGridLayout {
  const known = (key: string): boolean => Boolean(catalogField(catalog, key));
  const columns: DeskLayoutColumn[] = [];
  for (const column of layout.columns) {
    if (isLockedColumn(catalog, column.id)) continue;
    const lines: DeskCellPart[][] = [];
    for (const line of column.lines) {
      const parts: DeskCellPart[] = [];
      for (const part of line) {
        const key = partFieldKey(part);
        if (key) {
          if (known(key) && !manyRelationOf(catalog, key)) parts.push(cleanField(part, key, catalog));
          continue;
        }
        if (!isListPart(part)) continue;
        const relation = catalogRelation(catalog, part.list);
        if (!relation?.many) continue;
        const fields = part.fields.filter((key) => known(key) && key.startsWith(`${part.list}.`));
        if (fields.length === 0) continue;
        const label = part.label?.trim();
        const cleaned: DeskListPart = {
          list: part.list,
          fields,
          show: part.show,
          max: Math.min(Math.max(1, part.max), listMaxItems(relation)),
        };
        if (label) cleaned.label = label;
        parts.push(cleaned);
      }
      if (parts.length > 0) lines.push(parts);
    }
    if (lines.length === 0) continue;
    const keys = lines.flat().flatMap((part) => partKeys(part, catalog));
    const sortField = column.sortField && keys.includes(column.sortField) && fieldSortable(catalog, column.sortField) ? column.sortField : null;
    const filterField = column.filterField && keys.includes(column.filterField) && fieldFilterable(catalog, column.filterField) ? column.filterField : null;
    const kept: DeskLayoutColumn = { ...column, lines, sortField, filterField };
    if (column.hidden === true) kept.hidden = true;
    else delete kept.hidden;
    if (column.spill === true) kept.spill = true;
    else delete kept.spill;
    if (column.repeats === 'hide' || column.repeats === 'dim') kept.repeats = column.repeats;
    else delete kept.repeats;
    const money = cleanMoneyView(column.money);
    if (money) kept.money = money;
    else delete kept.money;
    columns.push(kept);
  }
  const out: DeskGridLayout = { ...layout, columns };
  delete out.view;
  delete out.hideActions;
  delete out.note;
  const note = typeof layout.note === 'string' ? layout.note.trim().slice(0, DESK_LAYOUT_NOTE_MAX) : '';
  if (note) out.note = note;
  const view = cleanView(layout.view, withLockedColumns(out, catalog).columns);
  if (view) out.view = view;
  if (layout.hideActions === true && layout.id !== DESK_DEFAULT_LAYOUT_ID) out.hideActions = true;
  return out;
}

/** Keep only known choices. Company on top is the default, so only `document` is stored. */
export function cleanMoneyView(view: DeskMoneyView | undefined): DeskMoneyView | undefined {
  if (!view || typeof view !== 'object') return undefined;
  const next: DeskMoneyView = {};
  if (view.face === 'document') next.face = 'document';
  if (view.symbol === 'always' || view.symbol === 'never') next.symbol = view.symbol;
  if (view.second === false) next.second = false;
  return next.face || next.symbol || next.second === false ? next : undefined;
}

const VIEW_FILTER_CAP = 200;

/**
 * Keep a saved sort only on a column that can sort, and a saved filter only on a column that can
 * filter. What each column allows decides what the view can save.
 */
export function cleanView(view: DeskGridLayoutView | undefined, columns: readonly DeskLayoutColumn[]): DeskGridLayoutView | undefined {
  if (!view || typeof view !== 'object') return undefined;
  const byId = new Map(columns.map((column) => [column.id, column]));
  const next: DeskGridLayoutView = {};
  const sort = view.sort;
  if (sort && typeof sort.column === 'string' && byId.get(sort.column)?.sortField) {
    next.sort = { column: sort.column, direction: sort.direction === 'asc' ? 'asc' : 'desc' };
  }
  const filters: Record<string, string> = {};
  for (const [id, raw] of Object.entries(view.filters ?? {})) {
    if (typeof raw !== 'string' || !byId.get(id)?.filterField) continue;
    const text = raw.trim().slice(0, VIEW_FILTER_CAP);
    if (text) filters[id] = text;
  }
  if (Object.keys(filters).length > 0) next.filters = filters;
  const panel = cleanPanel(view.panel);
  if (panel) next.panel = panel;
  const options = cleanOptions(view.options);
  if (options) next.options = options;
  return next.sort || next.filters || next.panel || next.options ? next : undefined;
}

/** Saved filter-panel values stay small enough for prefs and layout files. */
const VIEW_PANEL_CAP = 20000;

/** Plain JSON only. The page checks the keys and values when it reads them back. */
function cleanPanel(panel: unknown): Record<string, unknown> | undefined {
  if (!panel || typeof panel !== 'object' || Array.isArray(panel)) return undefined;
  let text: string;
  try {
    text = JSON.stringify(panel);
  } catch {
    return undefined;
  }
  if (!text || text === '{}' || text.length > VIEW_PANEL_CAP) return undefined;
  return JSON.parse(text) as Record<string, unknown>;
}

function cleanOptions(options: unknown): Record<string, boolean> | undefined {
  if (!options || typeof options !== 'object' || Array.isArray(options)) return undefined;
  const next: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(options)) if (typeof value === 'boolean') next[key] = value;
  return Object.keys(next).length > 0 ? next : undefined;
}

export function layoutColumnInfo(column: DeskLayoutColumn, catalog: DeskFieldCatalog): DeskColumnQueryInfo {
  const uses: DeskFieldUse[] = [];
  for (const part of column.lines.flat()) {
    if (isListPart(part)) {
      for (const field of part.fields) uses.push({ key: field, limit: part.max });
      continue;
    }
    for (const key of partKeys(part, catalog)) uses.push({ key });
  }
  const filterField = column.filterField ?? null;
  const field = filterField ? catalogField(catalog, filterField) : undefined;
  return {
    uses,
    sortField: column.sortField ?? null,
    filterField,
    filterType: field?.filterAs ?? field?.type ?? 'text',
    ...(field?.options?.length ? { filterOptions: field.options } : {}),
  };
}

/** Grid columns for a designed layout. */
export function layoutColumns(
  layout: DeskGridLayout,
  catalog: DeskFieldCatalog,
  formatters: DeskFieldFormatters = {},
): DeskColumn[] {
  return withLockedColumns(layout, catalog).columns.map((column) => {
    const info = layoutColumnInfo(column, catalog);
    const lock = (catalog.locked ?? []).find((item) => item.id === column.id);
    const blocks = (row: DeskGridRow): DeskCellBlock[] => cellBlocks(column, row, catalog, formatters);
    const type = editorKind(info.filterField ? info.filterType : undefined);
    const out: DeskColumn = {
      id: column.id,
      header: column.header,
      sortable: info.sortField !== null,
      blocks,
      lineCount: (row) => blockLineCount(blocks(row)),
      fields: info.uses.map((use) => use.key),
    };
    if (column.width) out.width = column.width;
    if (column.align) out.align = column.align;
    if (type) out.type = type;
    if (info.filterOptions) out.filterChoices = info.filterOptions;
    if (column.hidden && !lock) out.defaultHidden = true;
    if (column.spill) out.spill = true;
    if (column.repeats) out.repeats = column.repeats;
    if (column.money) out.moneyView = column.money;
    if (lock) {
      out.locked = true;
      out.pin = lock.pin ?? 'start';
    }
    return out;
  });
}

function strip(field: string): string {
  return field.startsWith('$') && field.endsWith('$') ? field.slice(1, -1) : field;
}

/** The developer's visible columns as an editable layout. */
export function layoutFromColumns(columns: readonly DeskColumn[], catalog: DeskFieldCatalog, name: string): DeskGridLayout {
  const out: DeskLayoutColumn[] = [];
  for (const column of columns) {
    if (column.visible && !column.visible()) continue;
    if (isLockedColumn(catalog, column.id)) continue;
    const info = defaultColumnInfo(column, catalog);
    let keys = info.uses.map((use) => use.key).filter((key) => catalogField(catalog, key) && !manyRelationOf(catalog, key));
    if (keys.length === 0 && catalogField(catalog, column.id)?.virtual) keys = [column.id];
    if (keys.length === 0) continue;
    const parts: DeskCellPart[] = keys;
    const lines: DeskCellPart[][] = [parts];
    if (column.captionField && catalogField(catalog, column.captionField)) {
      lines.push([{ field: column.captionField, style: { tone: 'muted', size: 'small' } }]);
    }
    const layoutColumn: DeskLayoutColumn = {
      id: column.id,
      header: column.header,
      lines,
      sortField: info.sortField && keys.includes(info.sortField) && fieldSortable(catalog, info.sortField) ? info.sortField : null,
      filterField: info.filterField && keys.includes(info.filterField) && fieldFilterable(catalog, info.filterField) ? info.filterField : null,
    };
    if (column.width) layoutColumn.width = column.width;
    if (column.align) layoutColumn.align = column.align;
    if (column.defaultHidden) layoutColumn.hidden = true;
    if (column.repeats) layoutColumn.repeats = column.repeats;
    if (column.spill) layoutColumn.spill = true;
    out.push(layoutColumn);
  }
  return { id: newLayoutId(), name, kind: 'menu', columns: out };
}

/** The list's built-in layout. Pages ship this; a saved copy with the same id is the user's edit. */
export function shippedLayout(columns: readonly DeskColumn[], catalog: DeskFieldCatalog): DeskGridLayout {
  return { ...layoutFromColumns(columns, catalog, 'Default'), id: DESK_DEFAULT_LAYOUT_ID };
}

function newLayoutId(): string {
  return `layout-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** What a developer column means in catalog terms. */
export function defaultColumnInfo(column: DeskColumn, catalog: DeskFieldCatalog): DeskColumnQueryInfo {
  const relationKey = column.relation ? `${column.relation.as}.${column.relation.field}` : null;
  const keys =
    column.fields ??
    (relationKey && catalogField(catalog, relationKey) ? [relationKey] : catalogField(catalog, column.id) ? [column.id] : []);
  const sortField = column.sortable === false ? null : column.sortField ?? relationKey ?? keys[0] ?? column.id;
  let filterField: string | null = relationKey ?? keys[0] ?? column.id;
  if (column.filter?.includeAs) filterField = `${column.filter.includeAs}.${column.filter.includeField ?? 'name'}`;
  else if (column.filter?.field) filterField = strip(column.filter.field);
  const filterType: DeskFieldType =
    column.type === 'number' ? 'number' : column.type === 'currency' ? 'currency' : column.type === 'date' ? 'date' : 'text';
  return { uses: keys.map((key) => ({ key })), sortField, filterField, filterType };
}

/** Field keys a developer's columns read, for the Default layout. */
export function defaultLayoutFields(columns: readonly DeskColumn[], catalog: DeskFieldCatalog): string[] {
  return columns.flatMap((column) => defaultColumnInfo(column, catalog).uses.map((use) => use.key));
}

/** The selection tree for these uses, plus `catalog.always`. */
export function selectionOf(uses: readonly DeskFieldUse[], catalog: DeskFieldCatalog): DeskFieldSelection {
  const root: DeskFieldSelection = { fields: [], relations: {} };
  const all: DeskFieldUse[] = [...catalog.always.map((key) => ({ key })), ...uses];
  // Currency and rate keys a currency field names are fetched even when the catalog does not list them.
  const moneyKeys = new Set(catalog.fields.flatMap((item) => moneyFromKeys(item.moneyFrom)));
  for (const use of all) {
    const field = catalogField(catalog, use.key);
    if (field?.virtual) continue;
    if (!field && !catalog.always.includes(use.key) && !moneyKeys.has(use.key)) continue;
    const segments = use.key.split('.');
    let node = root;
    for (let i = 0; i < segments.length - 1; i += 1) {
      const segment = segments[i] ?? '';
      const relation = catalogRelation(catalog, segments.slice(0, i + 1).join('.'));
      let child = node.relations[segment];
      if (!child) {
        child = { fields: [], relations: {} };
        if (relation?.many) child.many = true;
        node.relations[segment] = child;
      }
      if (child.many) {
        const cap = listMaxItems(relation);
        const wanted = Math.min(use.limit ?? cap, cap);
        child.limit = Math.max(child.limit ?? 0, wanted);
      }
      node = child;
    }
    const name = segments[segments.length - 1] ?? '';
    if (name && !node.fields.includes(name)) node.fields.push(name);
  }
  return root;
}
