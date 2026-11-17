import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import DeskFormZone from '../src/formLayout/DeskFormZone.vue';

function zone() {
  return mount(DeskFormZone, {
    props: {
      section: 'header',
      sections: [{ id: 'dispatch', title: 'Dispatch', fields: [{ id: 'deliverySchedule' }, { id: 'shipToName' }] }],
      labelStyle: 'side',
      inset: [],
      visible: () => true,
      label: (id: string) => id,
      value: () => '',
      required: () => false,
      kind: () => undefined,
    },
    slots: { field: '<template #field="{ id }"><input :data-desk-field="id" /></template>' },
    attachTo: document.body,
  });
}

function blurTo(panel: Element, next: Element | null): void {
  panel.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: next }));
}

describe('desk form zone panel', () => {
  it('stays open while a dialog opened from its field has focus, and closes when focus goes elsewhere', async () => {
    const wrapper = zone();
    await wrapper.get('.desk-section-strip').trigger('click');
    await flushPromises();
    const panel = wrapper.get('.desk-zone-panel').element;

    const dialog = document.createElement('div');
    dialog.className = 'desk-dialog';
    const dialogInput = document.createElement('input');
    dialog.appendChild(dialogInput);
    document.body.appendChild(dialog);
    blurTo(panel, dialogInput);
    await flushPromises();
    expect(wrapper.find('.desk-zone-panel').exists()).toBe(true);

    const outside = document.createElement('input');
    document.body.appendChild(outside);
    blurTo(wrapper.get('.desk-zone-panel').element, outside);
    await flushPromises();
    expect(wrapper.find('.desk-zone-panel').exists()).toBe(false);

    dialog.remove();
    outside.remove();
    wrapper.unmount();
  });
});
