import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { defineComponent, ref } from 'vue';
import DeskCombo from '../src/form/DeskCombo.vue';
import DeskDialog from '../src/form/DeskDialog.vue';
import DeskLookupBox from '../src/form/DeskLookupBox.vue';
import type { DeskLookupConfig } from '../src/grid/types';

afterEach(() => {
  document.body.innerHTML = '';
});

const options = [
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
];
const lookup: DeskLookupConfig = {
  labelKey: 'name',
  valueKey: 'id',
  columns: [],
  minChars: 1,
  fetch: async () => [],
};

function escape(target: Element): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

const controls = [
  {
    name: 'select',
    component: DeskCombo,
    props: { modelValue: 'active', options, fieldId: 'status' },
  },
  { name: 'lookup', component: DeskLookupBox, props: { modelValue: '', lookup, fieldId: 'party' } },
];

describe.each(controls)('Escape on a closed $name', ({ component, props }) => {
  it('in a form field is left to the dialog, which closes', async () => {
    let usedByControl: boolean | null = null;
    const Page = defineComponent({
      components: { DeskDialog, Control: component },
      // The wrapper sees the key after the control and before the dialog, which uses it to close.
      template: `<DeskDialog v-model:open="open" :disable-initial-focus="true"><div @keydown="seen"><Control v-bind="props" /></div></DeskDialog>`,
      setup: () => ({
        open: ref(true),
        props,
        seen: (event: KeyboardEvent) => (usedByControl = event.defaultPrevented),
      }),
    });
    const host = mount(Page, { attachTo: document.body });
    await flushPromises();
    const input = document.body.querySelector('.desk-dialog input');
    if (!input) throw new Error('missing input');
    // Vue skips a bubbling listener attached in the same millisecond the event is first handled.
    await new Promise((resolve) => setTimeout(resolve, 5));
    escape(input);
    await flushPromises();
    expect(usedByControl).toBe(false);
    expect(document.body.querySelector('.desk-dialog')).toBeNull();
    host.unmount();
  });

  it('in a grid cell still cancels the edit', async () => {
    const wrapper = mount(component, {
      props: { ...props, variant: 'grid' },
      attachTo: document.body,
    });
    await flushPromises();
    // A grid select opens its list as its edit starts; the first Escape closes only that.
    const input = wrapper.get('input').element;
    if (document.querySelector('.desk-suggest')) {
      escape(input);
      await flushPromises();
    }
    expect(wrapper.emitted('cancel')).toBeUndefined();
    const event = escape(input);
    expect(event.defaultPrevented).toBe(true);
    expect(wrapper.emitted('cancel')).toHaveLength(1);
    wrapper.unmount();
  });
});
