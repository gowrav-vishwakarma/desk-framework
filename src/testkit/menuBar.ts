import { deskLocators } from './locators';
import type { DeskLocator, DeskUserPage } from './types';

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A flyout button's own text is its label, with a ✓ before it when ticked and ▸ after it when it has children. */
const flyoutLabel = (label: string): RegExp => new RegExp(`^\\s*(?:✓\\s*)?${escapeRegExp(label)}\\s*(?:▸)?\\s*$`);
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export interface DeskMenuBarPickOptions {
  /** Pause after each level opens, so a person watching (or a recording) can follow. Default 0. */
  pace?: number;
  /** Hover the last item instead of clicking it: the menu stays open on it (to show, not to choose). */
  show?: boolean;
}

/** The top menu's place in the bar, by its label (underlined access letters included) or index. */
async function topIndex(page: DeskUserPage, bar: string, top: string | number): Promise<number> {
  if (typeof top === 'number') return top;
  const tops = page.locator(`${bar} ${deskLocators.menuBarTop}`);
  const count = await tops.count();
  for (let i = 0; i < count; i += 1) {
    const text = await page.locator(`${bar} .desk-menu-item:nth-child(${i + 1}) > button`).innerText();
    if (flyoutLabel(top).test(text)) return i;
  }
  throw new Error(`Menu bar ${bar}: no top menu "${top}"`);
}

/**
 * As a person, through a `DeskMenuBar` (`bar` = CSS of the bar's container, e.g. the desk footer): click the top
 * menu (`top` = its label text or its index; not clicked again when it is already open), then each level's item by
 * its exact label, opening sub-menus on hover, and click the last (`show`: hover it and leave the menu open). Labels
 * are matched at their own level only, so a branch and a warehouse may share a name.
 */
export async function deskMenuBarPick(page: DeskUserPage, bar: string, top: string | number, path: readonly string[], options: DeskMenuBarPickOptions = {}): Promise<void> {
  const pace = options.pace ?? 0;
  const item = `${bar} .desk-menu-item:nth-child(${(await topIndex(page, bar, top)) + 1})`;
  let flyout: DeskLocator = page.locator(`${item} > .desk-flyout`).first();
  if (!(await flyout.isVisible({ timeout: 50 }))) await page.locator(`${item} > button`).click();
  for (const [index, label] of path.entries()) {
    await flyout.waitFor({ state: 'visible' });
    if (pace) await sleep(pace);
    const button = flyout.locator(':scope > .desk-flyout-row > button').filter({ hasText: flyoutLabel(label) }).first();
    if (!(await button.isVisible({ timeout: 2_000 }))) {
      throw new Error(`Menu ${[String(top), ...path.slice(0, index)].join(' › ')}: no item "${label}"`);
    }
    if (index === path.length - 1) {
      await (options.show ? button.hover() : button.click());
      return;
    }
    await button.hover();
    // The sub-menu is the button's sibling (a row's own text includes its open sub-menu, so rows are not matched by text).
    flyout = button.locator('xpath=following-sibling::div[contains(concat(" ", normalize-space(@class), " "), " desk-flyout ")]').first();
  }
}
