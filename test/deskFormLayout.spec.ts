import { describe, expect, it } from 'vitest';
import { addGap, hideField, moveField, removeSection, setFieldCols, setFieldRowStart, setLayoutOption, toggleInset } from '../src/formLayout/edit';
import { labelStyleFor } from '../src/formLayout/labels';
import { resolveFormLayout } from '../src/formLayout/resolve';
import { sectionSummary } from '../src/formLayout/summary';
import { FORM_LAYOUT_VERSION, layoutSlots, slotCols, slotGridVars, type DeskFormLayout, type DeskLayoutFieldRef, type DeskLayoutOption, type DeskLayoutSlot } from '../src/formLayout/types';

function slots(...ids: string[]): DeskLayoutSlot[] {
  return layoutSlots(ids);
}

function layout(): DeskFormLayout {
  return {
    version: FORM_LAYOUT_VERSION,
    labelStyle: 'side',
    inset: ['creditDays', 'dueDate'],
    hidden: [],
    zones: {
      header: [
        { id: 'main', title: 'Main', open: true, fields: slots('party', 'date', 'number') },
        { id: 'credit', title: 'Credit', fields: slots('dueDate', 'creditDays') },
      ],
    },
  };
}

const fields: DeskLayoutFieldRef[] = [
  { id: 'party', locked: true, zone: 'header', sectionId: 'main' },
  { id: 'date', locked: true, zone: 'header', sectionId: 'main' },
  { id: 'number', locked: true, zone: 'header', sectionId: 'main' },
  { id: 'dueDate', zone: 'header', sectionId: 'credit' },
  { id: 'creditDays', zone: 'header', sectionId: 'credit' },
];

describe('resolveFormLayout', () => {
  it('drops an unknown id, keeps a hidden id, and puts a new id in its default section', () => {
    const saved: DeskFormLayout = {
      ...layout(),
      hidden: ['creditDays'],
      zones: {
        header: [
          { id: 'main', title: 'Main', open: true, fields: slots('party', 'gone', 'date') },
          { id: 'credit', title: 'Credit', fields: slots('dueDate') },
        ],
      },
    };
    const next = resolveFormLayout(layout(), saved, [...fields, { id: 'gst', zone: 'header', sectionId: 'credit' }]);
    expect(next.zones.header?.[0]?.fields).toEqual(slots('party', 'date', 'number'));
    expect(next.zones.header?.[0]?.fields.map((field) => field.id)).not.toContain('gone');
    expect(next.hidden).toEqual(['creditDays']);
    expect(next.zones.header?.[1]?.fields).toEqual(slots('dueDate', 'gst'));
    expect(layout().zones.header?.[0]?.fields).toEqual(slots('party', 'date', 'number'));
  });

  it('puts a locked id back when a save hid it, and ignores an old version', () => {
    const saved = { ...layout(), version: 2, hidden: ['party'] };
    const next = resolveFormLayout(layout(), saved, fields);
    expect(next.zones.header?.[0]?.fields.map((field) => field.id)).toContain('party');
    expect(next.hidden).not.toContain('party');
    const hidCredit: DeskFormLayout = {
      ...layout(),
      hidden: ['party', 'dueDate'],
      zones: {
        header: [
          { id: 'main', title: 'Main', open: true, fields: slots('party', 'date', 'number') },
          { id: 'credit', title: 'Credit', fields: slots('creditDays') },
        ],
      },
    };
    const hidden = resolveFormLayout(layout(), hidCredit, fields);
    expect(hidden.hidden).toEqual(['dueDate']);
    expect(hidden.zones.header?.[0]?.fields.map((field) => field.id)).toContain('party');
  });

  it('recreates a default section the user removed when its fields are still allowed', () => {
    const saved: DeskFormLayout = {
      ...layout(),
      zones: { header: [{ id: 'main', title: 'Main', open: true, fields: slots('party', 'date', 'number') }] },
    };
    const next = resolveFormLayout(layout(), saved, [...fields, { id: 'note', zone: 'header', sectionId: 'more' }]);
    expect(next.zones.header?.find((section) => section.id === 'credit')?.fields).toEqual(slots('dueDate', 'creditDays'));
    expect(next.zones.header?.find((section) => section.id === 'more')?.fields).toEqual(slots('note'));
  });

  it('keeps a known layout option and uses the default when the save is missing or unknown', () => {
    const option: DeskLayoutOption = {
      id: 'warehouse',
      label: 'Warehouse',
      default: 'page',
      choices: [
        { value: 'page', label: 'Page' },
        { value: 'default', label: 'Default' },
      ],
    };
    const saved: DeskFormLayout = { ...layout(), options: { warehouse: 'default', gone: 'x' } };
    expect(resolveFormLayout(layout(), saved, fields, [option]).options).toEqual({ warehouse: 'default' });
    expect(resolveFormLayout(layout(), null, fields, [option]).options).toEqual({ warehouse: 'page' });
    expect(resolveFormLayout(layout(), { ...layout(), options: { warehouse: 'nope' } }, fields, [option]).options).toEqual({ warehouse: 'page' });
    expect(layout().options).toBeUndefined();
    expect(setLayoutOption(layout(), 'warehouse', 'default').options).toEqual({ warehouse: 'default' });
    expect(layout().options).toBeUndefined();
  });

  it('reads a saved string list as span 1 and keeps a wider slot', () => {
    const saved = {
      version: FORM_LAYOUT_VERSION,
      labelStyle: 'side' as const,
      inset: ['creditDays', 'dueDate'],
      hidden: [],
      zones: {
        header: [
          { id: 'main', title: 'Main', open: true, fields: ['party', { id: 'date', span: 3 }, 'number'] },
          { id: 'credit', title: 'Credit', fields: ['dueDate', 'creditDays'] },
        ],
      },
    };
    const next = resolveFormLayout(layout(), saved, fields);
    // An old span of 3 columns becomes 9 twelfths of the row.
    expect(next.zones.header?.[0]?.fields).toEqual([{ id: 'party' }, { id: 'date', cols: 9 }, { id: 'number' }]);
    const wide = layout();
    const date = wide.zones.header?.[0]?.fields.find((field) => field.id === 'date');
    if (date) {
      date.cols = 6;
      date.row = true;
    }
    const moved = moveField(wide, 'date', { zone: 'header', sectionId: 'credit', index: 0 });
    expect(moved.zones.header?.[1]?.fields[0]).toEqual({ id: 'date', cols: 6, row: true });
  });
});

describe('layout edits', () => {
  it('moves a field across sections and refuses to hide a locked field', () => {
    const moved = moveField(layout(), 'dueDate', { zone: 'header', sectionId: 'main', index: 1 });
    expect(moved.zones.header?.[0]?.fields).toEqual(slots('party', 'dueDate', 'date', 'number'));
    expect(moved.zones.header?.[1]?.fields).toEqual(slots('creditDays'));
    const current = layout();
    expect(hideField(current, 'party', true)).toBe(current);
    const hidden = hideField(layout(), 'dueDate', false);
    expect(hidden.hidden).toEqual(['dueDate']);
    expect(hidden.zones.header?.[1]?.fields).toEqual(slots('creditDays'));
  });

  it('sends a removed section to Hidden and keeps its locked fields', () => {
    const removed = removeSection(layout(), 'header', 'main', ['party', 'date', 'number']);
    expect(removed.hidden).toEqual([]);
    expect(removed.zones.header?.[0]?.fields).toEqual(slots('dueDate', 'creditDays', 'party', 'date', 'number'));
    const only = removeSection(
      { ...layout(), zones: { header: [{ id: 'main', title: 'Main', open: true, fields: slots('party', 'date') }] } },
      'header',
      'main',
      ['party', 'date'],
    );
    expect(only.zones.header?.[0]?.fields).toEqual(slots('party', 'date'));
    const credit = removeSection(layout(), 'header', 'credit', []);
    expect(credit.hidden).toEqual(['dueDate', 'creditDays']);
    expect(credit.zones.header?.some((section) => section.id === 'credit')).toBe(false);
  });

  it('toggles the label inside the input', () => {
    const next = toggleInset(layout(), 'party');
    expect(next.inset).toContain('party');
    expect(toggleInset(next, 'party').inset).not.toContain('party');
  });
});

describe('label style and summary', () => {
  it('draws a date with the label inside the input when the form uses placeholders', () => {
    const form = layout();
    expect(labelStyleFor(form, { id: 'party', kind: 'text' })).toBe('side');
    form.labelStyle = 'placeholder';
    expect(labelStyleFor(form, { id: 'party', kind: 'text' })).toBe('placeholder');
    expect(labelStyleFor(form, { id: 'creditDays', kind: 'text' })).toBe('inset');
    expect(labelStyleFor(form, { id: 'date', kind: 'date' })).toBe('inset');
    form.labelStyle = 'top';
    expect(labelStyleFor(form, { id: 'date', kind: 'date' })).toBe('top');
  });

  it('lists problems first and skips empty fields', () => {
    const summary = sectionSummary([
      { label: 'Salesman', value: 'Ravi' },
      { label: 'Bill number', value: '' },
      { label: 'Due date', value: '12-10-2026', problem: true },
    ]);
    expect(summary.problem).toBe(true);
    expect(summary.text).toBe('Due date 12-10-2026 · Salesman Ravi');
    expect(sectionSummary([{ label: 'Bill number', value: '  ', problem: true }]).text).toBe('Bill number *');
    expect(sectionSummary([{ label: 'Route', value: '' }]).text).toBe('');
  });
});

describe('12-column field widths', () => {
  it('sets, clamps, and clears a width, and starts a row', () => {
    const wide = setFieldCols(layout(), 'party', 6);
    expect(wide.zones.header?.[0]?.fields[0]).toEqual({ id: 'party', cols: 6 });
    expect(setFieldCols(layout(), 'party', 40).zones.header?.[0]?.fields[0]).toEqual({ id: 'party', cols: 12 });
    expect(setFieldCols(wide, 'party', null).zones.header?.[0]?.fields[0]).toEqual({ id: 'party' });
    const row = setFieldRowStart(layout(), 'number', true);
    expect(row.zones.header?.[0]?.fields.find((field) => field.id === 'number')).toEqual({ id: 'number', row: true });
    expect(setFieldRowStart(row, 'number', false).zones.header?.[0]?.fields.find((field) => field.id === 'number')).toEqual({ id: 'number' });
    const current = layout();
    expect(setFieldCols(current, 'missing', 4)).toBe(current);
  });

  it('defaults by label style and widens on smaller screens', () => {
    expect(slotCols({ id: 'a' }, 'side')).toBe(3);
    expect(slotCols({ id: 'a' }, 'placeholder')).toBe(2);
    expect(slotCols({ id: 'a', cols: 5 }, 'side')).toBe(5);
    expect(slotGridVars({ id: 'a' }, 'side')).toEqual({ '--desk-slot-cols': '3', '--desk-slot-cols-md': '4', '--desk-slot-cols-sm': '6' });
    expect(slotGridVars({ id: 'a', cols: 8 }, 'side')).toEqual({ '--desk-slot-cols': '8', '--desk-slot-cols-md': '11', '--desk-slot-cols-sm': '12' });
  });
});

describe('blank boxes', () => {
  it('adds a gap that survives resolve, and deleting it leaves no hidden entry', () => {
    const added = addGap(layout(), 'header', 'main', 1);
    expect(added.id).toMatch(/^gap:/);
    expect(added.layout.zones.header?.[0]?.fields[1]).toEqual({ id: added.id });
    const resolved = resolveFormLayout(layout(), added.layout, fields);
    expect(resolved.zones.header?.[0]?.fields.map((field) => field.id)).toContain(added.id);
    expect(resolved.hidden).not.toContain(added.id);
    const removed = hideField(added.layout, added.id, false);
    expect(removed.zones.header?.[0]?.fields.some((field) => field.id === added.id)).toBe(false);
    expect(removed.hidden).not.toContain(added.id);
  });

  it('drops a gap when its section is removed, and refuses a missing section', () => {
    const added = addGap(layout(), 'header', 'credit');
    const removed = removeSection(added.layout, 'header', 'credit', []);
    expect(removed.hidden.some((id) => id.startsWith('gap:'))).toBe(false);
    expect(addGap(layout(), 'header', 'nope').id).toBe('');
  });
});
