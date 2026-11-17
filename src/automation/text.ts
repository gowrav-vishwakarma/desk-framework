/** A value as text: strings and scalars as they are, anything else as JSON. Never `[object Object]`. */
export function plainText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  if (value === null || value === undefined) return '';
  return JSON.stringify(value) ?? '';
}
