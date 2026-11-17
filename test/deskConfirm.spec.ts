import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { answerDeskConfirm, askDeskConfirm, deskConfirmAsked } from '../src/form/confirm';
import DeskConfirmHost from '../src/form/DeskConfirmHost.vue';

afterEach(() => {
  if (deskConfirmAsked.value) answerDeskConfirm(false);
  document.body.innerHTML = '';
});

function field(id: string): HTMLButtonElement {
  const found = document.body.querySelector(`[data-desk-field="${id}"]`);
  if (!(found instanceof HTMLButtonElement)) throw new Error(`missing ${id}`);
  return found;
}

describe('askDeskConfirm', () => {
  it('resolves true for OK and false for Cancel', async () => {
    const host = mount(DeskConfirmHost, { attachTo: document.body });

    const yes = askDeskConfirm({ title: 'Share', message: 'Send it?', okLabel: 'Send', cancelLabel: 'Cancel' });
    await flushPromises();
    expect(document.body.textContent).toContain('Send it?');
    field('confirm-yes').click();
    await expect(yes).resolves.toBe(true);

    const no = askDeskConfirm({ title: 'Share', message: 'Send it?' });
    await flushPromises();
    field('confirm-no').click();
    await expect(no).resolves.toBe(false);
    host.unmount();
  });

  it('focuses Cancel and marks OK as danger', async () => {
    const host = mount(DeskConfirmHost, { attachTo: document.body });
    const pending = askDeskConfirm({
      title: 'Delete Record',
      message: 'Delete Record ?',
      okLabel: 'Delete',
      cancelLabel: 'Cancel',
      tone: 'danger',
    });
    await flushPromises();
    expect(field('confirm-yes').classList.contains('desk-tone-danger')).toBe(true);
    expect(document.activeElement).toBe(field('confirm-no'));
    field('confirm-no').click();
    await expect(pending).resolves.toBe(false);
    host.unmount();
  });

  it('shows detail lines', async () => {
    const host = mount(DeskConfirmHost, { attachTo: document.body });
    const pending = askDeskConfirm({ title: 'Confirm', message: 'Go ahead?', details: ['Open trip', 'Unpaid dues'] });
    await flushPromises();
    expect(document.body.textContent).toContain('Open trip');
    expect(document.body.textContent).toContain('Unpaid dues');
    field('confirm-no').click();
    await pending;
    host.unmount();
  });

  it('resolves a second ask as false while one is open', async () => {
    const first = askDeskConfirm({ title: 'A', message: 'First' });
    await expect(askDeskConfirm({ title: 'B', message: 'Second' })).resolves.toBe(false);
    answerDeskConfirm(true);
    await expect(first).resolves.toBe(true);
  });
});
