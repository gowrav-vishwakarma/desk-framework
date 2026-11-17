import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import DeskField from '../src/form/DeskField.vue';

describe('desk field that opens a dialog', () => {
  it('cannot be typed in; the dialog key (Ctrl+Enter) or its mark asks for the dialog, plain Enter moves on', async () => {
    const wrapper = mount(DeskField, {
      props: { modelValue: 'Acme · Pune', fieldId: 'shipToName', label: 'Ship to', opens: true },
      attachTo: document.body,
    });
    const input = wrapper.get('input');
    expect(input.attributes('readonly')).toBeDefined();
    expect(input.attributes('data-desk-opens')).toBeDefined();
    await input.trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('open')).toBeUndefined();
    await input.trigger('keydown', { key: 'Enter', ctrlKey: true });
    expect(wrapper.emitted('open')).toHaveLength(1);
    await wrapper.get('.desk-opens-mark').trigger('click');
    expect(wrapper.emitted('open')).toHaveLength(2);
    wrapper.unmount();
  });

  it('keeps a plain read-only field out of it', async () => {
    const wrapper = mount(DeskField, {
      props: { modelValue: 'CGST', fieldId: 'gstType', label: 'GST', readonly: true },
      attachTo: document.body,
    });
    expect(wrapper.get('input').attributes('data-desk-opens')).toBeUndefined();
    expect(wrapper.find('.desk-opens-mark').exists()).toBe(false);
    await wrapper.get('input').trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('open')).toBeUndefined();
    wrapper.unmount();
  });
});
