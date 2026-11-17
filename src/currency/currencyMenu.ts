import type { DeskFieldMenu, DeskMenuGroup } from '../menu/fieldMenu';
import { useCurrencyPrefs } from './currencyPrefs';

/**
 * The menu every currency control starts with. A host adds its own groups through `menu`;
 * this one comes first.
 */
export function currencyFieldMenu(): DeskFieldMenu {
  const { prefs, set } = useCurrencyPrefs();
  return {
    groups(): DeskMenuGroup[] {
      const show = prefs.value.show;
      return [
        {
          id: 'show',
          label: 'Show as',
          mode: 'radio',
          items: [
            { id: 'code', label: 'Code', checked: show === 'code' },
            { id: 'name', label: 'Name', checked: show === 'name' },
          ],
        },
      ];
    },
    choose(groupId, itemId): void {
      if (groupId === 'show') set('show', itemId === 'name' ? 'name' : 'code');
    },
  };
}
