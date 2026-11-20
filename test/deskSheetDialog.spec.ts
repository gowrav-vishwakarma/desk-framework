import { describe, expect, it } from 'vitest';
import { defineComponent, nextTick, reactive, ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import DeskSettingsGrid from '../src/grid/DeskSettingsGrid.vue';
import DeskSheetDialog from '../src/form/DeskSheetDialog.vue';
import { sectionRows } from '../src/grid/settings';

describe('sheet dialog', () => {
  it('Enter on the last cell focuses Save, and Save emits save', async () => {
    const saved: string[] = [];
    const Harness = defineComponent({
      components: { DeskSheetDialog },
      setup() {
        const open = ref(true);
        const state = reactive<Record<string, unknown>>({ a: '' });
        const rows = sectionRows('f', 'Fields', [{ key: 'a', label: 'A', editor: 'text' }]);
        return {
          open,
          rows,
          read: (key: string) => state[key],
          onSave: () => saved.push('save'),
        };
      },
      template: `<DeskSheetDialog v-model:open="open" title="Director" subtitle="Add" :rows="rows" :read="read" @save="onSave" />`,
    });
    const wrapper = mount(Harness, { attachTo: document.body });
    await nextTick();
    const heading = document.body.querySelector('.desk-sheet-head h3');
    expect(heading?.textContent).toBe('Director — Add');
    const grid = document.body.querySelector('.table-content');
    if (!(grid instanceof HTMLElement)) throw new Error('grid missing');
    grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await nextTick();
    const input = document.body.querySelector('.desk-sheet-body input');
    if (!(input instanceof HTMLInputElement)) throw new Error('editor missing');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flushPromises();
    const save = document.body.querySelector('[data-desk-field="sheet-save"]');
    expect(document.activeElement).toBe(save);
    if (!(save instanceof HTMLButtonElement)) throw new Error('save missing');
    save.click();
    expect(saved).toEqual(['save']);
    wrapper.unmount();
  });

  it('the close button runs beforeClose and stays open when that says no', async () => {
    let asked = 0;
    const Harness = defineComponent({
      components: { DeskSheetDialog },
      setup() {
        const open = ref(true);
        const rows = sectionRows('f', 'Fields', [{ key: 'a', label: 'A', editor: 'text' }]);
        return {
          open,
          rows,
          read: () => '',
          beforeClose: () => {
            asked += 1;
            return false;
          },
        };
      },
      template: `<DeskSheetDialog v-model:open="open" title="Director" :rows="rows" :read="read" :before-close="beforeClose" />`,
    });
    const wrapper = mount(Harness, { attachTo: document.body });
    await nextTick();
    const close = document.body.querySelector('[aria-label="Close"]');
    if (!(close instanceof HTMLButtonElement)) throw new Error('close missing');
    close.click();
    await flushPromises();
    expect(asked).toBe(1);
    expect(document.body.querySelector('.desk-sheet-head')).not.toBeNull();
    wrapper.unmount();
  });
});

describe('settings sheet marks', () => {
  it('shows a chevron on a dropdown and a search mark on a lookup', () => {
    const wrapper = mount(DeskSettingsGrid, {
      attachTo: document.body,
      props: {
        rows: sectionRows('s', 'Section', [
          { key: 'kind', label: 'Kind', editor: 'select', options: [{ label: 'A', value: 'a' }] },
          { key: 'who', label: 'Who', editor: 'lookup', lookup: { labelKey: 'name', valueKey: 'id', columns: [] } },
          { key: 'note', label: 'Note', editor: 'text' },
        ]),
        read: () => '',
      },
    });
    expect(wrapper.get('[data-setting="kind"]').classes()).toContain('marker-select');
    expect(wrapper.get('[data-setting="who"]').classes()).toContain('marker-lookup');
    expect(wrapper.get('[data-setting="note"]').find('.desk-affix').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('settings sheet: clearing an optional pick', () => {
  const lookup = { labelKey: 'name', valueKey: 'id', columns: [] };
  /** Delete on the cell reached by keyboard (a click opens the editor, whose list starts with "---" for the same). */
  const deleteOn = async (required: boolean) => {
    const wrapper = mount(DeskSettingsGrid, {
      attachTo: document.body,
      props: { rows: sectionRows('s', 'Section', [{ key: 'who', label: 'Who', editor: 'lookup', lookup, required }]), read: () => ({ id: 1, name: 'Item A' }) },
    });
    const grid = wrapper.get('.table-content');
    await grid.trigger('focus');
    await grid.trigger('keydown', { key: 'Delete' });
    const changes = wrapper.emitted('change') ?? [];
    wrapper.unmount();
    return changes;
  };

  it('Delete empties an optional lookup (as it does chips); a required one keeps its value', async () => {
    expect(await deleteOn(false)).toEqual([['who', null]]);
    expect(await deleteOn(true)).toEqual([]);
  });
});

describe('settings sheet long values', () => {
  it('cuts a long value in the middle and keeps the full text on the cell', async () => {
    const long = `${'a'.repeat(20)}MIDDLE${'b'.repeat(30)}`;
    const wrapper = mount(DeskSettingsGrid, {
      attachTo: document.body,
      props: {
        rows: sectionRows('s', 'Section', [{ key: 'key', label: 'Passkey', editor: 'text' }]),
        read: () => long,
      },
    });
    await nextTick();
    const cell = wrapper.get('[data-setting="key"]');
    expect(cell.text()).toBe(`${'a'.repeat(20)}MIDD…${'b'.repeat(23)}`);
    expect(cell.attributes('title')).toBe(long);
    wrapper.unmount();
  });
});
