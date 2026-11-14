import type { DeskFieldMenu, DeskMenuGroup } from '../menu/fieldMenu';
import { useDatePrefs } from './datePrefs';
import type { DeskDateShow } from './deskDate';

const SHOWS: DeskDateShow[] = ['dd/mm/yyyy', 'dd-mm-yyyy', 'dd MMM yyyy', 'yyyy-mm-dd'];

/**
 * The menu every date control starts with: face format, typing style, auto year, calendar, and weekday.
 * A host adds its own groups through the control's `menu`; this one comes first.
 */
export function dateFieldMenu(): DeskFieldMenu {
  const { prefs, set } = useDatePrefs();
  return {
    groups(): DeskMenuGroup[] {
      const current = prefs.value;
      return [
        {
          id: 'show',
          label: 'Show as',
          mode: 'radio',
          items: SHOWS.map((value) => ({ id: value, label: value, checked: current.show === value })),
        },
        {
          id: 'typing',
          label: 'Typing',
          mode: 'radio',
          items: [
            { id: 'mask', label: 'Digits fill the date', checked: current.typing === 'mask' },
            { id: 'free', label: 'Type words, such as 12 Sep', checked: current.typing === 'free' },
          ],
        },
        {
          id: 'year',
          label: 'Auto year select',
          mode: 'radio',
          items: [
            { id: 'calendar', label: 'Calendar year', checked: current.year === 'calendar' },
            { id: 'fy', label: 'Financial year', checked: current.year === 'fy' },
          ],
        },
        {
          id: 'calendar',
          label: 'Calendar',
          mode: 'radio',
          items: [
            { id: 'key', label: 'Open with Alt+Down or F4', checked: current.calendar === 'key' },
            { id: 'focus', label: 'Open when the field is focused', checked: current.calendar === 'focus' },
          ],
        },
        {
          id: 'weekday',
          label: 'Week days',
          mode: 'radio',
          items: [
            { id: 'beside', label: 'Show beside', checked: current.weekday === 'beside' },
            { id: 'tip', label: 'Show as a tooltip', checked: current.weekday === 'tip' },
          ],
        },
        {
          id: 'weekdayWhen',
          mode: 'radio',
          items: [
            { id: 'focus', label: 'On focus', checked: current.weekdayWhen === 'focus' },
            { id: 'always', label: 'Always', checked: current.weekdayWhen === 'always' },
          ],
        },
      ];
    },
    choose(groupId, itemId): void {
      if (groupId === 'show' && SHOWS.includes(itemId as DeskDateShow)) set('show', itemId as DeskDateShow);
      else if (groupId === 'typing') set('typing', itemId === 'free' ? 'free' : 'mask');
      else if (groupId === 'year') set('year', itemId === 'fy' ? 'fy' : 'calendar');
      else if (groupId === 'calendar') set('calendar', itemId === 'focus' ? 'focus' : 'key');
      else if (groupId === 'weekday') set('weekday', itemId === 'tip' ? 'tip' : 'beside');
      else if (groupId === 'weekdayWhen') set('weekdayWhen', itemId === 'always' ? 'always' : 'focus');
    },
  };
}
