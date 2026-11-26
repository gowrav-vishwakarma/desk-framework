import type { DeskFilterPeriod } from '../filter/types';

/** `2026-04-01` moved by whole years or days, in calendar terms. */
function shiftDate(iso: string, years: number, days = 0): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC((y ?? 1970) + years, (m ?? 1) - 1, (d ?? 1) + days));
  return date.toISOString().slice(0, 10);
}

/** Named ranges a saved tab keeps as words, so "This FY till date" moves with the calendar. */
export function fyPeriods(period: () => { yearStart: string; today: string }): DeskFilterPeriod[] {
  const dates = (): { yearStart: string; yearEnd: string; today: string } => {
    const { yearStart, today } = period();
    return { yearStart, today, yearEnd: shiftDate(yearStart, 1, -1) };
  };
  return [
    {
      id: 'fy-to-date',
      label: 'This FY till date',
      range: () => {
        const { yearStart, yearEnd, today } = dates();
        return { from: yearStart, to: today < yearEnd ? today : yearEnd };
      },
    },
    { id: 'fy', label: 'Whole FY', range: () => ({ from: dates().yearStart, to: dates().yearEnd }) },
    {
      id: 'last-fy',
      label: 'Last FY',
      range: () => {
        const { yearStart } = dates();
        return { from: shiftDate(yearStart, -1), to: shiftDate(yearStart, 0, -1) };
      },
    },
    { id: 'month', label: 'This month till date', range: () => ({ from: `${dates().today.slice(0, 8)}01`, to: dates().today }) },
    { id: 'today', label: 'Today', range: () => ({ from: dates().today, to: dates().today }) },
  ];
}
