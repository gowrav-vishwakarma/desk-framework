import type { DeskIssue } from '../form/issues';
import type { DeskSetting } from '../grid/settings';

/** Values of a filter. The report decides the keys and what they hold. */
export type DeskFilterValues = Record<string, unknown>;

/** Helpers a phrase rule can use. `label(key)` is the field's label. */
export interface DeskPhraseContext {
  label: (key: string) => string;
}

/**
 * One piece of the sentence. Rules run in order, and each one whose `when` passes adds its text.
 * `when` sees every value, so a rule can depend on several fields.
 * A string may hold `{key}` placeholders, filled from the value's display text.
 */
export interface DeskPhraseRule<V extends DeskFilterValues = DeskFilterValues> {
  id: string;
  when?: (values: V) => boolean;
  text: string | ((values: V, ctx: DeskPhraseContext) => string);
}

/** What a report gives the filter panel. */
export interface DeskFilterSpec<V extends DeskFilterValues = DeskFilterValues> {
  /** Settings, drawn two to a row. */
  fields: DeskSetting[];
  defaults: () => V;
  phrases: DeskPhraseRule<V>[];
  validate?: (values: V) => DeskIssue[];
  /** A field changed in the draft. The report may adjust other values, such as clearing a dependent field. */
  onChange?: (values: V, key: string) => void;
  /** Section title shown above the fields. */
  title?: string;
  /** How the values go into a saved layout tab and come back. See `freezeDeskFilter`. */
  saved?: DeskFilterSaved<V>;
}

/** A named date range, such as "This financial year". `range` is worked out when the tab opens. */
export interface DeskFilterPeriod {
  id: string;
  label: string;
  range: () => { from: string; to: string };
}

/**
 * Saved-layout rules for a filter. Every field key is saved unless listed in `skip`.
 * With `period`, a date pair that matches one of the named ranges is saved as that name, so a
 * tab saved as "This financial year" still means this year next year.
 */
export interface DeskFilterSaved<V extends DeskFilterValues = DeskFilterValues> {
  period?: { from: keyof V & string; to: keyof V & string; choices: () => DeskFilterPeriod[] };
  skip?: readonly (keyof V & string)[];
  /** Runs on values read back from a layout, after they are merged onto `defaults()`. Drop what no longer applies. */
  restore?: (values: V) => V;
}
