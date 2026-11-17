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

/** The chosen value of every option: the layout's (saved or draft) when it is one of the option's choices, else its default. */
export function layoutOptionValues(options: readonly DeskLayoutOption[], chosen: Readonly<Record<string, string>> = {}): Record<string, string> {
  return Object.fromEntries(
    options.map((option) => {
      const value = chosen[option.id];
      return [option.id, value !== undefined && option.choices.some((choice) => choice.value === value) ? value : option.default];
    }),
  );
}

/** The options whose `show` rule passes for the chosen values (a rule reads the values, never another option's rule). */
export function shownLayoutOptions(options: readonly DeskLayoutOption[], chosen: Readonly<Record<string, string>> = {}): DeskLayoutOption[] {
  const values = layoutOptionValues(options, chosen);
  return options.filter((option) => option.show?.(values) ?? true);
}

/** What an option means now: its chosen value, or its default while its `show` rule hides it. Empty for an unknown id. */
export function layoutOptionValue(options: readonly DeskLayoutOption[], chosen: Readonly<Record<string, string>> | undefined, id: string): string {
  const option = options.find((item) => item.id === id);
  if (!option) return '';
  const values = layoutOptionValues(options, chosen);
  return option.show && !option.show(values) ? option.default : (values[id] ?? option.default);
}
