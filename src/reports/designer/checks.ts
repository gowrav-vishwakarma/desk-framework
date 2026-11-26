import type { Rdl2Report, Rdl2Stage, Rdl2StageBase } from '../language';
import { studioStep } from './studioSteps';
import { checkExpr, NAME, type ExprScope } from './expr';
import { resolvePath, stageInputs, type Catalog, type ColumnInfo } from './schema';
import { stepInfo, WINDOW_NEEDS_ORDER, WINDOW_NEEDS_VALUE, WINDOWS } from './steps';
import { lookupPreset } from '../lookupPresets';

/**
 * Checks a report in the browser on every change, before anything is run: the same mistakes the
 * backend compiler refuses, said where they are. `at` is a step id, `inputs`, `output` or `report`;
 * `path` is the setting (`measures.2.expr`), so the editor marks that field and the flow its card.
 */
export interface Issue {
  at: string;
  path?: string;
  message: string;
}

export const AT_INPUTS = 'inputs';
export const AT_OUTPUT = 'output';
export const AT_REPORT = 'report';

interface Ctx {
  report: Rdl2Report;
  catalog: Catalog;
  schemas: Map<string, ColumnInfo[]>;
  functions: readonly string[];
  params: string[];
  out: Issue[];
}

function columnScope(ctx: Ctx, cols: ColumnInfo[]): ExprScope {
  const names = new Set(cols.map((col) => col.name));
  return {
    hasName: (name) => names.has(name),
    params: ctx.params,
    functions: ctx.functions,
    suggest: [...names],
  };
}

function sourceScope(ctx: Ctx, model: string): ExprScope {
  return {
    hasName: (name) => !('error' in resolvePath(ctx.catalog, model, name)),
    params: ctx.params,
    functions: ctx.functions,
  };
}

function expr(
  ctx: Ctx,
  at: string,
  path: string,
  src: unknown,
  scope: ExprScope,
  required: string | null,
): void {
  const value = typeof src === 'string' ? src.trim() : '';
  if (!value) {
    if (required) ctx.out.push({ at, path, message: required });
    return;
  }
  const result = checkExpr(value, scope);
  if (!result.ok) ctx.out.push({ at, path, message: result.message });
}

function name(
  ctx: Ctx,
  at: string,
  path: string,
  value: unknown,
  what: string,
  taken?: Set<string>,
): void {
  const text = typeof value === 'string' ? value : '';
  if (!text) ctx.out.push({ at, path, message: `Give the ${what} a name` });
  else if (!NAME.test(text))
    ctx.out.push({
      at,
      path,
      message: 'A name uses letters, digits and _, and starts with a letter',
    });
  else if (taken?.has(text))
    ctx.out.push({ at, path, message: `Another column is already named ${text}` });
  taken?.add(text);
}

function columns(
  ctx: Ctx,
  at: string,
  path: string,
  list: readonly string[] | undefined,
  cols: ColumnInfo[],
): void {
  const names = new Set(cols.map((col) => col.name));
  (list ?? []).forEach((col, index) => {
    if (!names.has(col))
      ctx.out.push({ at, path: `${path}.${index}`, message: `There is no column "${col}" here` });
  });
}

function column(
  ctx: Ctx,
  at: string,
  path: string,
  value: string | undefined,
  cols: ColumnInfo[],
  required: string,
): void {
  if (!value) ctx.out.push({ at, path, message: required });
  else if (!cols.some((col) => col.name === value))
    ctx.out.push({ at, path, message: `There is no column "${value}" here` });
}

function order(
  ctx: Ctx,
  at: string,
  path: string,
  list: { expr: string }[] | undefined,
  scope: ExprScope,
  required: string | null,
): void {
  if (!list?.length) {
    if (required) ctx.out.push({ at, path, message: required });
    return;
  }
  list.forEach((item, index) =>
    expr(ctx, at, `${path}.${index}.expr`, item.expr, scope, 'Choose a column to order by'),
  );
}

function checkStage(ctx: Ctx, stage: Rdl2Stage, before: Set<string>): void {
  const at = stage.id;
  const cols = (id: string | undefined) => (id ? (ctx.schemas.get(id) ?? []) : []);
  const fromKey = stage.kind === 'union' ? null : 'from';

  // Every step it reads must come before it.
  stageInputs(stage).forEach((id, index) => {
    const path =
      stage.kind === 'union'
        ? `parts.${index}.from`
        : stage.kind === 'join' && index === 1
          ? 'with'
          : stage.kind === 'exists' && index === 1
            ? 'in'
            : (fromKey ?? 'from');
    if (!id) ctx.out.push({ at, path, message: 'Choose the step it reads' });
    else if (!before.has(id))
      ctx.out.push({ at, path, message: `"${id}" is not a step before this one` });
  });

  const input = cols('from' in stage ? stage.from : undefined);
  const scope = columnScope(ctx, input);

  switch (stage.kind) {
    case 'source': {
      if (!stage.model) {
        ctx.out.push({ at, path: 'model', message: 'Choose what to read' });
        break;
      }
      if (!ctx.catalog.has(stage.model)) {
        ctx.out.push({
          at,
          path: 'model',
          message: `"${stage.model}" is not something reports can read`,
        });
        break;
      }
      if (!stage.fields.length)
        ctx.out.push({ at, path: 'fields', message: 'Tick at least one field to read' });
      const taken = new Set<string>();
      stage.fields.forEach((field, index) => {
        name(ctx, at, `fields.${index}.as`, field.as, 'column', taken);
        const found = resolvePath(ctx.catalog, stage.model, field.path);
        if ('error' in found)
          ctx.out.push({ at, path: `fields.${index}.path`, message: found.error });
      });
      expr(ctx, at, 'where', stage.where, sourceScope(ctx, stage.model), null);
      break;
    }
    case 'filter':
      expr(ctx, at, 'where', stage.where, scope, 'Set the condition rows must meet');
      break;
    case 'derive': {
      const taken = new Set<string>();
      stage.columns.forEach((col, index) => {
        name(ctx, at, `columns.${index}.as`, col.as, 'column', taken);
        expr(ctx, at, `columns.${index}.expr`, col.expr, scope, 'Set what the column holds');
      });
      if (stage.keep?.length)
        columns(ctx, at, 'keep', stage.keep, [
          ...input,
          ...stage.columns.map((col) => ({ name: col.as, type: 'unknown' as const, origin: '' })),
        ]);
      break;
    }
    case 'aggregate': {
      columns(ctx, at, 'groupBy', stage.groupBy, input);
      if (!stage.groupBy.length && !stage.measures.length)
        ctx.out.push({ at, path: 'measures', message: 'Choose what to group by or add a total' });
      const taken = new Set(stage.groupBy);
      stage.measures.forEach((m, index) => {
        name(ctx, at, `measures.${index}.as`, m.as, 'total', taken);
        expr(
          ctx,
          at,
          `measures.${index}.expr`,
          m.expr,
          scope,
          m.fn === 'count' ? null : 'Choose what to total',
        );
        expr(ctx, at, `measures.${index}.where`, m.where, scope, null);
        expr(ctx, at, `measures.${index}.orderBy`, m.orderBy, scope, null);
      });
      expr(ctx, at, 'having', stage.having, columnScope(ctx, cols(stage.id)), null);
      break;
    }
    case 'window': {
      if (!stage.columns.length)
        ctx.out.push({ at, path: 'columns', message: 'Add a column to work out' });
      const taken = new Set<string>();
      stage.columns.forEach((c, index) => {
        name(ctx, at, `columns.${index}.as`, c.as, 'column', taken);
        if (!WINDOWS.some((w) => w.value === c.fn))
          ctx.out.push({
            at,
            path: `columns.${index}.fn`,
            message: `Choose what ${c.as || 'the column'} works out (rank, running total…); a plain calculation goes in a Calculate columns step`,
          });
        if (WINDOW_NEEDS_VALUE.has(c.fn))
          expr(ctx, at, `columns.${index}.expr`, c.expr, scope, 'Choose the value');
        columns(ctx, at, `columns.${index}.partitionBy`, c.partitionBy, input);
        order(
          ctx,
          at,
          `columns.${index}.orderBy`,
          c.orderBy,
          scope,
          WINDOW_NEEDS_ORDER.has(c.fn) ? 'Choose the order the rows go in' : null,
        );
      });
      break;
    }
    case 'join': {
      const other = cols(stage.with);
      if (!stage.on.length)
        ctx.out.push({ at, path: 'on', message: 'Choose the columns that must match' });
      stage.on.forEach((pair, index) => {
        column(ctx, at, `on.${index}.left`, pair.left, input, 'Choose a column of this step');
        column(
          ctx,
          at,
          `on.${index}.right`,
          pair.right,
          other,
          'Choose a column of the other step',
        );
      });
      if (!stage.columns.length)
        ctx.out.push({ at, path: 'columns', message: 'Choose the columns to bring' });
      const taken = new Set(input.map((col) => col.name));
      stage.columns.forEach((c, index) => {
        column(ctx, at, `columns.${index}.column`, c.column, other, 'Choose a column to bring');
        name(ctx, at, `columns.${index}.as`, c.as, 'column', taken);
      });
      break;
    }
    case 'exists': {
      const other = cols(stage.in);
      if (!stage.on.length)
        ctx.out.push({ at, path: 'on', message: 'Choose the columns that must match' });
      stage.on.forEach((pair, index) => {
        column(ctx, at, `on.${index}.left`, pair.left, input, 'Choose a column of this step');
        column(
          ctx,
          at,
          `on.${index}.right`,
          pair.right,
          other,
          'Choose a column of the other step',
        );
      });
      expr(ctx, at, 'where', stage.where, columnScope(ctx, other), null);
      break;
    }
    case 'top':
      columns(ctx, at, 'partitionBy', stage.partitionBy, input);
      order(ctx, at, 'orderBy', stage.orderBy, scope, 'Choose which rows come first');
      if (stage.keep !== undefined && (!Number.isInteger(stage.keep) || stage.keep < 1))
        ctx.out.push({ at, path: 'keep', message: 'Keep at least 1 row' });
      break;
    case 'pivot': {
      columns(ctx, at, 'rows', stage.rows, input);
      column(
        ctx,
        at,
        'column',
        stage.column,
        input,
        'Choose the column whose values become columns',
      );
      if (!stage.keys.length)
        ctx.out.push({ at, path: 'keys', message: 'List the values that become columns' });
      const taken = new Set(stage.rows);
      stage.keys.forEach((key, index) => {
        if (key.value === '')
          ctx.out.push({ at, path: `keys.${index}.value`, message: 'Set the value' });
        name(ctx, at, `keys.${index}.as`, key.as, 'column', taken);
      });
      expr(
        ctx,
        at,
        'measure.expr',
        stage.measure.expr,
        scope,
        stage.measure.fn === 'count' ? null : 'Choose what each column holds',
      );
      if (stage.total) name(ctx, at, 'total', stage.total, 'total column', taken);
      break;
    }
    case 'balance':
      if (!stage.keys.length)
        ctx.out.push({ at, path: 'keys', message: 'Choose what each row is for' });
      columns(ctx, at, 'keys', stage.keys, input);
      column(ctx, at, 'date', stage.date, input, 'Choose the date column');
      expr(ctx, at, 'inward', stage.inward, scope, 'Set the inward value');
      expr(ctx, at, 'outward', stage.outward, scope, 'Set the outward value');
      expr(ctx, at, 'periodFrom', stage.periodFrom, scope, 'Set the period start');
      expr(ctx, at, 'periodTo', stage.periodTo, scope, 'Set the period end');
      break;
    case 'classify':
      name(ctx, at, 'as', stage.as, 'bucket column');
      if (!stage.rules.length) ctx.out.push({ at, path: 'rules', message: 'Add a rule' });
      stage.rules.forEach((rule, index) => {
        if (!rule.value)
          ctx.out.push({ at, path: `rules.${index}.value`, message: 'Name the bucket' });
        expr(
          ctx,
          at,
          `rules.${index}.when`,
          rule.when,
          scope,
          'Set when a row goes in this bucket',
        );
      });
      break;
    case 'fifo':
      if (!stage.keys.length)
        ctx.out.push({ at, path: 'keys', message: 'Choose what each queue is kept per' });
      columns(ctx, at, 'keys', stage.keys, input);
      order(ctx, at, 'order', stage.order, scope, 'Choose the order, oldest first');
      expr(ctx, at, 'inward', stage.inward, scope, 'Set the inward value');
      expr(ctx, at, 'outward', stage.outward, scope, 'Set the outward value');
      if (stage.as && !NAME.test(stage.as))
        ctx.out.push({ at, path: 'as', message: 'A name uses letters, digits and _' });
      break;
    case 'periods': {
      column(ctx, at, 'date', stage.date, input, 'Choose the date column');
      for (const key of ['periodFrom', 'periodTo'] as const)
        if (!/^\s*(@[A-Za-z_]\w*|\d{4}-\d{2}-\d{2})\s*$/.test(stage[key] ?? ''))
          ctx.out.push({ at, path: key, message: 'Use a date input such as @from, or a date' });
      if (!stage.periods.length) ctx.out.push({ at, path: 'periods', message: 'Add a period' });
      const seen = new Set<string>();
      stage.periods.forEach((period, index) => {
        if (!NAME.test(period.name ?? ''))
          ctx.out.push({ at, path: `periods.${index}.name`, message: 'A name uses letters, digits and _' });
        else if (seen.has(period.name))
          ctx.out.push({ at, path: `periods.${index}.name`, message: 'Two periods have this name' });
        seen.add(period.name);
      });
      if (stage.as && !NAME.test(stage.as)) ctx.out.push({ at, path: 'as', message: 'A name uses letters, digits and _' });
      break;
    }
    case 'union': {
      if (stage.parts.length < 2)
        ctx.out.push({ at, path: 'parts', message: 'Stack at least two steps' });
      const target = cols(stage.id).map((col) => col.name);
      stage.parts.forEach((part, index) => {
        const partCols = cols(part.from);
        for (const [col, value] of Object.entries(part.set ?? {})) {
          expr(
            ctx,
            at,
            `parts.${index}.set`,
            value,
            columnScope(ctx, partCols),
            `Set a value for ${col}`,
          );
        }
        if (index === 0 || !part.from) return;
        const have = new Set([...partCols.map((col) => col.name), ...Object.keys(part.set ?? {})]);
        const missing = target.filter((col) => !have.has(col));
        if (missing.length)
          ctx.out.push({
            at,
            path: `parts.${index}.set`,
            message: `${part.from} has no ${missing.join(', ')}; set ${missing.length > 1 ? 'them' : 'it'}`,
          });
      });
      break;
    }
    case 'native':
      break;
    case 'engine':
      break;
    default: {
      // A project's step (`defineStudioStep`) checks its own settings.
      const own = studioStep((stage as Rdl2StageBase).kind);
      own?.check?.(stage as Rdl2StageBase, {
        column: (path, value, message) => column(ctx, at, path, value, input, message),
        formula: (path, value, message) => expr(ctx, at, path, value, scope, message),
        name: (path, value) => {
          if (value && !NAME.test(value)) ctx.out.push({ at, path, message: 'A name uses letters, digits and _' });
        },
        problem: (path, message) => ctx.out.push({ at, path, message }),
      });
    }
  }
}

function checkInputs(ctx: Ctx): void {
  const seen = new Set<string>();
  ctx.report.params.forEach((param, index) => {
    const path = `params.${index}`;
    if (!param.label)
      ctx.out.push({ at: AT_INPUTS, path: `${path}.label`, message: 'Give the input a label' });
    if (!NAME.test(param.id))
      ctx.out.push({
        at: AT_INPUTS,
        path: `${path}.id`,
        message: 'The input name uses letters, digits and _',
      });
    else if (seen.has(param.id))
      ctx.out.push({
        at: AT_INPUTS,
        path: `${path}.id`,
        message: `Two inputs are named @${param.id}`,
      });
    seen.add(param.id);
    const presetId = param.type === 'lookup' ? param.lookup?.preset : undefined;
    const preset = lookupPreset(presetId);
    if (presetId && !preset)
      ctx.out.push({
        at: AT_INPUTS,
        path: `${path}.lookup.preset`,
        message: `There is no lookup called ${presetId}; choose another or a plain list`,
      });
    else if (preset && param.lookup?.model !== preset.model)
      ctx.out.push({
        at: AT_INPUTS,
        path: `${path}.lookup.preset`,
        message: `The ${preset.title} lookup lists ${preset.model}, not ${param.lookup?.model ?? 'nothing'}`,
      });
    else if (preset && 'error' in resolvePath(ctx.catalog, preset.model, preset.label))
      ctx.out.push({
        at: AT_INPUTS,
        path: `${path}.lookup.preset`,
        message: `${preset.model} is not in this company's catalog`,
      });
    else if (param.type === 'lookup' && !preset) {
      if (!param.lookup?.model)
        ctx.out.push({
          at: AT_INPUTS,
          path: `${path}.lookup.model`,
          message: 'Choose what the user picks from',
        });
      else if (!param.lookup.label)
        ctx.out.push({
          at: AT_INPUTS,
          path: `${path}.lookup.label`,
          message: 'Choose the field the user sees',
        });
      else if ('error' in resolvePath(ctx.catalog, param.lookup.model, param.lookup.label)) {
        ctx.out.push({
          at: AT_INPUTS,
          path: `${path}.lookup.label`,
          message: `${param.lookup.label} is not a field there`,
        });
      }
    }
    if (param.type === 'select' && !param.options?.length)
      ctx.out.push({ at: AT_INPUTS, path: `${path}.options`, message: 'Add the choices' });
  });
}

function checkOutput(ctx: Ctx): void {
  const output = ctx.report.output;
  if (!ctx.report.stages.length) return;
  if (!output.stage) {
    ctx.out.push({ at: AT_OUTPUT, path: 'stage', message: 'Choose which step the report shows' });
    return;
  }
  if (!ctx.schemas.has(output.stage)) {
    ctx.out.push({ at: AT_OUTPUT, path: 'stage', message: `There is no step "${output.stage}"` });
    return;
  }
  const cols = ctx.schemas.get(output.stage) ?? [];
  const names = new Set(cols.map((col) => col.name));
  const missing = (path: string, col: string | undefined, hint = '') => {
    if (col && !names.has(col))
      ctx.out.push({ at: AT_OUTPUT, path, message: `The result has no column "${col}"${hint}` });
  };
  const sumHint = '; list the column names to sum, such as "amount"';
  if (!output.columns.length)
    ctx.out.push({ at: AT_OUTPUT, path: 'columns', message: 'Add the columns the report shows' });
  output.columns.forEach((col, index) => {
    if (!col.column)
      ctx.out.push({ at: AT_OUTPUT, path: `columns.${index}.column`, message: 'Choose a column' });
    missing(`columns.${index}.column`, col.column);
    missing(`columns.${index}.caption`, col.caption);
    if (!col.label)
      ctx.out.push({
        at: AT_OUTPUT,
        path: `columns.${index}.label`,
        message: 'Give the column a heading',
      });
  });
  (output.totals ?? []).forEach((col, index) => missing(`totals.${index}`, col, sumHint));
  const outScope = columnScope(ctx, cols);
  output.columns.forEach((col, index) => {
    missing(`columns.${index}.toneBy`, col.toneBy);
    if (col.total?.trim()) expr(ctx, AT_OUTPUT, `columns.${index}.total`, col.total, outScope, null);
  });
  const inputs = new Set(ctx.report.params.map((param) => param.id));
  (output.footers ?? []).forEach((footer, index) => {
    if (!footer.label?.trim()) ctx.out.push({ at: AT_OUTPUT, path: `footers.${index}.label`, message: 'Name the line' });
    if (footer.where?.trim()) expr(ctx, AT_OUTPUT, `footers.${index}.where`, footer.where, outScope, null);
    if (footer.needs && !inputs.has(footer.needs))
      ctx.out.push({ at: AT_OUTPUT, path: `footers.${index}.needs`, message: `There is no input @${footer.needs}` });
  });
  (output.groups ?? []).forEach((group, index) => {
    missing(`groups.${index}.column`, group.column);
    (group.subtotals ?? []).forEach((col, sub) => missing(`groups.${index}.subtotals.${sub}`, col, sumHint));
  });
  if (output.pageBy && !(output.groups ?? []).some((group) => group.column === output.pageBy))
    ctx.out.push({
      at: AT_OUTPUT,
      path: 'pageBy',
      message: `Pages are cut by "${output.pageBy}", which is no longer a group`,
    });
  (output.sort ?? []).forEach((item, index) => missing(`sort.${index}.column`, item.column));
  (output.cards ?? []).forEach((card, index) => missing(`cards.${index}.column`, card.column));
}

/** Every problem of the report, in step order. */
export function checkReport(
  report: Rdl2Report,
  catalog: Catalog,
  schemas: Map<string, ColumnInfo[]>,
  functions: readonly string[] = [],
): Issue[] {
  const ctx: Ctx = {
    report,
    catalog,
    schemas,
    functions,
    // A periods step gives earlier steps its span as @<id>_from and @<id>_to.
    params: [
      ...report.params.map((param) => param.id).filter(Boolean),
      ...report.stages.flatMap((stage) => (stage.kind === 'periods' && stage.id ? [`${stage.id}_from`, `${stage.id}_to`] : [])),
    ],
    out: [],
  };
  if (!report.title.trim())
    ctx.out.push({ at: AT_REPORT, path: 'title', message: 'Give the report a title' });
  checkInputs(ctx);
  if (!report.stages.length)
    ctx.out.push({ at: AT_REPORT, message: 'Add a "Read records" step to start' });
  const before = new Set<string>();
  const ids = new Set<string>();
  for (const stage of report.stages) {
    if (!NAME.test(stage.id))
      ctx.out.push({ at: stage.id, path: 'id', message: 'A step name uses letters, digits and _' });
    if (ids.has(stage.id))
      ctx.out.push({ at: stage.id, path: 'id', message: 'Two steps share this name' });
    ids.add(stage.id);
    if (!stepInfo(stage.kind) && stage.kind !== 'native')
      ctx.out.push({ at: stage.id, message: `Unknown step "${stage.kind as string}"` });
    else checkStage(ctx, stage, before);
    before.add(stage.id);
  }
  checkOutput(ctx);
  return ctx.out;
}

/** Issues of one place whose path is at or under `prefix`. */
export function issuesUnder(issues: readonly Issue[], at: string, prefix = ''): Issue[] {
  return issues.filter(
    (issue) =>
      issue.at === at && (!prefix || issue.path === prefix || issue.path?.startsWith(`${prefix}.`)),
  );
}
