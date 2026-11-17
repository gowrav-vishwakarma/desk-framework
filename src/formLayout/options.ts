import type { DeskLayoutOption } from './types';

/**
 * Options that belong on one designer tab.
 * The first tab also keeps options that name no tab, which is how older layouts stay put.
 */
export function layoutOptionsOnTab(
  options: readonly DeskLayoutOption[],
  tabId: string,
  headerTabId = 'header',
): DeskLayoutOption[] {
  if (tabId === headerTabId) return options.filter((option) => !option.tab || option.tab === headerTabId);
  return options.filter((option) => option.tab === tabId);
}
