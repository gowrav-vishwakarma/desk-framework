import { defineComponent, nextTick, onMounted, ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import DeskDialog from '../src/form/DeskDialog.vue';
import { answerDeskConfirm, askDeskConfirm, deskConfirmAsked } from '../src/form/confirm';
import DeskConfirmHost from '../src/form/DeskConfirmHost.vue';

afterEach(() => {
  if (deskConfirmAsked.value) answerDeskConfirm(false);
  document.body.innerHTML = '';
});

describe('focus after a dialog closes', () => {
  it('returns to the button that opened a confirm', async () => {
    const Page = defineComponent({
      components: { DeskConfirmHost },
      template: `
        <div tabindex="0" data-desk-field="grid">
          <button type="button" data-desk-field="page-delete" @click="ask">Delete</button>
        </div>
        <DeskConfirmHost />
      `,
      setup() {
        function ask(): void {
          void askDeskConfirm({ title: 'Delete', message: 'Delete?', tone: 'danger', cancelLabel: 'Cancel' });
        }
        return { ask };
      },
    });
    const host = mount(Page, { attachTo: document.body });
    const button = document.body.querySelector('[data-desk-field="page-delete"]');
    if (!(button instanceof HTMLButtonElement)) throw new Error('missing delete');
    button.focus();
    button.click();
    await flushPromises();
    const cancel = document.body.querySelector('[data-desk-field="confirm-no"]');
    if (!(cancel instanceof HTMLButtonElement)) throw new Error('missing cancel');
    cancel.click();
    await flushPromises();
    await nextTick();
    expect(document.activeElement).toBe(button);
    host.unmount();
  });

  it('unwinds nested dialogs back to the field each one covered', async () => {
    const Page = defineComponent({
      components: { DeskDialog },
      template: `
        <button type="button" data-desk-field="page-field" @click="outer = true">Open</button>
        <DeskDialog v-model:open="outer" initial-focus="outer-field">
          <button type="button" data-desk-field="outer-field" @click="inner = true">Field</button>
          <DeskDialog v-model:open="inner" initial-focus="inner-cancel">
            <button type="button" data-desk-field="inner-cancel" @click="inner = false">Cancel</button>
          </DeskDialog>
          <button type="button" data-desk-field="outer-close" @click="outer = false">Close</button>
        </DeskDialog>
      `,
      setup() {
        const outer = ref(false);
        const inner = ref(false);
        return { outer, inner };
      },
    });
    const host = mount(Page, { attachTo: document.body });
    const page = document.body.querySelector('[data-desk-field="page-field"]');
    if (!(page instanceof HTMLButtonElement)) throw new Error('missing page');
    page.focus();
    page.click();
    await flushPromises();
    const outerField = document.body.querySelector('[data-desk-field="outer-field"]');
    if (!(outerField instanceof HTMLButtonElement)) throw new Error('missing outer field');
    outerField.focus();
    outerField.click();
    await flushPromises();
    const innerCancel = document.body.querySelector('[data-desk-field="inner-cancel"]');
    if (!(innerCancel instanceof HTMLButtonElement)) throw new Error('missing inner');
    innerCancel.click();
    await flushPromises();
    await nextTick();
    expect(document.activeElement).toBe(outerField);
    const outerClose = document.body.querySelector('[data-desk-field="outer-close"]');
    if (!(outerClose instanceof HTMLButtonElement)) throw new Error('missing outer close');
    outerClose.click();
    await flushPromises();
    await nextTick();
    expect(document.activeElement).toBe(page);
    host.unmount();
  });

  it('escape closes the top dialog and returns to the field under it', async () => {
    const Page = defineComponent({
      components: { DeskDialog },
      template: `
        <button type="button" data-desk-field="page-field" @click="outer = true">Open</button>
        <DeskDialog v-model:open="outer" initial-focus="outer-field">
          <button type="button" data-desk-field="outer-field" @click="inner = true">Field</button>
          <DeskDialog v-model:open="inner" front initial-focus="inner-cancel">
            <button type="button" data-desk-field="inner-cancel" @click="inner = false">Cancel</button>
          </DeskDialog>
          <button type="button" data-desk-field="outer-close" @click="outer = false">Close</button>
        </DeskDialog>
      `,
      setup() {
        const outer = ref(false);
        const inner = ref(false);
        return { outer, inner };
      },
    });
    const host = mount(Page, { attachTo: document.body });
    const page = document.body.querySelector('[data-desk-field="page-field"]');
    if (!(page instanceof HTMLButtonElement)) throw new Error('missing page');
    page.focus();
    page.click();
    await flushPromises();
    const outerField = document.body.querySelector('[data-desk-field="outer-field"]');
    if (!(outerField instanceof HTMLButtonElement)) throw new Error('missing outer field');
    outerField.focus();
    outerField.click();
    await flushPromises();
    const innerCancel = document.body.querySelector('[data-desk-field="inner-cancel"]');
    if (!(innerCancel instanceof HTMLButtonElement)) throw new Error('missing inner');
    expect(document.activeElement).toBe(innerCancel);
    // Focus still in the dialog underneath. Escape must close the front one.
    outerField.focus();
    outerField.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flushPromises();
    await nextTick();
    expect(document.body.querySelector('[data-desk-field="inner-cancel"]')).toBeNull();
    expect(document.body.querySelector('[data-desk-field="outer-field"]')).toBe(outerField);
    expect(document.activeElement).toBe(outerField);
    outerField.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flushPromises();
    await nextTick();
    expect(document.body.querySelector('[data-desk-field="outer-field"]')).toBeNull();
    expect(document.activeElement).toBe(page);
    host.unmount();
  });

  it('returns to the opener when a dialog mounts already open and focuses itself', async () => {
    const Steal = defineComponent({
      template: '<button type="button" data-desk-field="inner-field">Inside</button>',
      setup() {
        onMounted(() => {
          const button = document.body.querySelector('[data-desk-field="inner-field"]');
          if (button instanceof HTMLButtonElement) button.focus();
        });
      },
    });
    const Page = defineComponent({
      components: { DeskDialog, Steal },
      template: `
        <button type="button" data-desk-field="page-field" @click="open = true">Open</button>
        <DeskDialog v-if="open" v-model:open="open">
          <Steal />
          <button type="button" data-desk-field="inner-close" @click="open = false">Close</button>
        </DeskDialog>
      `,
      setup() {
        const open = ref(false);
        return { open };
      },
    });
    const host = mount(Page, { attachTo: document.body });
    const page = document.body.querySelector('[data-desk-field="page-field"]');
    if (!(page instanceof HTMLButtonElement)) throw new Error('missing page');
    page.focus();
    page.click();
    await flushPromises();
    const inside = document.body.querySelector('[data-desk-field="inner-field"]');
    if (!(inside instanceof HTMLButtonElement)) throw new Error('missing inner');
    expect(document.activeElement).toBe(inside);
    const close = document.body.querySelector('[data-desk-field="inner-close"]');
    if (!(close instanceof HTMLButtonElement)) throw new Error('missing close');
    close.click();
    await flushPromises();
    await nextTick();
    expect(document.activeElement).toBe(page);
    host.unmount();
  });
});
