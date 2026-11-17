import { describe, expect, it } from 'vitest';
import {
  applyImported,
  exportLayoutFile,
  exportLayoutsFile,
  layoutFileName,
  mergeImportedLayouts,
  overwrittenNames,
  readLayoutFile,
} from '../src/grid/layout/transfer';
import type { DeskFieldCatalog, DeskGridLayout } from '../src/grid/layout/types';

const catalog: DeskFieldCatalog = {
  relations: [],
  fields: [
    { key: 'id', label: 'Id', type: 'number' },
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'mrp', label: 'MRP', type: 'number' },
  ],
  always: ['id'],
};

const layout: DeskGridLayout = {
  id: 'layout-1',
  name: 'Low Range Products',
  kind: 'tab',
  columns: [
    { id: 'name', header: 'Name', lines: [['name']], sortField: 'name', filterField: 'name' },
    { id: 'mrp', header: 'MRP', lines: [['mrp']], sortField: 'mrp', filterField: 'mrp' },
  ],
  view: { sort: { column: 'name', direction: 'asc' }, filters: { mrp: '100..200' } },
  hideActions: true,
};

describe('grid layout files', () => {
  it('round-trips a layout into the same list', () => {
    const text = exportLayoutFile(layout, 'products', catalog, 'Products');
    const result = readLayoutFile(text, 'products', catalog);
    expect(result.ok).toBe(true);
    if (!result.ok || result.kind !== 'one') return;
    expect(result.layout.name).toBe('Low Range Products');
    expect(result.layout.columns.map((column) => column.id)).toEqual(['name', 'mrp']);
    expect(result.layout.view).toEqual(layout.view);
    expect(result.layout.hideActions).toBe(true);
    expect(result.dropped).toBe(0);
  });

  it('refuses a layout from another list and names where it came from', () => {
    const text = exportLayoutFile(layout, 'products', catalog, 'Products');
    const result = readLayoutFile(text, 'customers', catalog);
    expect(result).toEqual({ ok: false, error: 'This layout belongs to "Products". It can only be imported into that list.' });
  });

  it('refuses files that are not layout exports', () => {
    expect(readLayoutFile('not json', 'products', catalog).ok).toBe(false);
    expect(readLayoutFile(JSON.stringify({ hello: 1 }), 'products', catalog).ok).toBe(false);
    expect(readLayoutFile(JSON.stringify({ format: 'desk-grid-layout', version: 2, list: 'products', layout }), 'products', catalog).ok).toBe(false);
    expect(readLayoutFile(JSON.stringify({ format: 'desk-grid-layout', version: 1, list: 'products', layout: { columns: 'x' } }), 'products', catalog).ok).toBe(false);
    expect(readLayoutFile('x'.repeat(300 * 1024), 'products', catalog).ok).toBe(false);
  });

  it('drops columns whose fields this list lacks, and refuses a layout with none left', () => {
    const odd = { ...layout, columns: [...layout.columns, { id: 'gst', header: 'GST', lines: [['gstRate']] }] };
    const file = (value: DeskGridLayout): string => JSON.stringify({ format: 'desk-grid-layout', version: 1, list: 'products', layout: value });
    const result = readLayoutFile(file(odd), 'products', catalog);
    expect(result.ok && result.dropped).toBe(1);
    const none = readLayoutFile(file({ ...layout, columns: [{ id: 'gst', header: 'GST', lines: [['gstRate']] }] }), 'products', catalog);
    expect(none.ok).toBe(false);
  });

  it('keeps the edited layout id, and Default never hides actions', () => {
    expect(applyImported({ ...layout, id: 'mine' }, layout).id).toBe('mine');
    const onDefault = applyImported({ ...layout, id: 'default' }, layout);
    expect(onDefault.id).toBe('default');
    expect(onDefault.hideActions).toBeUndefined();
  });

  it('names the file after the list and layout', () => {
    expect(layoutFileName(layout, 'products')).toBe('products-low-range-products.layout.json');
  });
});

const shipped: DeskGridLayout = { ...layout, id: 'default', name: 'Default', kind: 'menu', hideActions: undefined as never };
delete (shipped as { hideActions?: boolean }).hideActions;

describe('all layouts in one file', () => {
  it('exports every layout with Default, and reads them back', () => {
    const text = exportLayoutsFile([shipped, layout, { ...layout, id: 'b', name: 'Other' }], 'products', catalog);
    const result = readLayoutFile(text, 'products', catalog);
    expect(result.ok && result.kind).toBe('all');
    if (!result.ok || result.kind !== 'all') return;
    expect(result.layouts.map((item) => item.id)).toEqual(['default', 'import-1', 'import-2']);
    expect(result.layouts.map((item) => item.name)).toEqual(['Default', 'Low Range Products', 'Other']);
    expect(readLayoutFile(text, 'customers', catalog).ok).toBe(false);
  });

  it('overwrite replaces Default and same-named layouts, and adds the rest', () => {
    const mine: DeskGridLayout[] = [{ ...layout, id: 'mine-1', name: 'low range products ', columns: [layout.columns[0]!] }, { ...layout, id: 'mine-2', name: 'Keep' }];
    const incoming: DeskGridLayout[] = [{ ...shipped, name: 'Default', columns: [layout.columns[1]!] }, layout, { ...layout, id: 'x', name: 'New one' }];
    let n = 0;
    const merged = mergeImportedLayouts(mine, incoming, 'overwrite', () => `new-${(n += 1)}`);
    expect(merged.map((item) => [item.id, item.name])).toEqual([
      ['default', 'Default'],
      ['mine-1', 'Low Range Products'],
      ['mine-2', 'Keep'],
      ['new-1', 'New one'],
    ]);
    expect(merged[1]?.columns).toHaveLength(2);
    expect(overwrittenNames(mine, incoming)).toEqual(['Default', 'low range products ']);
  });

  it('add keeps every layout and adds copies under new names', () => {
    const mine: DeskGridLayout[] = [{ ...shipped }, { ...layout, id: 'mine-1' }];
    let n = 0;
    const merged = mergeImportedLayouts(mine, [shipped, layout], 'add', () => `new-${(n += 1)}`);
    expect(merged.map((item) => [item.id, item.name])).toEqual([
      ['default', 'Default'],
      ['mine-1', 'Low Range Products'],
      ['new-1', 'Default (imported)'],
      ['new-2', 'Low Range Products (2)'],
    ]);
  });
});

describe('layout note in files', () => {
  it('travels with the layout', () => {
    const result = readLayoutFile(exportLayoutFile({ ...layout, note: 'Red means above MRP' }, 'products', catalog), 'products', catalog);
    expect(result.ok && result.kind === 'one' && result.layout.note).toBe('Red means above MRP');
  });
});
