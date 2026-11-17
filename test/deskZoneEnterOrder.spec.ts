import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { defineComponent, nextTick, ref } from 'vue';
import DeskFormZone from '../src/formLayout/DeskFormZone.vue';
import DeskField from '../src/form/DeskField.vue';
import DeskDialog from '../src/form/DeskDialog.vue';
import { provideDeskLayer } from '../src/keys/useDeskLayer';
import { focusNextDeskField } from '../src/focus/useDeskFocus';
import { deskLayers, popDeskLayer } from '../src/keys/layers';

const Host = defineComponent({
  components: { DeskFormZone, DeskField, DeskDialog },
  props: { order: { type: Array as () => string[], required: true } },
  setup() {
    const root = ref<HTMLElement | null>(null);
    provideDeskLayer({ root, active: ref(true) });
    const values = ref<Record<string, string>>({ shipToName: 'Acme · Pune' });
    const dialogOpen = ref(false);
    const pin = ref<string | number | null>('');
    function accept(): void {
      values.value = { ...values.value, shipToName: 'Depot · Vapi' };
      dialogOpen.value = false;
      void nextTick(() => {
        void nextTick(() => {
          focusNextDeskField('shipToName');
        });
      });
    }
    return { root, values, dialogOpen, pin, accept };
  },
  template: `
    <div ref="root" data-desk-layer>
      <DeskFormZone
        section="header"
        :sections="[{ id: 'dispatch', title: 'Dispatch', fields: order.map((id) => ({ id })) }]"
        label-style="side"
        :inset="[]"
        :visible="() => true"
        :label="(id) => id"
        :value="(id) => values[id] ?? ''"
        :required="() => false"
        :kind="() => undefined"
      >
        <template #field="{ id }">
          <DeskField :model-value="values[id] ?? ''" :field-id="id" :label="id" :opens="id === 'shipToName'" @open="dialogOpen = true" />
        </template>
      </DeskFormZone>
      <input data-desk-field="itemsGrid" />
      <DeskDialog v-model:open="dialogOpen" initial-focus="ship-pin" @accept="accept">
        <DeskField v-model="pin" field-id="ship-pin" label="PIN" />
      </DeskDialog>
    </div>
  `,
});

describe('desk zone Enter order', () => {
  beforeAll(() => {
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (this: HTMLElement) {
      return (this.isConnected ? [{}] : []) as unknown as DOMRectList;
    });
  });

  afterEach(() => {
    for (const layer of [...deskLayers()]) popDeskLayer(layer);
    document.body.innerHTML = '';
  });

  const focused = () => document.activeElement?.getAttribute('data-desk-field');

  it('moves from Ship to onto the next field of the open panel', async () => {
    const wrapper = mount(Host, { props: { order: ['projectName', 'deliverySchedule', 'shipToName', 'routeName'] }, attachTo: document.body });
    await flushPromises();
    await wrapper.get('.desk-section-strip').trigger('click');
    await flushPromises();
    (wrapper.get('[data-desk-field="shipToName"]').element as HTMLElement).focus();
    focusNextDeskField('shipToName');
    expect(focused()).toBe('routeName');
    wrapper.unmount();
  });

  it('focuses the next shown field after Ship to in its panel, and says so when Ship to is the last one', async () => {
    const wrapper = mount(Host, { props: { order: ['projectName', 'shipToName', 'routeName'] }, attachTo: document.body });
    await flushPromises();
    await wrapper.get('.desk-section-strip').trigger('click');
    await flushPromises();
    const zone = wrapper.findComponent(DeskFormZone).vm as unknown as { focusAfter: (id: string) => boolean };
    expect(zone.focusAfter('shipToName')).toBe(true);
    expect(focused()).toBe('routeName');
    expect(zone.focusAfter('routeName')).toBe(false);
    wrapper.unmount();

    const last = mount(Host, { props: { order: ['projectName', 'shipToName'] }, attachTo: document.body });
    await flushPromises();
    await last.get('.desk-section-strip').trigger('click');
    await flushPromises();
    const lastZone = last.findComponent(DeskFormZone).vm as unknown as { focusAfter: (id: string) => boolean };
    expect(lastZone.focusAfter('shipToName')).toBe(false);
    last.unmount();
  });

  it('focusAfter moves to the next field shown in the section, and says so when Ship to is the last one', async () => {
    const wrapper = mount(Host, { props: { order: ['projectName', 'deliverySchedule', 'shipToName', 'routeName'] }, attachTo: document.body });
    await flushPromises();
    await wrapper.get('.desk-section-strip').trigger('click');
    await flushPromises();
    const zone = wrapper.getComponent(DeskFormZone).vm as unknown as { focusAfter: (id: string) => boolean };
    expect(zone.focusAfter('shipToName')).toBe(true);
    expect(focused()).toBe('routeName');
    expect(zone.focusAfter('routeName')).toBe(false);
    wrapper.unmount();

    const last = mount(Host, { props: { order: ['projectName', 'shipToName'] }, attachTo: document.body });
    await flushPromises();
    await last.get('.desk-section-strip').trigger('click');
    await flushPromises();
    const lastZone = last.getComponent(DeskFormZone).vm as unknown as { focusAfter: (id: string) => boolean };
    expect(lastZone.focusAfter('shipToName')).toBe(false);
    last.unmount();
  });

  it('after the Ship to dialog closes on Enter, lands on the field after Ship to', async () => {
    const wrapper = mount(Host, { props: { order: ['projectName', 'deliverySchedule', 'shipToName', 'routeName'] }, attachTo: document.body });
    await flushPromises();
    await wrapper.get('.desk-section-strip').trigger('click');
    await flushPromises();
    const ship = wrapper.get('[data-desk-field="shipToName"]');
    (ship.element as HTMLElement).focus();
    // A summary field opens its dialog on the dialog key (Ctrl+Enter); plain Enter moves on.
    await ship.trigger('keydown', { key: 'Enter', ctrlKey: true });
    await flushPromises();
    const pin = document.querySelector<HTMLInputElement>('[data-desk-field="ship-pin"]');
    expect(pin).not.toBeNull();
    pin?.focus();
    pin?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await flushPromises();
    await flushPromises();
    expect(document.querySelector('[data-desk-field="ship-pin"]')).toBeNull();
    expect(wrapper.find('.desk-zone-panel').exists()).toBe(true);
    expect(focused()).toBe('routeName');
    wrapper.unmount();
  });
});
