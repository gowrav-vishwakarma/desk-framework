import { describe, expect, it } from 'vitest';
import {
  blocksText,
  cellBlocks,
  cleanLayout,
  defaultColumnInfo,
  layoutColumnInfo,
  layoutColumns,
  ruleFieldKeys,
  selectionOf,
  shippedLayout,
} from '../src/grid/layout/compile';
import { parseRule } from '../src/grid/layout/ruleExpr';
import type { DeskFieldCatalog, DeskGridLayout } from '../src/grid/layout/types';

const catalog: DeskFieldCatalog = {
  relations: [
    { path: 'brand', label: 'Brand' },
    { path: 'aliases', label: 'Aliases', many: true, maxItems: 3 },
    { path: 'branches', label: 'Branches', many: true },
    { path: 'branches.branch', label: 'Branch' },
  ],
  fields: [
    { key: 'id', label: 'Id', type: 'number' },
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'sku', label: 'SKU', type: 'text' },
    { key: 'mrp', label: 'MRP', type: 'number' },
    { key: 'brand.brandName', label: 'Brand', type: 'text' },
    { key: 'aliases.alias', label: 'Alias', type: 'text' },
    { key: 'branches.branch.name', label: 'Branch', type: 'text' },
  ],
  always: ['id'],
};

const row = {
  id: 7,
  name: 'Tea',
  sku: 'T1',
  mrp: 40,
  brand: { brandName: 'Leaf' },
  aliases: [{ alias: 'chai' }, { alias: 'cha' }, { alias: 'te' }, { alias: 'thé' }],
  branches: [{ branch: { name: 'North' } }, { branch: { name: 'South' } }],
};

const layout: DeskGridLayout = {
  id: 'l1',
  name: 'With aliases',
  kind: 'menu',
  columns: [
    { id: 'c1', header: 'Product', lines: [['name', 'sku'], ['brand.brandName']], separator: ' · ', sortField: 'brand.brandName', filterField: 'name' },
    { id: 'c2', header: 'Aliases', lines: [[{ list: 'aliases', fields: ['aliases.alias'], show: 'comma', max: 2 }]] },
    { id: 'c3', header: 'Branches', lines: [[{ list: 'branches', fields: ['branches.branch.name'], show: 'table', max: 5 }]] },
  ],
};

describe('grid layout compiler', () => {
  it('stacks lines and joins parts on one line', () => {
    const column = layout.columns[0]!;
    expect(cellBlocks(column, row, catalog)).toEqual([
      { kind: 'text', text: 'Tea · T1' },
      { kind: 'text', text: 'Leaf' },
    ]);
    const labeled = { ...column, lines: [[{ field: 'name', label: 'Name' }, 'sku']] };
    expect(cellBlocks(labeled, row, catalog)).toEqual([{ kind: 'text', text: 'Name: Tea · T1' }]);
    const priced = {
      ...column,
      lines: [[{ field: 'sku', style: { look: 'chip' as const, tone: 'danger' as const }, rules: [{ op: 'eq' as const, value: 'T1', tone: 'success' as const }] }]],
    };
    expect(cellBlocks(priced, row, catalog)).toEqual([{ kind: 'line', spans: [{ text: 'T1', look: 'chip', tone: 'success' }] }]);
    const placed = {
      ...column,
      lines: [[
        { field: 'name', style: { place: 'left' as const, pad: { top: 1, right: 4, bottom: 1, left: 4 } } },
        { field: 'sku', style: { place: 'right' as const, pad: { top: 8 } } },
      ]],
    };
    expect(cellBlocks(placed, row, catalog)).toEqual([{
      kind: 'line',
      spans: [{ text: 'Tea' }, { text: 'T1', place: 'right', pad: { top: 8 } }],
    }]);
  });

  it('shows a child list up to its max with a more marker', () => {
    expect(cellBlocks(layout.columns[1]!, row, catalog)).toEqual([{ kind: 'text', text: 'chai, cha +2 more' }]);
  });

  it('draws a child list as a table', () => {
    const blocks = cellBlocks(layout.columns[2]!, row, catalog);
    expect(blocks).toEqual([{ kind: 'table', headers: ['Branch'], rows: [['North'], ['South']], more: 0 }]);
    expect(blocksText(blocks)).toBe('North; South');
  });

  it('builds grid columns with sort and filter from the layout', () => {
    const [first, second] = layoutColumns(layout, catalog);
    expect(first?.sortable).toBe(true);
    expect(second?.sortable).toBe(false);
    expect(first?.lineCount?.(row)).toBe(2);
  });

  it('selects only what the cells read, with a per-parent limit clamped to the catalog', () => {
    const uses = [
      { key: 'name' },
      { key: 'brand.brandName' },
      { key: 'aliases.alias', limit: 10 },
      { key: 'branches.branch.name', limit: 2 },
    ];
    expect(selectionOf(uses, catalog)).toEqual({
      fields: ['id', 'name'],
      relations: {
        brand: { fields: ['brandName'], relations: {} },
        aliases: { fields: ['alias'], relations: {}, many: true, limit: 3 },
        branches: { fields: [], relations: { branch: { fields: ['name'], relations: {} } }, many: true, limit: 2 },
      },
    });
  });

  it('drops fields the catalog no longer has, and sort on a list field', () => {
    const stale: DeskGridLayout = {
      ...layout,
      columns: [
        { id: 'x', header: 'Gone', lines: [['oldField']] },
        { id: 'y', header: 'Alias', lines: [[{ list: 'aliases', fields: ['aliases.alias'], show: 'space', max: 99 }]], sortField: 'aliases.alias' },
      ],
    };
    const clean = cleanLayout(stale, catalog);
    expect(clean.columns.map((column) => column.id)).toEqual(['y']);
    expect(clean.columns[0]?.sortField).toBeNull();
    expect((clean.columns[0]?.lines[0]?.[0] as { max: number }).max).toBe(3);
  });

  it('keeps locked columns in place and drops user copies of them', () => {
    const locked: DeskFieldCatalog = {
      ...catalog,
      locked: [
        { id: 'lockName', header: 'Name', lines: [['name']], sortField: 'name', pin: 'start' },
        { id: 'lockMrp', header: 'MRP', lines: [['mrp']], pin: 'end' },
      ],
    };
    const mine: DeskGridLayout = {
      ...layout,
      columns: [{ id: 'lockName', header: 'Renamed', lines: [['sku']] }, ...layout.columns],
    };
    const clean = cleanLayout(mine, locked);
    expect(clean.columns.map((column) => column.id)).toEqual(['c1', 'c2', 'c3']);
    const grid = layoutColumns(clean, locked);
    expect(grid.map((column) => column.id)).toEqual(['lockName', 'c1', 'c2', 'c3', 'lockMrp']);
    expect(grid[0]).toMatchObject({ header: 'Name', locked: true, pin: 'start' });
    expect(grid[4]).toMatchObject({ locked: true, pin: 'end' });
  });

  it('reads a developer column relation as a catalog key', () => {
    const info = defaultColumnInfo(
      { id: 'brandName', header: 'Brand', fields: ['brand.brandName'], relation: { model: 'Brand', as: 'brand', field: 'brandName' } },
      catalog,
    );
    expect(info.sortField).toBe('brand.brandName');
    expect(info.filterField).toBe('brand.brandName');
    expect(info.uses).toEqual([{ key: 'brand.brandName' }]);
    const manager = defaultColumnInfo(
      { id: 'manager', header: 'Manager', relation: { model: 'Employee', as: 'employee', field: 'name' } },
      { ...catalog, relations: [...catalog.relations, { path: 'employee', label: 'Employee' }], fields: [...catalog.fields, { key: 'employee.name', label: 'Manager', type: 'text' }] },
    );
    expect(manager.uses).toEqual([{ key: 'employee.name' }]);
  });

  it('ships repeats hide onto the default layout and back onto grid columns', () => {
    const shipped = shippedLayout(
      [
        { id: 'name', header: 'Name', repeats: 'hide' },
        { id: 'sku', header: 'SKU' },
      ],
      catalog,
    );
    expect(shipped.columns[0]?.repeats).toBe('hide');
    expect(shipped.columns[1]?.repeats).toBeUndefined();
    expect(layoutColumns(shipped, catalog)[0]?.repeats).toBe('hide');
    expect(layoutColumns(shipped, catalog)[1]?.repeats).toBeUndefined();
  });

  it('ships the visible columns as the default layout', () => {
    const shipped = shippedLayout(
      [
        { id: 'name', header: 'Name', width: 180, textLayoutMenu: true },
        { id: 'sku', header: 'SKU', width: 110, align: 'right' },
        { id: 'mrp', header: 'MRP', visible: () => false },
        { id: 'missing', header: 'Missing' },
      ],
      catalog,
    );
    expect(shipped.id).toBe('default');
    expect(shipped.name).toBe('Default');
    expect(shipped.columns.map((column) => column.id)).toEqual(['name', 'sku']);
    expect(shipped.columns[1]?.align).toBe('right');
    expect(layoutColumns(shipped, catalog).map((column) => column.header)).toEqual(['Name', 'SKU']);
  });

  it('keeps a virtual column on the layout and out of the selection', () => {
    const withScope: DeskFieldCatalog = {
      ...catalog,
      fields: [...catalog.fields, { key: 'scope', label: 'Scope', type: 'text', virtual: true, sortable: false, filterable: false }],
    };
    const shipped = shippedLayout([{ id: 'scope', header: 'Scope', fields: [] }, { id: 'name', header: 'Name' }], withScope);
    expect(shipped.columns.map((column) => column.id)).toEqual(['scope', 'name']);
    expect(shipped.columns[0]?.sortField).toBeNull();
    expect(selectionOf([{ key: 'scope' }, { key: 'name' }], withScope).fields).toEqual(['id', 'name']);
  });

  it('compares other fields and still accepts a saved value rule', () => {
    const prices: DeskFieldCatalog = {
      ...catalog,
      fields: [...catalog.fields, { key: 'sellingPrice', label: 'Selling price', type: 'number' }],
    };
    const priced = { name: 'Bolt', sku: 'T1', mrp: 100, sellingPrice: 250 };
    const column = {
      id: 'name',
      header: 'Name',
      lines: [[
        {
          field: 'name',
          rules: [
            { op: 'gt' as const, left: { field: 'sellingPrice' }, right: { field: 'mrp' }, tone: 'danger' as const },
            { when: 'mrp > sellingPrice * 2', tone: 'danger' as const, bold: true },
          ],
        },
      ]],
    };
    expect(cellBlocks(column, priced, prices)[0]).toEqual({ kind: 'line', spans: [{ text: 'Bolt', tone: 'danger' }] });
    expect(cellBlocks(column, { ...priced, mrp: 600, sellingPrice: 200 }, prices)[0]).toEqual({
      kind: 'line',
      spans: [{ text: 'Bolt', tone: 'danger', bold: true }],
    });
    const legacy = { id: 'sku', header: 'SKU', lines: [[{ field: 'sku', rules: [{ op: 'eq' as const, value: 'T1', tone: 'danger' as const }] }]] };
    expect(cellBlocks(legacy, priced, prices)[0]).toEqual({ kind: 'line', spans: [{ text: 'T1', tone: 'danger' }] });
    const keys = ruleFieldKeys(prices);
    expect(selectionOf(layoutColumnInfo(column, prices).uses, prices).fields).toEqual(
      expect.arrayContaining(['name', 'sellingPrice', 'mrp']),
    );

    const rich = {
      id: 'name',
      header: 'Name',
      lines: [[{
        field: 'name',
        rules: [{
          when: 'sellingPrice < 5000 and (mrp - sellingPrice) / sellingPrice > 0.5 or sku in ("T1", "T2")',
          tone: 'warning' as const,
        }],
      }]],
    };
    expect(cellBlocks(rich, priced, prices)[0]).toEqual({ kind: 'line', spans: [{ text: 'Bolt', tone: 'warning' }] });
    expect(cellBlocks({
      id: 'name',
      header: 'Name',
      lines: [[{ field: 'name', rules: [{ when: 'sellingPrice between 200 and 300 and name starts "bo"', tone: 'info' as const }] }]],
    }, priced, prices)[0]).toEqual({ kind: 'line', spans: [{ text: 'Bolt', tone: 'info' }] });
    expect(cellBlocks({
      id: 'name',
      header: 'Name',
      lines: [[{ field: 'name', rules: [{ when: 'mrp + sellingPrice * 2 = 600', tone: 'success' as const }] }]],
    }, priced, prices)[0]).toEqual({ kind: 'line', spans: [{ text: 'Bolt', tone: 'success' }] });
    expect(cellBlocks({
      id: 'name',
      header: 'Name',
      lines: [[{ field: 'name', rules: [{ when: 'alert(1)', tone: 'danger' as const }] }]],
    }, priced, prices)[0]).toEqual({ kind: 'text', text: 'Bolt' });
    expect(cellBlocks({
      id: 'name',
      header: 'Name',
      lines: [[{ field: 'name', rules: [{ when: 'mrp / 0 > 1 or name.constructor', tone: 'danger' as const }] }]],
    }, priced, prices)[0]).toEqual({ kind: 'text', text: 'Bolt' });
    const cleaned = cleanLayout(
      { id: 'x', name: 'X', kind: 'menu', columns: [{ id: 'name', header: 'Name', lines: [[{ field: 'name', rules: [{ when: 'alert(1)', tone: 'danger' }] }]] }] },
      prices,
    );
    expect(cleaned.columns[0]?.lines[0]?.[0]).toBe('name');
    expect(parseRule('aliases.alias is empty', keys).ok).toBe(false);
    expect(parseRule('this is not empty', keys).ok).toBe(true);
  });
});

describe('saved layout view', () => {
  it('keeps a sort and filters on columns that allow them', () => {
    const clean = cleanLayout(
      { ...layout, view: { sort: { column: 'c1', direction: 'asc' }, filters: { c1: ' =Tea ' } }, hideActions: true },
      catalog,
    );
    expect(clean.view).toEqual({ sort: { column: 'c1', direction: 'asc' }, filters: { c1: '=Tea' } });
    expect(clean.hideActions).toBe(true);
  });

  it('drops a sort or filter on a column that cannot sort or filter, or is gone', () => {
    const clean = cleanLayout(
      { ...layout, view: { sort: { column: 'c2', direction: 'desc' }, filters: { c2: 'chai', gone: 'x', c1: '  ' } } },
      catalog,
    );
    expect(clean.view).toBeUndefined();
    const noSort = cleanLayout({ ...layout, view: { sort: { column: 'missing', direction: 'asc' }, filters: { c1: 'tea' } } }, catalog);
    expect(noSort.view).toEqual({ filters: { c1: 'tea' } });
  });

  it('counts locked columns as part of the layout', () => {
    const locked: DeskFieldCatalog = {
      ...catalog,
      locked: [{ id: 'lockedSku', header: 'SKU', lines: [['sku']], sortField: 'sku', filterField: 'sku', pin: 'start' }],
    };
    const clean = cleanLayout({ ...layout, view: { sort: { column: 'lockedSku', direction: 'desc' }, filters: { lockedSku: 'T1' } } }, locked);
    expect(clean.view).toEqual({ sort: { column: 'lockedSku', direction: 'desc' }, filters: { lockedSku: 'T1' } });
  });

  it('never lets Default hide actions', () => {
    const clean = cleanLayout({ ...layout, id: 'default', hideActions: true }, catalog);
    expect(clean.hideActions).toBeUndefined();
    expect(cleanLayout({ ...layout, hideActions: false }, catalog).hideActions).toBeUndefined();
  });
});

describe('layout note', () => {
  it('keeps trimmed text, drops an empty note, and caps the length', () => {
    expect(cleanLayout({ ...layout, note: '  Red MRP is above price. ' }, catalog).note).toBe('Red MRP is above price.');
    expect(cleanLayout({ ...layout, note: '   ' }, catalog).note).toBeUndefined();
    expect(cleanLayout({ ...layout, note: 'x'.repeat(900) }, catalog).note).toHaveLength(500);
  });
});

describe('hidden layout columns', () => {
  it('keeps the flag, starts the grid column hidden, and still allows a saved filter on it', () => {
    const hidden = { ...layout, columns: layout.columns.map((column) => (column.id === 'c1' ? { ...column, hidden: true } : column)), view: { filters: { c1: 'tea' } } };
    const clean = cleanLayout(hidden, catalog);
    expect(clean.columns[0]?.hidden).toBe(true);
    expect(clean.view).toEqual({ filters: { c1: 'tea' } });
    expect(layoutColumns(clean, catalog)[0]?.defaultHidden).toBe(true);
    expect(cleanLayout({ ...layout, columns: [{ ...layout.columns[0]!, hidden: false }] }, catalog).columns[0]?.hidden).toBeUndefined();
  });
});
