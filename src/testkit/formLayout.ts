import type { DeskClient } from './client';
import { deskLocators } from './locators';
import type { DeskUserPage } from './types';

/** One option as a form layout node reports it (`useDeskFormLayout`'s automation readout). */
export interface DeskLayoutOptionView {
  id: string;
  label: string;
  value: string;
  default: string;
  choices: string[];
}

/** The options a form layout offers now, by designer tab (`main` when the form has no tabs). Options come and go with settings: read them. */
export async function deskLayoutOptions(client: DeskClient, layout = 'layout:form-layout'): Promise<Record<string, DeskLayoutOptionView[]>> {
  const view = await client.read<{ options?: Record<string, DeskLayoutOptionView[]> }>(layout);
  return view.options ?? {};
}

/** The saved or drafted value of one option. */
export async function deskLayoutOption(client: DeskClient, option: string, layout = 'layout:form-layout'): Promise<string | undefined> {
  const tabs = await deskLayoutOptions(client, layout);
  return Object.values(tabs).flat().find((item) => item.id === option)?.value;
}

/**
 * Change form layout options as a person does: click the page's toolbar button (`form-layout`), open the designer tab
 * that holds each option, click the option's button (`layout-option-<id>`), click the choice by its label, and Save
 * (`layout-save`). `values` maps an option id to the choice's label as the designer shows it.
 */
export async function deskChooseLayoutOptions(
  page: DeskUserPage,
  client: DeskClient,
  values: Record<string, string>,
  options: { layout?: string; toolbar?: string } = {},
): Promise<void> {
  const layout = options.layout ?? 'layout:form-layout';
  const tabs = await deskLayoutOptions(client, layout);
  await page.locator(deskLocators.toolbar(options.toolbar ?? 'form-layout')).first().click();
  const dialog = page.locator(deskLocators.node('dialog:form-layout')).first();
  await dialog.waitFor({ state: 'visible' });
  for (const [option, label] of Object.entries(values)) {
    const tab = Object.entries(tabs).find(([, list]) => list.some((item) => item.id === option))?.[0];
    if (!tab) throw new Error(`the form layout offers no option ${option}; it offers ${Object.values(tabs).flat().map((item) => item.id).join(', ') || 'none'}`);
    const tabButton = dialog.locator(deskLocators.tab(tab));
    if ((await tabButton.count()) > 0) await tabButton.first().click();
    await dialog.locator(deskLocators.field(`layout-option-${option}`)).first().click();
    await page.locator(deskLocators.layoutChoice).filter({ hasText: new RegExp(`^\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`) }).first().click();
  }
  await dialog.locator(deskLocators.field('layout-save')).first().click();
  await dialog.waitFor({ state: 'hidden' });
  await client.waitIdle();
}
