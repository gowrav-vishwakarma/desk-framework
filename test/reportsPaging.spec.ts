import { describe, expect, it } from 'vitest';
import type { Rdl2Output } from '../src/reports/language';
import { groupedRows, pagingPhrase } from '../src/reports/studioRows';

const output: Rdl2Output = {
  stage: 'bills',
  columns: [
    { column: 'party', label: 'Party' },
    { column: 'bill', label: 'Bill no' },
  ],
  groups: [{ column: 'party' }],
};
// Page 2 of a report: Acme's last bill, then Beta's two.
const rows = [
  { id: 'a3', party: 'Acme', bill: 'A3' },
  { id: 'b1', party: 'Beta', bill: 'B1' },
  { id: 'b2', party: 'Beta', bill: 'B2' },
];
const shown = (result: ReturnType<typeof groupedRows>) =>
  result.rows.map((row) => `${String(row.bill ?? row.party)}:${String(result.numbers.get(row.id))}`);

describe('report row numbers count what the pages count', () => {
  it('paged by row: the rows carry on from the last page, the party heads stay blank', () => {
    const result = groupedRows(output, rows, { pageStart: 10, byGroup: false });
    expect(shown(result)).toEqual(['Acme:', 'A3:11', 'Beta:', 'B1:12', 'B2:13']);
  });

  it('paged by party: the parties are numbered, their bills are not', () => {
    const result = groupedRows({ ...output, pageBy: 'party' }, rows, { pageStart: 10, byGroup: true });
    expect(shown(result)).toEqual(['Acme:11', 'A3:', 'Beta:12', 'B1:', 'B2:']);
  });

  it('paged by a deeper group: the first row of each such group carries its number', () => {
    const deep: Rdl2Output = { ...output, groups: [{ column: 'party' }, { column: 'month' }], pageBy: 'month' };
    const lines = [
      { id: 1, party: 'Acme', month: 'Apr', bill: 'A1' },
      { id: 2, party: 'Acme', month: 'Apr', bill: 'A2' },
      { id: 3, party: 'Acme', month: 'May', bill: 'A3' },
    ];
    expect(shown(groupedRows(deep, lines, { pageStart: 0, byGroup: true }))).toEqual(['Acme:', 'A1:1', 'A2:', 'A3:2']);
  });

  it('says in the filter sentence what a page holds', () => {
    const bold = (text: string) => `[${text}]`;
    expect(pagingPhrase(output, 10, bold)).toBe('· [10 rows] a page, a party can carry on to the next page');
    expect(pagingPhrase({ ...output, pageBy: 'party' }, 10, bold)).toBe('· [10 party groups] a page, each with all its rows');
    expect(pagingPhrase(output, 0, bold)).toBe('');
    expect(pagingPhrase({ ...output, groups: [] }, 10, bold)).toBe('');
  });
});
