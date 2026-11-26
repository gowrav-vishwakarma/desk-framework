import type { Rdl2Report, Rdl2Stage, Rdl2StageBase } from '../language';
import { studioStep, studioStepInfos } from './studioSteps';
import type { CatalogModel } from '../studioApi';
import type { FieldChoice, StudioField } from './fields';
import { suggestName } from './naming';
import type { IconName } from './icons';

/** A core step kind, or one a project added (`defineStudioStep`). */
export type StepKind = string;
export type StepGroup = 'Get data' | 'Narrow rows' | 'Add columns' | 'Summarize' | 'Combine';

export interface StepKindInfo {
  kind: StepKind;
  label: string;
  group: StepGroup;
  icon: IconName;
  /** What it does, in one line. */
  help: string;
  /** A typical use, shown in the gallery. */
  example: string;
  /** Settings; the source step has its own editor and lists none. */
  fields: StudioField[];
  make: (id: string, from: string | null) => Rdl2Stage;
}

const AGGREGATES: FieldChoice[] = [
  { value: 'sum', label: 'Sum' },
  { value: 'count', label: 'Count rows' },
  { value: 'countDistinct', label: 'Count different values' },
  { value: 'avg', label: 'Average' },
  { value: 'min', label: 'Smallest' },
  { value: 'max', label: 'Largest' },
  { value: 'first', label: 'First (by an order)' },
  { value: 'last', label: 'Last (by an order)' },
  { value: 'list', label: 'List the values' },
];

export const WINDOWS: FieldChoice[] = [
  { value: 'runningSum', label: 'Running total', help: 'Adds up the value row after row.' },
  { value: 'rowNumber', label: 'Row number', help: '1, 2, 3… in the order.' },
  { value: 'rank', label: 'Rank', help: 'Equal values share a rank, then it skips: 1, 1, 3.' },
  { value: 'denseRank', label: 'Rank without gaps', help: 'Equal values share a rank: 1, 1, 2.' },
  { value: 'previous', label: 'Value on the row before' },
  { value: 'next', label: 'Value on the row after' },
  { value: 'partitionSum', label: 'Total of the group', help: 'Every row gets its group’s total.' },
  { value: 'partitionCount', label: 'Rows in the group' },
  { value: 'share', label: '% of the group total' },
  { value: 'list', label: 'All values of the group' },
];

export const WINDOW_NEEDS_VALUE = new Set([
  'runningSum',
  'previous',
  'next',
  'partitionSum',
  'share',
  'list',
]);
export const WINDOW_NEEDS_ORDER = new Set([
  'runningSum',
  'rowNumber',
  'rank',
  'denseRank',
  'previous',
  'next',
]);

export function choiceLabel(choices: readonly FieldChoice[], value: unknown): string {
  return (
    choices.find((choice) => choice.value === value)?.label ??
    (typeof value === 'string' ? value : '')
  );
}

const str = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : '';

const ON = (other: 'with' | 'in'): StudioField => ({
  key: 'on',
  label: 'Match where',
  kind: 'list',
  hint: 'Rows match when every pair of columns holds the same value.',
  of: [
    { key: 'left', label: 'This step’s column', kind: 'column', columnsOf: 'from' },
    { key: 'right', label: 'equals the other step’s', kind: 'column', columnsOf: other },
  ],
  blank: () => ({ left: '', right: '' }),
  summary: (item) => `${str(item.left) || '…'} = ${str(item.right) || '…'}`,
});

/** The framework's steps; `stepKinds()` adds the project's (`defineStudioStep`). */
export const STEP_KINDS: StepKindInfo[] = [
  {
    kind: 'source',
    label: 'Read records',
    group: 'Get data',
    icon: 'source',
    help: 'Rows of one kind of record, with fields from it and from what it links to.',
    example: 'Sales invoices with party name, city and amount',
    fields: [],
    make: (id) => ({ kind: 'source', id, model: '', fields: [] }),
  },
  {
    kind: 'filter',
    label: 'Keep rows',
    group: 'Narrow rows',
    icon: 'filter',
    help: 'Keep only the rows that meet a condition.',
    example: 'Only invoices above 10,000',
    fields: [
      { key: 'from', label: 'Rows of', kind: 'stage' },
      { key: 'where', label: 'Keep rows where', kind: 'condition', columnsOf: 'from' },
    ],
    make: (id, from) => ({ kind: 'filter', id, from: from ?? '', where: '' }),
  },
  {
    kind: 'exists',
    label: 'Has / has no match',
    group: 'Narrow rows',
    icon: 'exists',
    help: 'Keep rows that have (or have no) matching row in another step.',
    example: 'Orders that have no invoice yet',
    fields: [
      { key: 'from', label: 'Rows of', kind: 'stage' },
      { key: 'in', label: 'Look for a match in', kind: 'stage' },
      {
        key: 'negate',
        label: 'Keep the rows that have no match instead',
        kind: 'bool',
        optional: true,
      },
      ON('in'),
      {
        key: 'where',
        label: 'And the match also has',
        kind: 'condition',
        columnsOf: 'in',
        optional: true,
        advanced: true,
      },
    ],
    make: (id, from) => ({ kind: 'exists', id, from: from ?? '', in: '', on: [] }),
  },
  {
    kind: 'top',
    label: 'Latest / top per group',
    group: 'Narrow rows',
    icon: 'top',
    help: 'Keep the first rows of each group by an order.',
    example: 'The latest purchase price of each product',
    fields: [
      { key: 'from', label: 'Rows of', kind: 'stage' },
      {
        key: 'partitionBy',
        label: 'One group per',
        kind: 'columns',
        hint: 'Leave empty for the top rows overall.',
      },
      {
        key: 'orderBy',
        label: 'First by',
        kind: 'order',
        hint: 'Latest first: the date, newest first.',
      },
      {
        key: 'keep',
        label: 'Rows to keep per group',
        kind: 'number',
        optional: true,
        placeholder: '1',
      },
    ],
    make: (id, from) => ({
      kind: 'top',
      id,
      from: from ?? '',
      partitionBy: [],
      orderBy: [],
      keep: 1,
    }),
  },
  {
    kind: 'derive',
    label: 'Calculate columns',
    group: 'Add columns',
    icon: 'derive',
    help: 'Add columns worked out from each row: margins, days, labels.',
    example: 'Margin = amount − cost',
    fields: [
      { key: 'from', label: 'Rows of', kind: 'stage' },
      {
        key: 'columns',
        label: 'New columns',
        kind: 'list',
        of: [
          { key: 'as', label: 'Name', kind: 'name' },
          { key: 'expr', label: 'Value', kind: 'formula' },
        ],
        blank: () => ({ as: '', expr: '' }),
        summary: (item) => `${str(item.as) || '…'} = ${str(item.expr) || '…'}`,
      },
      {
        key: 'keep',
        label: 'Pass on only these columns',
        kind: 'columns',
        columnsOf: 'self',
        optional: true,
        advanced: true,
        hint: 'Leave empty to pass on every column.',
      },
    ],
    make: (id, from) => ({ kind: 'derive', id, from: from ?? '', columns: [] }),
  },
  {
    kind: 'classify',
    label: 'Buckets',
    group: 'Add columns',
    icon: 'classify',
    help: 'Put each row in a named bucket by rules; the first rule that matches wins.',
    example: '0–30 days, 31–60 days, older',
    fields: [
      { key: 'from', label: 'Rows of', kind: 'stage' },
      { key: 'as', label: 'Bucket column', kind: 'name' },
      {
        key: 'rules',
        label: 'Rules',
        kind: 'list',
        hint: 'Checked from the top; a row goes in the first bucket it matches.',
        of: [
          { key: 'value', label: 'Bucket', kind: 'text', placeholder: '0-30 days' },
          { key: 'when', label: 'When', kind: 'condition' },
        ],
        blank: () => ({ when: '', value: '' }),
        summary: (item) => `${str(item.value) || '…'} when ${str(item.when) || '…'}`,
      },
      { key: 'otherwise', label: 'Bucket for the rest', kind: 'text', optional: true },
    ],
    make: (id, from) => ({ kind: 'classify', id, from: from ?? '', as: 'bucket', rules: [] }),
  },
  {
    kind: 'join',
    label: 'Bring columns from a step',
    group: 'Add columns',
    icon: 'join',
    help: 'Add columns from another step by matching values.',
    example: 'Delivered quantity next to each ordered line',
    fields: [
      { key: 'from', label: 'Rows of', kind: 'stage' },
      { key: 'with', label: 'Bring columns from', kind: 'stage' },
      ON('with'),
      {
        key: 'columns',
        label: 'Columns to bring',
        kind: 'list',
        of: [
          { key: 'column', label: 'Column', kind: 'column', columnsOf: 'with' },
          { key: 'as', label: 'Name here', kind: 'name', suggest: (item) => str(item.column) },
        ],
        blank: () => ({ column: '', as: '' }),
        summary: (item) =>
          str(item.as) && str(item.as) !== str(item.column)
            ? `${str(item.column) || '…'} as ${str(item.as)}`
            : str(item.column) || '…',
      },
      {
        key: 'type',
        label: 'Rows with no match',
        kind: 'choice',
        optional: true,
        advanced: true,
        options: [
          { value: '', label: 'Keep them (empty values)' },
          { value: 'inner', label: 'Drop them' },
        ],
      },
    ],
    make: (id, from) => ({ kind: 'join', id, from: from ?? '', with: '', on: [], columns: [] }),
  },
  {
    kind: 'window',
    label: 'Running totals and ranks',
    group: 'Add columns',
    icon: 'window',
    help: 'Running balance, rank, previous row, share of total — without merging rows.',
    example: 'Running balance per account',
    fields: [
      { key: 'from', label: 'Rows of', kind: 'stage' },
      {
        key: 'columns',
        label: 'New columns',
        kind: 'list',
        of: [
          { key: 'fn', label: 'Work out', kind: 'choice', options: WINDOWS },
          {
            key: 'expr',
            label: 'Of',
            kind: 'formula',
            preferColumn: true,
            when: (item) => WINDOW_NEEDS_VALUE.has(str(item.fn)),
          },
          { key: 'partitionBy', label: 'Start again for each', kind: 'columns', optional: true },
          {
            key: 'orderBy',
            label: 'In the order of',
            kind: 'order',
            when: (item) => WINDOW_NEEDS_ORDER.has(str(item.fn)),
          },
          {
            key: 'as',
            label: 'Name',
            kind: 'name',
            suggest: (item) => suggestName(str(item.fn), str(item.expr)),
          },
        ],
        blank: () => ({ as: '', fn: 'runningSum', expr: '', orderBy: [] }),
        summary: (item) =>
          `${str(item.as) || '…'} = ${choiceLabel(WINDOWS, item.fn).toLowerCase()}${str(item.expr) ? ` of ${str(item.expr)}` : ''}`,
      },
    ],
    make: (id, from) => ({ kind: 'window', id, from: from ?? '', columns: [] }),
  },
  {
    kind: 'aggregate',
    label: 'Group and total',
    group: 'Summarize',
    icon: 'aggregate',
    help: 'One row per group (party, product, month) with sums, counts and more.',
    example: 'Sales per party: invoices and total amount',
    fields: [
      { key: 'from', label: 'Rows of', kind: 'stage' },
      {
        key: 'groupBy',
        label: 'One row per',
        kind: 'columns',
        hint: 'Leave empty for one row with the grand totals.',
      },
      {
        key: 'measures',
        label: 'Totals',
        kind: 'list',
        of: [
          { key: 'fn', label: 'Work out', kind: 'choice', options: AGGREGATES },
          {
            key: 'expr',
            label: 'Of',
            kind: 'formula',
            optional: true,
            preferColumn: true,
            when: (item) => item.fn !== 'count',
          },
          {
            key: 'as',
            label: 'Name',
            kind: 'name',
            suggest: (item) => suggestName(str(item.fn), str(item.expr)),
          },
          {
            key: 'where',
            label: 'Count only rows where',
            kind: 'condition',
            optional: true,
            advanced: true,
          },
          {
            key: 'orderBy',
            label: 'First / last by',
            kind: 'formula',
            optional: true,
            when: (item) => item.fn === 'first' || item.fn === 'last',
            hint: 'Which row comes first, such as the date.',
          },
          {
            key: 'separator',
            label: 'Separator',
            kind: 'text',
            optional: true,
            placeholder: ', ',
            when: (item) => item.fn === 'list',
          },
        ],
        blank: () => ({ as: '', fn: 'sum', expr: '' }),
        summary: (item) =>
          `${str(item.as) || '…'} = ${choiceLabel(AGGREGATES, item.fn).toLowerCase()}${str(item.expr) ? ` of ${str(item.expr)}` : ''}${str(item.where) ? ` where ${str(item.where)}` : ''}`,
      },
      {
        key: 'having',
        label: 'Keep groups where',
        kind: 'condition',
        columnsOf: 'self',
        optional: true,
        advanced: true,
      },
    ],
    make: (id, from) => ({ kind: 'aggregate', id, from: from ?? '', groupBy: [], measures: [] }),
  },
  {
    kind: 'pivot',
    label: 'Values to columns',
    group: 'Summarize',
    icon: 'pivot',
    help: 'Turn the values of one column into columns: months, voucher types.',
    example: 'Sales per party with a column per month',
    fields: [
      { key: 'from', label: 'Rows of', kind: 'stage' },
      { key: 'rows', label: 'One row per', kind: 'columns' },
      { key: 'column', label: 'A column for each value of', kind: 'column' },
      {
        key: 'keys',
        label: 'Columns',
        kind: 'list',
        of: [
          { key: 'value', label: 'When the value is', kind: 'text' },
          {
            key: 'as',
            label: 'Column name',
            kind: 'name',
            suggest: (item) => suggestName('', str(item.value)),
          },
        ],
        blank: () => ({ value: '', as: '' }),
        summary: (item) => `${str(item.as) || '…'} ← ${str(item.value) || '…'}`,
      },
      {
        key: 'measure.fn',
        label: 'Each holds the',
        kind: 'choice',
        options: AGGREGATES.filter((choice) => choice.value !== 'first' && choice.value !== 'last'),
      },
      {
        key: 'measure.expr',
        label: 'Of',
        kind: 'formula',
        optional: true,
        preferColumn: true,
        when: (stage) => (stage.measure as { fn?: string } | undefined)?.fn !== 'count',
      },
      {
        key: 'total',
        label: 'Total column',
        kind: 'name',
        optional: true,
        advanced: true,
        hint: 'Adds a column with the sum across them.',
      },
    ],
    make: (id, from) => ({
      kind: 'pivot',
      id,
      from: from ?? '',
      rows: [],
      column: '',
      keys: [],
      measure: { fn: 'sum', expr: '' },
    }),
  },
  {
    kind: 'balance',
    label: 'Period balance',
    group: 'Summarize',
    icon: 'balance',
    help: 'Opening, inward, outward and closing per key from dated movements.',
    example: 'Stock: opening, in, out and closing per item',
    fields: [
      { key: 'from', label: 'Movements in', kind: 'stage' },
      { key: 'keys', label: 'One row per', kind: 'columns' },
      { key: 'date', label: 'Date column', kind: 'column' },
      { key: 'inward', label: 'Inward', kind: 'formula' },
      { key: 'outward', label: 'Outward', kind: 'formula' },
      { key: 'periodFrom', label: 'Period from', kind: 'formula', advanced: true },
      { key: 'periodTo', label: 'Period to', kind: 'formula', advanced: true },
      {
        key: 'keepZero',
        label: 'Keep rows that are all zero',
        kind: 'bool',
        optional: true,
        advanced: true,
      },
    ],
    make: (id, from) => ({
      kind: 'balance',
      id,
      from: from ?? '',
      keys: [],
      date: '',
      periodFrom: '@from',
      periodTo: '@to',
      inward: '',
      outward: '',
    }),
  },
  {
    kind: 'fifo',
    label: 'First in, first out',
    group: 'Summarize',
    icon: 'fifo',
    help: 'Outward uses up the oldest inward first; adds what is still open of each inward row.',
    example: 'Stock aging, bill-wise dues',
    fields: [
      { key: 'from', label: 'Movements in', kind: 'stage' },
      {
        key: 'keys',
        label: 'One queue per',
        kind: 'columns',
        hint: 'Product and branch for stock; party for bills.',
      },
      {
        key: 'order',
        label: 'Oldest first by',
        kind: 'order',
        hint: 'A date, then a tie-breaker such as the row id.',
      },
      { key: 'inward', label: 'Inward', kind: 'formula' },
      { key: 'outward', label: 'Outward', kind: 'formula' },
      {
        key: 'as',
        label: 'Open column',
        kind: 'name',
        optional: true,
        advanced: true,
        placeholder: 'remaining',
      },
    ],
    make: (id, from) => ({
      kind: 'fifo',
      id,
      from: from ?? '',
      keys: [],
      order: [],
      inward: '',
      outward: '',
      as: 'remaining',
    }),
  },
  {
    kind: 'periods',
    label: 'Compare periods',
    group: 'Add columns',
    icon: 'periods',
    help: 'Tags each row with the period it falls in: this period, the same span last year, last month, a series of years.',
    example: 'This FY to date against the same span last year',
    fields: [
      { key: 'from', label: 'Rows of', kind: 'stage' },
      { key: 'date', label: 'Date column', kind: 'column' },
      { key: 'periodFrom', label: 'Period from', kind: 'formula', hint: 'A date input, usually @from.' },
      { key: 'periodTo', label: 'Period to', kind: 'formula', hint: 'A date input, usually @to.' },
      {
        key: 'periods',
        label: 'Periods',
        kind: 'list',
        hint: 'One without a shift is the period itself. Read the whole span in an earlier step with @<this step>_from and @<this step>_to.',
        of: [
          { key: 'name', label: 'Name', kind: 'name', hint: 'Sum one period with a condition such as period = \'ly\'.' },
          {
            key: 'label',
            label: 'Heading',
            kind: 'text',
            optional: true,
            placeholder: '{from} to {to}',
            hint: '{from}, {to}, {fromMonth}, {toMonth}, {fy}, {year} are filled in: FY-{fy} Upto {toMonth}.',
          },
          { key: 'shiftYears', label: 'Years back or ahead', kind: 'number', optional: true, placeholder: '0', hint: '-1 is the same span last year.' },
          { key: 'shiftMonths', label: 'Months back or ahead', kind: 'number', optional: true, placeholder: '0', hint: '-1 is the month before.' },
          { key: 'previous', label: 'The span just before, as long', kind: 'bool', optional: true },
          { key: 'repeat', label: 'Repeat', kind: 'number', optional: true, advanced: true, hint: '3 with -1 year: the same span in each of the last 3 years (name1, name2, name3).' },
        ],
        blank: () => ({ name: '' }),
        summary: (item) => {
          const shift = item.previous ? 'previous span' : [item.shiftYears ? `${str(item.shiftYears)} y` : '', item.shiftMonths ? `${str(item.shiftMonths)} m` : ''].filter(Boolean).join(' ') || 'the period';
          return `${str(item.name) || '…'} · ${shift}${item.repeat ? ` × ${str(item.repeat)}` : ''}`;
        },
      },
      { key: 'as', label: 'Period column', kind: 'name', optional: true, advanced: true, placeholder: 'period' },
    ],
    make: (id, from) => ({
      kind: 'periods',
      id,
      from: from ?? '',
      date: '',
      periodFrom: '@from',
      periodTo: '@to',
      periods: [
        { name: 'cur', label: 'FY-{fy} Upto {toMonth}' },
        { name: 'ly', shiftYears: -1, label: 'FY-{fy} Upto {toMonth}' },
      ],
    }),
  },
  {
    kind: 'union',
    label: 'Stack steps',
    group: 'Combine',
    icon: 'union',
    help: 'Rows of several steps one under the other.',
    example: 'Sales and credit notes (as negative) in one list',
    fields: [
      {
        key: 'parts',
        label: 'Steps to stack',
        kind: 'list',
        hint: 'Each step must end with the same columns as the first; set the missing ones.',
        of: [
          { key: 'from', label: 'Rows of', kind: 'stage' },
          { key: 'set', label: 'Set columns', kind: 'map', optional: true },
        ],
        blank: () => ({ from: '' }),
        summary: (item) =>
          `${str(item.from) || '…'}${item.set && typeof item.set === 'object' ? ` · ${Object.keys(item.set).join(', ')}` : ''}`,
      },
    ],
    make: (id, from) => ({ kind: 'union', id, parts: from ? [{ from }, { from: '' }] : [] }),
  },
];

export const STEP_GROUPS: StepGroup[] = [
  'Get data',
  'Narrow rows',
  'Add columns',
  'Summarize',
  'Combine',
];

/** Every step the gallery offers: the framework's, then the project's. */
export function stepKinds(): StepKindInfo[] {
  return [...STEP_KINDS, ...studioStepInfos()];
}

export function stepInfo(kind: StepKind): StepKindInfo | undefined {
  return STEP_KINDS.find((item) => item.kind === kind) ?? studioStepInfos().find((item) => item.kind === kind);
}

const list = (items: readonly string[], max = 3): string =>
  items.length === 0
    ? '…'
    : items.length <= max
      ? items.join(', ')
      : `${items.slice(0, max).join(', ')} +${items.length - max} more`;

/** What a step does, in one line, for its card. */
export function describeStep(stage: Rdl2Stage, models: ReadonlyMap<string, CatalogModel>): string {
  switch (stage.kind) {
    case 'source': {
      const model = models.get(stage.model)?.label ?? (stage.model || 'records');
      return `${model}: ${list(stage.fields.map((f) => f.as))}${stage.where ? ` · where ${stage.where}` : ''}`;
    }
    case 'filter':
      return stage.where ? `Where ${stage.where}` : 'Choose a condition';
    case 'derive':
      return `Adds ${list(stage.columns.map((c) => c.as))}`;
    case 'aggregate':
      return `${stage.groupBy.length ? `Per ${list(stage.groupBy)}` : 'One row'}: ${list(stage.measures.map((m) => m.as))}`;
    case 'balance':
      return `Opening, in, out, closing per ${list(stage.keys)}`;
    case 'pivot':
      return `${stage.column || '…'} as columns (${list(
        stage.keys.map((k) => k.as),
        4,
      )}) per ${list(stage.rows)}`;
    case 'join':
      return `Adds ${list(stage.columns.map((c) => c.as))} from ${stage.with || '…'}`;
    case 'exists':
      return `Rows with ${stage.negate ? 'no' : 'a'} match in ${stage.in || '…'}`;
    case 'window':
      return `Adds ${list(stage.columns.map((c) => c.as))}`;
    case 'top':
      return `First ${stage.keep ?? 1} per ${list(stage.partitionBy)}`;
    case 'classify':
      return `${stage.as || 'bucket'}: ${list(
        stage.rules.map((r) => r.value),
        4,
      )}`;
    case 'union':
      return `Stacks ${list(
        stage.parts.map((p) => p.from),
        4,
      )}`;
    case 'fifo':
      return `Open ${stage.as || 'remaining'} per ${list(stage.keys)}`;
    case 'periods':
      return `${stage.as || 'period'}: ${list(stage.periods.map((p) => p.name || '…'), 4)} by ${stage.date || '…'}`;
    case 'native':
      return `System step ${stage.name}`;
    case 'engine':
      return `Figures from ${stage.name}`;
    default:
      return studioStep((stage as Rdl2StageBase).kind)?.describe(stage as Rdl2StageBase) ?? `${(stage as Rdl2StageBase).kind} step`;
  }
}

/** A step id not taken yet: `items`, `items2`. */
export function freeStepId(report: Rdl2Report, base: string): string {
  const taken = new Set(report.stages.map((s) => s.id));
  const clean = base.replace(/[^A-Za-z0-9_]/g, '') || 'step';
  if (!taken.has(clean)) return clean;
  let n = 2;
  while (taken.has(`${clean}${n}`)) n += 1;
  return `${clean}${n}`;
}

/** A blank report the designer starts from: a period, nothing read yet. */
export function blankReport(): Rdl2Report {
  return {
    lang: 'rdl2',
    name: '',
    title: 'New report',
    category: 'Custom',
    description: '',
    params: [
      { id: 'from', label: 'Date from', type: 'date', required: true, default: 'fyStart' },
      { id: 'to', label: 'Date to', type: 'date', required: true, default: 'fyToDate' },
    ],
    stages: [],
    output: { stage: '', columns: [] },
  };
}
