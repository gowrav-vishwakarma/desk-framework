function randomHex(bytes: number): string {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  return [...values].map((value) => value.toString(16).padStart(2, '0')).join('');
}

/**
 * A random v4 UUID, such as an idempotency key. `crypto.randomUUID` exists only on secure pages (https, localhost);
 * an office desk opened over plain http on the LAN still has `getRandomValues`.
 */
export function deskUuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const hex = randomHex(16).split('');
  hex[12] = '4';
  hex[16] = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  const text = hex.join('');
  return `${text.slice(0, 8)}-${text.slice(8, 12)}-${text.slice(12, 16)}-${text.slice(16, 20)}-${text.slice(20)}`;
}
