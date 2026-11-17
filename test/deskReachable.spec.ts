import { afterEach, describe, expect, it } from 'vitest';
import { createDeskDriver } from '../src/automation/driver';
import { registerDeskNode, unregisterDeskNode } from '../src/automation/registry';
import type { DeskNode } from '../src/automation/types';

const made: DeskNode[] = [];
afterEach(() => {
  for (const node of made.splice(0)) unregisterDeskNode(node);
  document.body.innerHTML = '';
});

/** A page with a header button and a field, and a dialog that can be opened over it. */
function world() {
  const ran: string[] = [];
  const button = document.createElement('button');
  button.textContent = 'Add New';
  button.setAttribute('data-desk-field', 'charge-add-new');
  document.body.append(button);
  const page = registerDeskNode({ kind: 'page', name: 'charge-list' }, null);
  const header = registerDeskNode(
    { kind: 'toolbar', name: 'header', ops: { press: { description: 'press', args: { id: { type: 'string' } }, run: () => ran.push('press'), target: () => button } } },
    page,
  );
  const field = registerDeskNode({ kind: 'field', name: 'search', ops: { set: { description: 'set', args: { value: { type: 'any' } }, run: () => ran.push('set') } } }, page);
  let open = false;
  const dialog = registerDeskNode({ kind: 'dialog', name: 'new-charge', modal: true, open: () => open, ops: { close: { description: 'close', run: () => ((open = false), ran.push('close')) } } }, page);
  const menu = registerDeskNode({ kind: 'contextmenu', name: 'row-menu', ops: { pick: { description: 'pick', run: () => ran.push('pick') } } }, page);
  made.push(page, header, field, dialog, menu);
  return { ran, button, openDialog: () => (open = true) };
}

describe('acts a person cannot do are refused', () => {
  it('an act on the page under an open dialog is refused; on the dialog, or a menu opened over it, it runs', async () => {
    const { ran, openDialog } = world();
    const driver = createDeskDriver();
    expect(await driver.act('page:charge-list/field:search', 'set', { value: 'x' })).toMatchObject({ ok: true });
    openDialog();
    expect(await driver.act('page:charge-list/field:search', 'set', { value: 'y' })).toMatchObject({
      ok: false,
      error: 'page:charge-list/field:search is covered by the dialog page:charge-list/dialog:new-charge: close it first, as a person would',
    });
    expect(await driver.click.prepare('page:charge-list/toolbar:header', 'press', { id: 'charge-add-new' })).toMatchObject({ ok: false, error: expect.stringContaining('is covered by the dialog') });
    expect(await driver.act('page:charge-list/contextmenu:row-menu', 'pick')).toMatchObject({ ok: true });
    expect(await driver.act('page:charge-list/dialog:new-charge', 'close')).toMatchObject({ ok: true });
    expect(ran).toEqual(['set', 'pick', 'close']);
  });

  it('a click is prepared on the element a person clicks (marked), and its outcome reported after; a disabled one is refused', async () => {
    const { ran, button } = world();
    const driver = createDeskDriver();
    const prepared = (await driver.click.prepare('page:charge-list/toolbar:header', 'press', { id: 'charge-add-new' })) as { click: true; selector: string; token: number };
    expect(prepared).toMatchObject({ click: true });
    expect(document.querySelector(prepared.selector)).toBe(button);
    // The testkit clicks it as a person; here the element is clicked directly.
    button.click();
    expect(await driver.click.finish(prepared.token, 'page:charge-list/toolbar:header', 'press', { id: 'charge-add-new' })).toMatchObject({ ok: true });
    expect(document.querySelector('[data-desk-click]')).toBeNull();
    // `run` is not called on a click: the element's own handler is what a person triggers.
    expect(ran).toEqual([]);
    button.disabled = true;
    expect(await driver.click.prepare('page:charge-list/toolbar:header', 'press', { id: 'charge-add-new' })).toMatchObject({ ok: false, error: 'Add New is disabled right now' });
    // An op without an element is run by the testkit through `act`.
    expect(await driver.click.prepare('page:charge-list/field:search', 'set', { value: 'z' })).toEqual({ click: false });
  });

  it("a click that could not be made reports the testkit's reason", async () => {
    world();
    const driver = createDeskDriver();
    const prepared = (await driver.click.prepare('page:charge-list/toolbar:header', 'press', { id: 'charge-add-new' })) as { token: number };
    expect(await driver.click.finish(prepared.token, 'page:charge-list/toolbar:header', 'press', { id: 'charge-add-new' }, 'a person cannot click it: <div class="desk-dialog-backdrop"> intercepts pointer events')).toMatchObject({
      ok: false,
      error: 'a person cannot click it: <div class="desk-dialog-backdrop"> intercepts pointer events',
    });
  });
});
