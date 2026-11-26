/**
 * Settings of a step (or of one item in a list setting), described as data. `StepForm` draws them
 * with the widget for each kind, so every step gets pickers instead of typed names.
 */

export type ColumnsOf = 'from' | 'with' | 'in' | 'self';

export interface FieldChoice {
  value: string;
  label: string;
  help?: string;
}

export interface StudioField {
  key: string;
  label: string;
  kind:
    | 'text'
    /** A new column's name: letters, digits and _, offered from the label. */
    | 'name'
    | 'number'
    | 'bool'
    | 'choice'
    | 'stage'
    | 'column'
    | 'columns'
    /** A value: a column, or a formula over the columns. */
    | 'formula'
    /** A yes/no condition, built from blocks or written as a formula. */
    | 'condition'
    /** A sort order: columns or formulas, each up or down. */
    | 'order'
    | 'list'
    /** Column → formula pairs (union parts set values). */
    | 'map';
  hint?: string;
  placeholder?: string;
  options?: FieldChoice[];
  /** Whose columns the pickers offer: the step read, a joined step, or this step. */
  columnsOf?: ColumnsOf;
  /** List items' fields. */
  of?: StudioField[];
  /** A new list item. */
  blank?: () => Record<string, unknown>;
  /** One line that sums up a list item when it is folded. */
  summary?: (item: Record<string, unknown>) => string;
  optional?: boolean;
  /** `formula`: start as a column picker; a formula is one click away. */
  preferColumn?: boolean;
  /** `name`: the name to give while the user has not typed one, from the other settings. */
  suggest?: (target: Record<string, unknown>) => string;
  /** Folded under "More options" until opened. */
  advanced?: boolean;
  /** Shown only when this holds for the object being edited. */
  when?: (target: Record<string, unknown>) => boolean;
}

/** Read a `measure.fn` style key. */
export function readKey(target: Record<string, unknown>, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>(
      (value, part) =>
        value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined,
      target,
    );
}

/** Set a setting. An optional one left empty is dropped, so the definition stays short. */
export function writeKey(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
  optional = false,
): void {
  const parts = key.split('.');
  let current = target;
  for (const part of parts.slice(0, -1)) {
    if (!current[part] || typeof current[part] !== 'object') current[part] = {};
    current = current[part] as Record<string, unknown>;
  }
  const last = parts[parts.length - 1]!;
  const empty =
    value === '' ||
    value === undefined ||
    value === null ||
    (Array.isArray(value) && value.length === 0);
  if (empty && optional) delete current[last];
  else current[last] = value;
}

export function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}
