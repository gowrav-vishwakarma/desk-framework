import type { DeskClient } from './client';
import { deskLocators } from './locators';
import type { DeskUserPage } from './types';

/** What a tabs node reports: the open tab and every tab with its label and state. */
export interface DeskTabsView {
  active?: string;
  tabs?: Array<{ id: string; label?: string; active?: boolean; disabled?: boolean; reason?: string }>;
}

/** The tab ids a tabs node offers now, in order (tabs can come and go with settings, so read them, never list them). */
export async function deskTabIds(client: DeskClient, tabs: string): Promise<string[]> {
  const view = await client.read<DeskTabsView>(tabs);
  return (view.tabs ?? []).map((tab) => tab.id);
}

/**
 * Open a tab as a person does: click its button inside the tabs node (`data-desk-tab`), then wait until the node
 * reports it open. A page that asks first (unsaved changes) leaves the tab where it was: answer the dialog, then call
 * again. `deskOpenTabDirect` is the driver's `select` op, for a step a person-like test already covered.
 */
export async function deskOpenTab(page: DeskUserPage, client: DeskClient, tabs: string, id: string, timeoutMs = 5000): Promise<void> {
  const ids = await deskTabIds(client, tabs);
  if (!ids.includes(id)) throw new Error(`${tabs} has no tab ${id}; it offers ${ids.join(', ') || 'none'}`);
  await page.locator(deskLocators.node(tabs)).first().locator(deskLocators.tab(id)).first().click();
  const deadline = Date.now() + timeoutMs;
  let active: string | undefined;
  while (Date.now() < deadline) {
    active = (await client.read<DeskTabsView>(tabs)).active;
    if (active === id) {
      await client.waitIdle();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`${tabs}: tab ${id} did not open (open: ${active ?? 'none'})`);
}

/** The same through the driver's `select` op. */
export async function deskOpenTabDirect(client: DeskClient, tabs: string, id: string): Promise<void> {
  const answer = await client.act(tabs, 'select', { id });
  if (!answer.ok) throw new Error(`${tabs}: tab ${id}: ${answer.error ?? 'refused'}${answer.reason ? ` (${String(answer.reason)})` : ''}`);
  await client.waitIdle();
}
