import type { DeskEditorKind } from './types';

/** Which fill-in form a column header shows. Text covers names, checks, and lookups. */
export type HeaderFilterKind = 'number' | 'date' | 'text';

export type CompareOp = '>' | '>=' | '<' | '<=' | '=' | '!=';

export type TextFilterMode = 'contains' | 'equals' | 'starts' | 'ends' | 'notEqual' | 'not' | 'in' | 'notIn';

export interface CompareDraft {
  leftOp: CompareOp;
  left: string;
  rightOp: CompareOp;
  right: string;
}

export interface TextDraft {
  mode: TextFilterMode;
  value: string;
}

export const COMPARE_OPS: { id: CompareOp; label: string; short: string }[] = [
  { id: '>', label: 'Greater than', short: 'More than' },
  { id: '>=', label: 'Greater or equal', short: 'At least' },
  { id: '<', label: 'Less than', short: 'Less than' },
  { id: '<=', label: 'Less or equal', short: 'At most' },
  { id: '=', label: 'Equals', short: 'Equals' },
  { id: '!=', label: 'Not equal', short: 'Not equal' },
];

export const TEXT_MODES: { id: TextFilterMode; label: string }[] = [
  { id: 'contains', label: 'Contains' },
  { id: 'equals', label: 'Equals' },
  { id: 'starts', label: 'Starts with' },
  { id: 'ends', label: 'Ends with' },
  { id: 'notEqual', label: 'Does not equal' },
  { id: 'not', label: 'Does not contain' },
  { id: 'in', label: 'Is one of' },
  { id: 'notIn', label: 'Is none of' },
];

/** Text modes that take a comma-separated list. */
export function isListMode(mode: TextFilterMode): boolean {
  return mode === 'in' || mode === 'notIn';
}

/** Whole periods a date chip sets. The same words work when typed in the filter box. */
export const DATE_FILTER_PHRASES = [
  'today',
  'yesterday',
  'tomorrow',
  'this week',
  'last week',
  'next week',
  'this month',
  'last month',
  'next month',
  'this quarter',
  'last quarter',
  'this year',
  'last year',
  'next year',
  'this fy',
  'last fy',
  'next fy',
  '-15 days',
  '-3 months',
] as const;

const OP_PATTERN = />=|<=|=<|!=|<>|>|<|=/g;

const TEXT_PREFIXES: { prefix: string; mode: TextFilterMode }[] = [
  { prefix: '!in:', mode: 'notIn' },
  { prefix: 'in:', mode: 'in' },
  { prefix: '!~', mode: 'not' },
  { prefix: '!=', mode: 'notEqual' },
  { prefix: '<>', mode: 'notEqual' },
  { prefix: '^=', mode: 'starts' },
  { prefix: '$=', mode: 'ends' },
  { prefix: '=', mode: 'equals' },
];

export function headerFilterKind(type: DeskEditorKind | undefined): HeaderFilterKind {
  if (type === 'number' || type === 'currency') return 'number';
  if (type === 'date') return 'date';
  return 'text';
}

export function emptyCompareDraft(): CompareDraft {
  return { leftOp: '>', left: '', rightOp: '<=', right: '' };
}

/** Turn the two blanks into the filter text the column box already understands. */
export function composeCompareFilter(draft: CompareDraft): string {
  const left = draft.left.trim();
  const right = draft.right.trim();
  if (left && right && draft.leftOp === '>=' && draft.rightOp === '<=') return `${left}..${right}`;
  const parts: string[] = [];
  if (left) parts.push(`${draft.leftOp} ${left}`);
  if (right) parts.push(`${draft.rightOp} ${right}`);
  return parts.join(' ');
}

/** Read a typed comparison back into the two blanks. An unfinished side stays empty. */
export function readCompareFilter(raw: string): CompareDraft {
  const text = raw.trim();
  const draft = emptyCompareDraft();
  if (!text) return draft;
  if (text.includes('..')) {
    const [left, right] = text.split('..');
    return { leftOp: '>=', left: (left ?? '').trim(), rightOp: '<=', right: (right ?? '').trim() };
  }
  const found: { op: CompareOp; index: number; end: number }[] = [];
  OP_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = OP_PATTERN.exec(text))) {
    found.push({ op: asCompareOp(match[0]), index: match.index, end: match.index + match[0].length });
  }
  const first = found[0];
  if (!first || text.slice(0, first.index).trim() !== '') {
    draft.leftOp = '=';
    draft.left = text;
    return draft;
  }
  const second = found[1];
  draft.leftOp = first.op;
  draft.left = text.slice(first.end, second ? second.index : text.length).trim();
  if (second) {
    draft.rightOp = second.op;
    draft.right = text.slice(second.end).trim();
  }
  return draft;
}

export function composeTextFilter(mode: TextFilterMode, value: string): string {
  const text = value.trim();
  if (!text) return '';
  if (mode === 'contains') return text;
  const prefix = TEXT_PREFIXES.find((item) => item.mode === mode)?.prefix ?? '=';
  return `${prefix} ${text}`;
}

export function readTextFilter(raw: string): TextDraft {
  const text = raw.trim();
  for (const item of TEXT_PREFIXES) {
    if (!text.toLowerCase().startsWith(item.prefix)) continue;
    return { mode: item.mode, value: text.slice(item.prefix.length).trim() };
  }
  return { mode: 'contains', value: text };
}

function asCompareOp(op: string): CompareOp {
  if (op === '=<') return '<=';
  if (op === '<>') return '!=';
  if (op === '>' || op === '>=' || op === '<' || op === '<=' || op === '=' || op === '!=') return op;
  return '=';
}

/** A short sentence for a filter, such as "Status equals active" or "Amount greater than 200 and less or equal 500". */
export function describeFilter(header: string, kind: HeaderFilterKind, raw: string): string {
  const text = raw.trim();
  if (!text) return `${header}: any`;
  if (kind === 'text') {
    const draft = readTextFilter(text);
    const mode = TEXT_MODES.find((item) => item.id === draft.mode)?.label.toLowerCase() ?? 'contains';
    if (isListMode(draft.mode)) {
      const values = draft.value.split(',').map((value) => value.trim()).filter(Boolean);
      return `${header} ${mode} ${values.join(', ')}`;
    }
    return `${header} ${mode} ${draft.value}`;
  }
  OP_PATTERN.lastIndex = 0;
  const opFirst = OP_PATTERN.exec(text)?.index === 0;
  if (!opFirst && !text.includes('..')) return `${header} is ${text}`;
  const draft = readCompareFilter(text);
  const opLabel = (op: CompareOp): string => COMPARE_OPS.find((item) => item.id === op)?.label.toLowerCase() ?? op;
  const parts: string[] = [];
  if (draft.left) parts.push(`${opLabel(draft.leftOp)} ${draft.left}`);
  if (draft.right) parts.push(`${opLabel(draft.rightOp)} ${draft.right}`);
  return `${header} ${parts.join(' and ')}`;
}

/** One value of a column with fixed values (an enum), for a pick-list filter. */
export interface FilterChoice {
  value: string;
  label: string;
}

/** The choices an `in:` filter names, by value or label, ignoring case and quotes. */
export function readChoiceFilter(raw: string, choices: readonly FilterChoice[]): Set<string> {
  const text = raw.trim();
  if (!/^in:/i.test(text)) return new Set();
  const wanted = new Set(
    text
      .slice(3)
      .split(',')
      .map((part) => part.trim().replace(/^"(.*)"$/, '$1').toLowerCase())
      .filter(Boolean),
  );
  return new Set(choices.filter((choice) => wanted.has(choice.value.toLowerCase()) || wanted.has(choice.label.toLowerCase())).map((choice) => choice.value));
}

/** The filter text for the ticked choices. None or all ticked is no filter. */
export function composeChoiceFilter(picked: ReadonlySet<string>, choices: readonly FilterChoice[]): string {
  const chosen = choices.filter((choice) => picked.has(choice.value));
  if (chosen.length === 0 || chosen.length === choices.length) return '';
  return `in: ${chosen.map((choice) => choice.label).join(', ')}`;
}
