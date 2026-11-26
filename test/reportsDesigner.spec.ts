import { describe, expect, it } from 'vitest';
import { fakeReportsHost } from './reportsHost';
import type { Rdl2Report } from '../src/reports/language';
import type { CatalogModel } from '../src/reports/studioApi';
import { checkReport } from '../src/reports/designer/checks';
import {
  conditionFromText,
  conditionText,
  newRule,
  withOperator,
  type ConditionGroup,
} from '../src/reports/designer/condition';
import {
  checkExpr,
  exprTextType,
  parseExpr,
  printExpr,
  readsParam,
  renameParamIn,
} from '../src/reports/designer/expr';
import {
  camelName,
  cleanName,
  suggestName,
} from '../src/reports/designer/naming';
import { resolvePath, stageSchemas } from '../src/reports/designer/schema';

fakeReportsHost();

const field = (name: string, type: CatalogModel['fields'][number]['type'], extra = {}) => ({
  name,
  label: name,
  type,
  column: name,
  ...extra,
});
const scope = { company: true, row: 'own' as const, softDelete: false };
const MODELS: CatalogModel[] = [
  {
    name: 'SalesInvoice',
    label: 'Sales invoice',
    fields: [
      field('id', 'number', { primaryKey: true }),
      field('invoiceDate', 'date'),
      field('amount', 'number'),
      field('status', 'enum', { values: ['active', 'cancelled'] }),
      field('partyId', 'number'),
    ],
    relations: [
      {
        name: 'party',
        label: 'Party',
        type: 'one',
        target: 'Party',
        sourceKey: 'partyId',
        targetKey: 'id',
      },
      {
        name: 'items',
        label: 'Items',
        type: 'many',
        target: 'SalesInvoiceItem',
        sourceKey: 'id',
        targetKey: 'salesInvoiceId',
      },
    ],
    scope,
  },
  {
    name: 'Party',
    label: 'Party',
    fields: [field('id', 'number'), field('name', 'text'), field('isActive', 'boolean')],
    relations: [],
    scope,
  },
  {
    name: 'SalesInvoiceItem',
    label: 'Sales invoice item',
    fields: [field('id', 'number'), field('qty', 'number')],
    relations: [],
    scope,
  },
];
const catalog = new Map(MODELS.map((model) => [model.name, model]));

function report(
  stages: Rdl2Report['stages'],
  output: Partial<Rdl2Report['output']> = {},
): Rdl2Report {
  return {
    lang: 'rdl2',
    name: 'test.report',
    title: 'Test',
    params: [
      { id: 'from', label: 'From', type: 'date' },
      { id: 'to', label: 'To', type: 'date' },
    ],
    stages,
    output: {
      stage: stages[stages.length - 1]?.id ?? '',
      columns: [{ column: 'party', label: 'Party' }],
      ...output,
    },
  };
}

const source: Rdl2Report['stages'][number] = {
  kind: 'source',
  id: 'invoices',
  model: 'SalesInvoice',
  fields: [
    { as: 'party', path: 'party.name' },
    { as: 'amount', path: 'amount' },
    { as: 'day', path: 'invoiceDate' },
  ],
};

describe('report designer: expressions', () => {
  it('prints what it parses, with only the brackets it needs', () => {
    for (const src of [
      'a + b * c',
      '(a + b) * c',
      'a - (b - c)',
      'not (a = 1 or b = 2)',
      "x between @from and @to and coalesce(status, '') != 'cancelled'",
      'if(amount < 0, -amount, 0)',
      "name contains 'it''s'",
    ]) {
      const ast = parseExpr(src);
      expect(parseExpr(printExpr(ast))).toEqual(ast);
    }
    expect(printExpr(parseExpr('((a))  +  (b*c)'))).toBe('a + b * c');
    expect(printExpr(parseExpr('daysbetween(a, b)'))).toBe('daysBetween(a, b)');
  });

  it('points at the mistake and suggests the column meant', () => {
    const at = {
      hasName: (n: string) => ['amount', 'discount'].includes(n),
      params: ['from'],
      suggest: ['amount', 'discount'],
    };
    const unknown = checkExpr('amont - discount', at);
    expect(unknown).toMatchObject({ ok: false, at: 0, length: 5 });
    expect(!unknown.ok && unknown.message).toMatch(/did you mean amount/);
    expect(checkExpr('amount >', at)).toMatchObject({ ok: false });
    expect(checkExpr('round(amount, 2, 3)', at)).toMatchObject({ ok: false });
    expect(checkExpr('amount > @too', at)).toMatchObject({ ok: false });
    expect(checkExpr('amount contains discount', at)).toMatchObject({ ok: false });
    expect(checkExpr("'open", at)).toMatchObject({ ok: false, at: 0 });
    expect(checkExpr('round(amount - discount, 2) > 0', at).ok).toBe(true);
  });

  it('works out what an expression gives', () => {
    const types = (n: string) => (n === 'day' ? 'date' : n === 'amount' ? 'number' : 'unknown');
    expect(exprTextType('amount * 2', types)).toBe('number');
    expect(exprTextType('addDays(day, 3)', types)).toBe('date');
    expect(exprTextType('day + 3', types)).toBe('date');
    expect(exprTextType('amount > 0 and day < today()', types)).toBe('boolean');
    expect(exprTextType('if(amount > 0, day, null)', types)).toBe('date');
    expect(exprTextType('monthName(day)', types)).toBe('text');
  });

  it('renames an input everywhere but inside quotes', () => {
    expect(renameParamIn("d between @from and @to and note = '@from'", 'from', 'start')).toBe(
      "d between @start and @to and note = '@from'",
    );
    expect(readsParam("note = '@from'", 'from')).toBe(false);
    expect(readsParam('d >= @from', 'from')).toBe(true);
    expect(renameParamIn('d >= @fromDate', 'from', 'x')).toBe('d >= @fromDate');
  });
});

describe('report designer: conditions as rules', () => {
  const roundTrip = (src: string) => conditionText(conditionFromText(src)!);

  it('turns conditions into rules and back without changing their meaning', () => {
    expect(roundTrip("amount > 1000 and status = 'active'")).toBe(
      "amount > 1000 and status = 'active'",
    );
    expect(roundTrip("a = 1 and (b = 2 or c in ('x', 'y'))")).toBe(
      "a = 1 and (b = 2 or c in ('x', 'y'))",
    );
    expect(roundTrip('not (a = 1 or b = 2)')).toBe('not (a = 1 or b = 2)');
    expect(roundTrip('day between @from and @to')).toBe('day between @from and @to');
    expect(roundTrip('isActive and not closed')).toBe('isActive = true and closed = false');
    expect(roundTrip("code != ''")).toBe("code != ''");
  });

  it('keeps formulas on either side of a rule', () => {
    const group = conditionFromText(
      "coalesce(status, '') != 'cancelled' and date(day) <= addDays(@to, -1)",
    )!;
    expect(group.items.map((item) => item.type)).toEqual(['rule', 'rule']);
    expect(group.items[0]).toMatchObject({
      field: "coalesce(status, '')",
      op: 'ne',
      value: { kind: 'value', value: 'cancelled' },
    });
    expect(group.items[1]).toMatchObject({
      field: 'date(day)',
      op: 'lte',
      value: { kind: 'formula', text: 'addDays(@to, -1)' },
    });
    expect(conditionText(group)).toBe(
      "coalesce(status, '') != 'cancelled' and date(day) <= addDays(@to, -1)",
    );
  });

  it('holds what rules cannot as formula blocks, and leaves unfinished rules out', () => {
    const group = conditionFromText('coalesce(claimed, false) and amount > 0')!;
    expect(group.items.map((item) => item.type)).toEqual(['formula', 'rule']);
    const withBlank: ConditionGroup = {
      ...group,
      items: [...group.items, { type: 'rule', key: 99, field: 'amount', op: 'lt' }],
    };
    expect(conditionText(withBlank)).toBe('coalesce(claimed, false) and amount > 0');
    expect(conditionFromText('amount >')).toBeNull();
  });

  it('starts a date rule on the report period and keeps values across operators', () => {
    const rule = newRule('day', 'date', [
      { id: 'from', type: 'date' },
      { id: 'to', type: 'date' },
    ]);
    expect(rule).toMatchObject({
      op: 'between',
      value: { kind: 'param', id: 'from' },
      value2: { kind: 'param', id: 'to' },
    });
    const single = withOperator({ ...rule, op: 'eq', value: { kind: 'value', value: 'x' } }, 'in');
    expect(single.list).toEqual(['x']);
  });
});

describe('report designer: checks', () => {
  it('finds nothing wrong in a sound report', () => {
    const r = report([
      source,
      {
        kind: 'aggregate',
        id: 'perParty',
        from: 'invoices',
        groupBy: ['party'],
        measures: [{ as: 'total', fn: 'sum', expr: 'amount' }],
      },
    ]);
    expect(checkReport(r, catalog, stageSchemas(r, catalog))).toEqual([]);
  });

  it('says where each problem is', () => {
    const r = report(
      [
        {
          ...source,
          fields: [
            ...(source.kind === 'source' ? source.fields : []),
            { as: 'amount', path: 'items.qty' },
          ],
          where: 'party.nam = 1',
        },
        { kind: 'filter', id: 'big', from: 'invoices', where: 'amont > 10' },
        {
          kind: 'aggregate',
          id: 'perParty',
          from: 'nowhere',
          groupBy: [],
          measures: [{ as: '', fn: 'sum' }],
        },
      ],
      { columns: [{ column: 'gone', label: '' }] },
    );
    const found = checkReport(r, catalog, stageSchemas(r, catalog)).map(
      (issue) => `${issue.at}:${issue.path ?? ''}`,
    );
    expect(found).toEqual(
      expect.arrayContaining([
        'invoices:fields.3.as',
        'invoices:fields.3.path',
        'invoices:where',
        'big:where',
        'perParty:from',
        'perParty:measures.0.as',
        'perParty:measures.0.expr',
        'output:columns.0.column',
        'output:columns.0.label',
      ]),
    );
  });

  it('pages by a group only while it is one of the groups', () => {
    const grouped = report([source], { groups: [{ column: 'party' }], pageBy: 'party' });
    expect(checkReport(grouped, catalog, stageSchemas(grouped, catalog))).toEqual([]);
    const lost = report([source], { groups: [{ column: 'day' }], pageBy: 'party' });
    expect(
      checkReport(lost, catalog, stageSchemas(lost, catalog)).map((issue) => issue.path),
    ).toEqual(['pageBy']);
  });

  it('types columns from the catalog through links', () => {
    const r = report([source]);
    expect(
      stageSchemas(r, catalog)
        .get('invoices')
        ?.map((col) => col.type),
    ).toEqual(['text', 'number', 'date']);
    expect(resolvePath(catalog, 'SalesInvoice', 'items.qty')).toMatchObject({
      error: expect.stringMatching(/many rows/),
    });
  });
});

describe('report designer: names', () => {
  it('offers names a column can have', () => {
    expect(suggestName('sum', 'amount')).toBe('amountTotal');
    expect(suggestName('count', '')).toBe('count');
    expect(suggestName('runningSum', 'party.balance')).toBe('balanceRunning');
    expect(camelName('Minimum amount')).toBe('minimumAmount');
    expect(camelName('0-30 days')).toBe('c030Days');
    expect(cleanName('net amount!')).toBe('net_amount');
  });
});

describe('report designer: a project step', () => {
  it('shows a step the project adds (defineStudioStep) in the gallery, its sentence, its columns and its checks', async () => {
    const { defineStudioStep } = await import('../src/reports/designer/studioSteps');
    const { describeStep, stepInfo, stepKinds } = await import('../src/reports/designer/steps');
    defineStudioStep<{ kind: 'margin'; id: string; from: string; product: string; amount: string }>({
      info: { kind: 'margin', label: 'Margin', group: 'Add columns', icon: 'cost', help: 'Adds a margin per line', example: 'Margin by product', fields: [{ key: 'product', label: 'Product', kind: 'column' }], make: (id, from) => ({ kind: 'margin', id, from: from ?? '', product: '', amount: '' }) },
      describe: (stage) => `Margin of ${stage.amount || '…'}`,
      columns: (_stage, input) => [...input, { name: 'margin', type: 'number', origin: 'margin of the line' }],
      check(stage, check) {
        check.column('product', stage.product, 'Choose the product column');
        check.formula('amount', stage.amount, 'Set the amount');
      },
    });
    expect(stepKinds().map((kind) => kind.kind)).toContain('margin');
    expect(stepInfo('margin')?.make('m', 'src')).toMatchObject({ kind: 'margin', id: 'm', from: 'src' });
    const step = { kind: 'margin', id: 'm', from: source.id, product: '', amount: '' } as unknown as Rdl2Report['stages'][number];
    const r = report([source, step]);
    expect(describeStep(step, catalog)).toBe('Margin of …');
    expect(stageSchemas(r, catalog).get('m')?.at(-1)).toMatchObject({ name: 'margin', type: 'number' });
    expect(checkReport(r, catalog, stageSchemas(r, catalog)).filter((issue) => issue.at === 'm').map((issue) => issue.path).sort()).toEqual(['amount', 'product']);
  });
});
