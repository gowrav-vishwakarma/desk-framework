import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import DeskLookupBox from '../src/form/DeskLookupBox.vue';

const bins = [
  { id: 1, name: 'Grocery Bin' },
  { id: 2, name: 'Beverages Bin' },
];

function box(text: string, variant: 'grid' | 'form' = 'grid') {
  return mount(DeskLookupBox, {
    props: {
      modelValue: text,
      variant,
      blank: true,
      lookup: { labelKey: 'name', valueKey: 'id', columns: [{ id: 'name', header: 'Bin', field: 'name' }], minChars: 0, fetch: () => Promise.resolve(bins) },
    },
    attachTo: document.body,
  });
}

async function arrow(wrapper: ReturnType<typeof box>, key: 'ArrowLeft' | 'ArrowRight', caret: [number, number]): Promise<void> {
  const input = wrapper.get('input').element as HTMLInputElement;
  input.setSelectionRange(caret[0], caret[1]);
  await wrapper.get('input').trigger('keydown', { key });
  await flushPromises();
}

describe('desk grid lookup arrows', () => {
  it('goes to the next or previous cell from the ends of the text, without picking a row', async () => {
    const wrapper = box('Grocery Bin');
    await flushPromises();
    await arrow(wrapper, 'ArrowRight', [11, 11]);
    expect(wrapper.emitted('advance')?.[0]).toEqual(['tab']);
    await arrow(wrapper, 'ArrowLeft', [0, 0]);
    expect(wrapper.emitted('back')?.[0]).toEqual(['tab']);
    await arrow(wrapper, 'ArrowRight', [0, 11]);
    expect(wrapper.emitted('advance')).toHaveLength(2);
    expect(wrapper.emitted('pick')).toBeUndefined();
    expect(wrapper.emitted('update:picked')).toBeUndefined();
    wrapper.unmount();
  });

  it('keeps the caret moving inside the text, and leaves a form lookup alone', async () => {
    const wrapper = box('Grocery Bin');
    await flushPromises();
    await arrow(wrapper, 'ArrowRight', [3, 3]);
    await arrow(wrapper, 'ArrowLeft', [3, 3]);
    expect(wrapper.emitted('advance')).toBeUndefined();
    expect(wrapper.emitted('back')).toBeUndefined();
    wrapper.unmount();

    const field = box('Grocery Bin', 'form');
    await flushPromises();
    await arrow(field, 'ArrowRight', [11, 11]);
    expect(field.emitted('advance')).toBeUndefined();
    field.unmount();
  });
});
