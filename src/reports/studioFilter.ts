import { deskPeriodPhrase, deskValue } from '../filter/describe';
import type { DeskFilterSpec, DeskFilterValues, DeskPhraseRule } from '../filter/types';
import type { DeskSetting } from '../grid/settings';
import type { DeskLookupConfig } from '../grid/types';
import { lookupPreset } from './lookupPresets';
import { fyPeriods } from './periods';
import { txt } from './text';
import type { Rdl2Param, Rdl2Report } from './language';
import { lookupChoices } from './studioApi';

type Rec = Record<string, unknown>;

/** Date words a parameter default may use, as the backend reads them. */
export function dateWord(word: unknown, yearStart: string, today: string): string {
  const year = Number(yearStart.slice(0, 4));
  const fyEnd = `${year + 1}-03-31`;
  if (word === 'today') return today;
  if (word === 'fyStart') return yearStart;
  if (word === 'fyEnd') return fyEnd;
  if (word === 'fyToDate') return today < fyEnd ? today : fyEnd;
  if (word === 'monthStart') return `${today.slice(0, 8)}01`;
  return typeof word === 'string' ? word : '';
}

/**
 * The app's own lookup when the input names a preset (the party, item or salesman box people know
 * from vouchers), else a plain list of the chosen model and field.
 */
function lookupOf(param: Rdl2Param, lookup: StudioFilterInput['lookup']): DeskLookupConfig {
  const preset = param.lookup?.preset && lookup ? lookup(param.lookup.preset) : null;
  if (preset) return preset;
  const source = param.lookup ?? { model: 'Branch', label: 'name' };
  return {
    labelKey: 'label',
    valueKey: 'value',
    minChars: 0,
    columns: [{ id: 'label', header: param.label, field: 'label' }],
    fetch: async (query) => {
      const rows = await lookupChoices({ model: source.model, label: source.label, ...(source.value ? { value: source.value } : {}), query });
      return rows.map((row) => ({ id: row.value, value: row.value, label: row.label, name: row.label }));
    },
  };
}

function settingOf(param: Rdl2Param, lookup: StudioFilterInput['lookup']): DeskSetting {
  const base = { key: param.id, label: param.label, ...(param.required ? { required: true } : {}) };
  switch (param.type) {
    case 'date':
      return { ...base, editor: 'date' };
    case 'number':
      return { ...base, editor: 'number' };
    case 'boolean':
      return { ...base, editor: 'select', options: [{ label: 'Any', value: '' }, { label: 'Yes', value: 'true' }, { label: 'No', value: 'false' }] };
    case 'select':
      return { ...base, editor: 'select', options: [{ label: 'Any', value: '' }, ...(param.options ?? []).map((o) => ({ label: o.label, value: String(o.value) }))] };
    case 'lookup':
      return { ...base, editor: param.multi ? 'chips' : 'lookup', lookup: lookupOf(param, lookup) };
    default:
      return { ...base, editor: 'text' };
  }
}

/** The text a value shows in the sentence: names for picked records, the label for a choice. */
function shown(param: Rdl2Param, value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (Array.isArray(value)) return value.map((item) => shown(param, item)).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    const row = value as Rec;
    const key = lookupPreset(param.lookup?.preset)?.label;
    return (key ? txt(row[key]) : '') || txt(row.label) || txt(row.name);
  }
  if (param.type === 'select') return param.options?.find((o) => String(o.value) === txt(value))?.label ?? txt(value);
  if (param.type === 'boolean') return value === 'true' ? 'yes' : value === 'false' ? 'no' : '';
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

export interface StudioFilterInput {
  defaults: () => DeskFilterValues;
  period: () => { yearStart: string; today: string };
  /** How the pages are cut, at the end of the sentence (`· 10 party groups a page`). Empty: left out. */
  paging?: () => string;
  /** A name before the sentence, in bold (`TEST: Showing …`), such as a saved pivot's description. Empty: left out. */
  heading?: () => string;
  /** The app's lookup for a preset (`ReportsPlace.lookup`), or null for a plain list. */
  lookup?: (preset: string) => DeskLookupConfig | null;
}

/**
 * A report's parameters as a filter panel: one field each, the `from`/`to` dates kept as period
 * words in saved tabs, and a sentence with every chosen value in bold.
 */
export function studioFilterSpec(report: Rdl2Report, input: StudioFilterInput): DeskFilterSpec<DeskFilterValues> {
  const fields = report.params.map((param) => settingOf(param, input.lookup));
  const from = report.params.find((p) => p.type === 'date' && p.id === 'from');
  const to = report.params.find((p) => p.type === 'date' && p.id === 'to');
  const heading = input.heading;
  const phrases: DeskPhraseRule<DeskFilterValues>[] = [
    { id: 'lead', text: () => (heading?.() ? `${deskValue(heading())}: Showing ${report.title}` : `Showing ${report.title}`) },
  ];
  for (const param of report.params) {
    if (param === from || param === to) continue;
    phrases.push({
      id: param.id,
      when: (v) => shown(param, v[param.id]) !== '',
      text: (v) => `${param.label.toLowerCase()} ${deskValue(shown(param, v[param.id]))}`,
    });
  }
  if (from && to) {
    phrases.push({ id: 'period', text: (v) => deskPeriodPhrase(txt(v.from), txt(v.to), { ...input.period(), yearWord: 'FY' }) });
  }
  const paging = input.paging;
  if (paging) phrases.push({ id: 'paging', when: () => paging() !== '', text: () => paging() });
  return {
    title: `${report.title} filter`,
    fields,
    defaults: input.defaults,
    ...(from && to ? { saved: { period: { from: 'from', to: 'to', choices: () => fyPeriods(input.period) } } } : {}),
    validate: (v) =>
      report.params
        .filter((p) => p.required && (v[p.id] === null || v[p.id] === undefined || v[p.id] === '' || (Array.isArray(v[p.id]) && (v[p.id] as unknown[]).length === 0)))
        .map((p) => ({ fieldId: p.id, message: `${p.label} is required` })),
    phrases,
  };
}

/** Starting values: each parameter's default, date words turned into dates. */
export function studioDefaults(report: Rdl2Report, period: { yearStart: string; today: string }): DeskFilterValues {
  const out: DeskFilterValues = {};
  for (const param of report.params) {
    if (param.type === 'date') out[param.id] = dateWord(param.default, period.yearStart, period.today);
    else if (param.type === 'lookup') out[param.id] = param.multi ? [] : null;
    else out[param.id] = typeof param.default === 'boolean' ? String(param.default) : txt(param.default);
  }
  return out;
}

/** Filter values as the runner takes them: ids for picked records, typed values for the rest. */
export function studioParams(report: Rdl2Report, values: DeskFilterValues): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const id = (item: unknown): unknown => (item && typeof item === 'object' ? ((item as Rec).value ?? (item as Rec).id) : item);
  for (const param of report.params) {
    const value = values[param.id];
    if (param.type === 'lookup') out[param.id] = Array.isArray(value) ? value.map(id) : value ? id(value) : null;
    else if (param.type === 'boolean') out[param.id] = value === 'true' ? true : value === 'false' ? false : null;
    else if (param.type === 'number') out[param.id] = value === '' || value === null || value === undefined ? null : Number(value);
    else out[param.id] = value === '' ? null : value;
  }
  return out;
}
