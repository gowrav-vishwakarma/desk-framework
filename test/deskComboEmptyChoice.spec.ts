import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import DeskCombo from '../src/form/DeskCombo.vue';

afterEach(() => {
  document.body.innerHTML = '';
});

function activeHit(): string | null {
  return document.querySelector('.desk-suggest .hit.active')?.textContent?.trim() ?? null;
}

describe('desk select with no value', () => {
  it("shows and highlights the page's own empty option, wherever it sits", async () => {
    const options = [
      { label: 'Active', value: 'active' },
      { label: 'Inactive', value: 'inactive' },
      { label: 'Any status', value: '' },
    ];
    const wrapper = mount(DeskCombo, {
      props: { modelValue: '', options, fieldId: 'status' },
      attachTo: document.body,
    });
    await flushPromises();
    const input = wrapper.get('input');
    expect((input.element as HTMLInputElement).value).toBe('Any status');
    await input.trigger('focus');
    expect(activeHit()).toBe('Any status');
    wrapper.unmount();
  });

  it('keeps a blank select empty at rest and highlights its "---" when the list opens', async () => {
    const options = [{ label: 'Active', value: 'active' }];
    const wrapper = mount(DeskCombo, {
      props: { modelValue: '', options, blank: true, fieldId: 'status' },
      attachTo: document.body,
    });
    await flushPromises();
    const input = wrapper.get('input');
    expect((input.element as HTMLInputElement).value).toBe('');
    await input.trigger('focus');
    expect(activeHit()).toBe('---');
    wrapper.unmount();
  });
});
