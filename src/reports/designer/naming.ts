/** Names the designer offers for new columns, so a column is never left without one. */

const FN_WORD: Record<string, string> = {
  sum: 'Total',
  count: 'Count',
  countDistinct: 'Distinct',
  avg: 'Average',
  min: 'Min',
  max: 'Max',
  first: 'First',
  last: 'Last',
  list: 'List',
  runningSum: 'Running',
  rowNumber: 'RowNo',
  rank: 'Rank',
  denseRank: 'Rank',
  previous: 'Previous',
  next: 'Next',
  partitionSum: 'GroupTotal',
  partitionCount: 'GroupCount',
  share: 'Share',
};

/** What a typed name keeps: spaces become _, anything but letters, digits and _ is dropped. */
export function cleanName(raw: string): string {
  return raw.replace(/\s+/g, '_').replace(/[^A-Za-z0-9_]/g, '');
}

/** `invoice date` → `invoiceDate`; keeps letters and digits only, never starting with a digit. */
export function camelName(text: string): string {
  const words = text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  const joined = words
    .map((word, index) =>
      index === 0
        ? word.charAt(0).toLowerCase() + word.slice(1)
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join('');
  return /^[0-9]/.test(joined) ? `c${joined}` : joined;
}

/**
 * A name from what a column works out: sum of `amount` → `amountTotal`, count → `count`,
 * running total of `qty` → `qtyRunning`. Formulas use their first column name.
 */
export function suggestName(fn: string, expr: string): string {
  const base = /^[A-Za-z_]\w*/.exec(expr.trim().split('.').pop() ?? '')?.[0] ?? '';
  const word = FN_WORD[fn] ?? '';
  if (!base) return camelName(word) || '';
  return camelName(`${base} ${word}`);
}
