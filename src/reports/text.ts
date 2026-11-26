/** A cell or input value as text: strings as they are, numbers written out, anything else empty. */
export function txt(value: unknown): string {
  return typeof value === 'string' ? value : typeof value === 'number' || typeof value === 'bigint' ? String(value) : '';
}
