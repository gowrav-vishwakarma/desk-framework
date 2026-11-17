import { describe, expect, it } from 'vitest';
import { defineComponent, nextTick, ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import DeskLayoutDesigner from '../src/formLayout/designer/DeskLayoutDesigner.vue';
import { FORM_LAYOUT_VERSION, type DeskFormLayout, type DeskLayoutOption } from '../src/formLayout/types';

const OPTIONS: DeskLayoutOption[] = [
  { id: 'branch', label: 'Branch', default: 'page', tab: 'place', choices: [{ value: 'page', label: 'Choose' }, { value: 'default', label: 'Default' }] },
  { id: 'narration', label: 'Narration', default: 'show', tab: 'entry', choices: [{ value: 'show', label: 'Show' }, { value: 'hide', label: 'Hide' }] },
];
const TABS = [
  { id: 'place', label: 'Branch and warehouse' },
  { id: 'entry', label: 'Entry' },
];

function mountDesigner(zones: { id: string; title: string }[]) {
  const changed: DeskFormLayout[] = [];
  const Harness = defineComponent({
    components: { DeskLayoutDesigner },
    setup() {
      const open = ref(true);
      const layout = ref<DeskFormLayout>({ version: FORM_LAYOUT_VERSION, labelStyle: 'side', inset: [], zones: {}, hidden: [] });
      const onLayout = (next: DeskFormLayout) => {
        changed.push(next);
        layout.value = next;
      };
      return { open, layout, zones, options: OPTIONS, tabs: TABS, onLayout };
    },
    template: `<DeskLayoutDesigner v-model:open="open" :layout="layout" :zones="zones" :fields="[]" :options="options" :tabs="tabs" @update:layout="onLayout" />`,
  });
  return { wrapper: mount(Harness, { attachTo: document.body }), changed };
}

describe('layout designer without zones (a form of options only)', () => {
  it('shows the first tab as option cards, with no field canvas and no label style', async () => {
    const { wrapper } = mountDesigner([]);
    await flushPromises();
    expect(document.body.querySelector('.desk-form-studio-canvas')).toBeNull();
    expect(document.body.querySelector('[data-desk-field="layout-style"]')).toBeNull();
    expect(document.body.querySelector('[data-desk-field="layout-option-branch"]')).not.toBeNull();
    // Options of another tab wait on their tab.
    expect(document.body.querySelector('[data-desk-field="layout-option-narration"]')).toBeNull();
    wrapper.unmount();
  });

  it('a chosen value goes into the layout options', async () => {
    const { wrapper, changed } = mountDesigner([]);
    await flushPromises();
    const button = document.body.querySelector('[data-desk-field="layout-option-branch"]');
    if (!(button instanceof HTMLButtonElement)) throw new Error('option button missing');
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await nextTick();
    const choice = [...document.body.querySelectorAll('.desk-designer-menu button')].find((item) => item.textContent?.trim() === 'Default');
    if (!(choice instanceof HTMLButtonElement)) throw new Error('choice missing');
    choice.click();
    await nextTick();
    expect(changed.at(-1)?.options).toEqual({ branch: 'default' });
    wrapper.unmount();
  });

  it('a form with zones keeps the field canvas on its first tab', async () => {
    const { wrapper } = mountDesigner([{ id: 'header', title: 'Header' }]);
    await flushPromises();
    expect(document.body.querySelector('.desk-form-studio-canvas')).not.toBeNull();
    expect(document.body.querySelector('[data-desk-field="layout-style"]')).not.toBeNull();
    wrapper.unmount();
  });
});
