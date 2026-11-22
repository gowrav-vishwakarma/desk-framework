/** One typed or scanned code. Extra columns (warranty, for example) live on the same row. */
export interface DeskCodeRow {
  id: string;
  code: string;
  warrantyDateBasedOn?: string;
  warrantyDurationUnit?: string;
  warrantyDuration?: number | null;
  warrantyDate?: string;
  locked?: boolean;
}

let codeSeq = 0;

export function newCodeRow(
  code = '',
  extras?: Omit<DeskCodeRow, 'id' | 'code'>,
): DeskCodeRow {
  codeSeq += 1;
  return { id: `code-${codeSeq}`, code, ...extras };
}

/** Splits a paste on newlines, commas, or tabs. Blank pieces are dropped. */
export function codesFromText(text: string): string[] {
  return text
    .split(/[\n\r,\t]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * Prefix plus a number range. `from` 1, `to` 3, pad 3, prefix `SN` gives SN001, SN002, SN003.
 * A reversed range or a span over 500 returns nothing.
 */
export function codesInRange(prefix: string, from: number, to: number, pad: number): string[] {
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return [];
  const count = to - from + 1;
  if (count > 500) return [];
  const width = pad > 0 ? Math.min(12, Math.floor(pad)) : 0;
  const codes: string[] = [];
  for (let value = from; value <= to; value += 1) {
    const digits = width > 0 ? String(value).padStart(width, '0') : String(value);
    codes.push(`${prefix}${digits}`);
  }
  return codes;
}


/**
 * Codes written short: a run of consecutive numbers with the same prefix and width reads as its first code and how many
 * follow, so SN0222, SN0223, SN0224, SN0225, SN0300 reads `SN0222+3, SN0300`. Codes are sorted first; a code without
 * trailing digits stands alone.
 */
export function compactCodes(codes: readonly string[]): string {
  const parts = [...new Set(codes)].map((code) => {
    const match = /^(.*?)(\d+)$/.exec(code);
    return match ? { code, prefix: match[1] ?? '', width: match[2]!.length, value: Number(match[2]) } : { code, prefix: code, width: -1, value: 0 };
  });
  parts.sort((a, b) => (a.prefix === b.prefix ? (a.width === b.width ? a.value - b.value : a.width - b.width) : a.prefix < b.prefix ? -1 : 1));
  const out: string[] = [];
  for (let i = 0; i < parts.length; ) {
    const first = parts[i]!;
    let j = i;
    while (first.width >= 0 && j + 1 < parts.length && parts[j + 1]!.prefix === first.prefix && parts[j + 1]!.width === first.width && parts[j + 1]!.value === parts[j]!.value + 1) j += 1;
    out.push(j > i ? `${first.code}+${j - i}` : first.code);
    i = j + 1;
  }
  return out.join(', ');
}
export interface CodeMerge {
  rows: DeskCodeRow[];
  duplicates: string[];
  /** True when `max` dropped some of the incoming codes. */
  capped: boolean;
}

/**
 * Appends codes. A code already in the list, or repeated in the paste, is reported and kept once.
 * `max` of 0 means no cap. Comparison ignores case and surrounding spaces.
 */
export function appendCodes(rows: readonly DeskCodeRow[], incoming: readonly string[], max: number): CodeMerge {
  const next = rows.map((row) => ({ ...row }));
  const seen = new Set(next.map((row) => norm(row.code)).filter((code) => code));
  const duplicates: string[] = [];
  let capped = false;
  for (const raw of incoming) {
    const code = raw.trim();
    if (!code) continue;
    const key = norm(code);
    if (seen.has(key)) {
      duplicates.push(code);
      continue;
    }
    if (max > 0 && next.filter((row) => row.code.trim()).length >= max) {
      capped = true;
      break;
    }
    seen.add(key);
    const empty = next.find((row) => !row.code.trim());
    if (empty) empty.code = code;
    else next.push({ ...newCodeRow(code) });
  }
  return { rows: next, duplicates, capped };
}

export function duplicateCodes(rows: readonly DeskCodeRow[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const row of rows) {
    const key = norm(row.code);
    if (!key) continue;
    if (seen.has(key)) dupes.add(row.code.trim());
    seen.add(key);
  }
  return [...dupes];
}

function norm(code: string): string {
  return code.trim().toLowerCase();
}
