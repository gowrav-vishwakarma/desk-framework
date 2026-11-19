import { ref, type Ref } from 'vue';

/**
 * The idempotency key of one submitted save. The key is made when a save is submitted and sent with the write
 * (as `Idempotency-Key`, by the host's HTTP layer). Every retry of that submission sends the same key: a second
 * press after a lost answer, a wait-and-retry while the server is still saving, a save after a reload that
 * restored the draft. The server then answers a repeat with the first answer instead of saving twice.
 *
 * The host clears the key once the server answered (saved, or refused: the next save is a new submission) and
 * keeps it while the outcome is unknown (no answer, the call aborted).
 */
export interface DeskSubmission {
  /** The pending key, or null when the next save starts a new submission. */
  readonly key: Ref<string | null>;
  /** The pending key, or a new one: call when a save is submitted. */
  take(): string;
  /** The server answered: the next save is a new submission. */
  clear(): void;
  /** A key kept with a restored draft: the next save repeats that submission. */
  restore(key: string | null): void;
}

function randomHex(bytes: number): string {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  return [...values].map((value) => value.toString(16).padStart(2, '0')).join('');
}

/**
 * A random v4 UUID. `crypto.randomUUID` exists only on secure pages (https, localhost); an office desk opened over
 * plain http on the LAN still has `getRandomValues`.
 */
export function deskUuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const hex = randomHex(16).split('');
  hex[12] = '4';
  hex[16] = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  const text = hex.join('');
  return `${text.slice(0, 8)}-${text.slice(8, 12)}-${text.slice(12, 16)}-${text.slice(16, 20)}-${text.slice(20)}`;
}

/** One form's submission key. A page makes one beside its form and passes it to its save. */
export function useDeskSubmission(): DeskSubmission {
  const key = ref<string | null>(null);
  return {
    key,
    take() {
      key.value ??= deskUuid();
      return key.value;
    },
    clear() {
      key.value = null;
    },
    restore(saved) {
      key.value = saved;
    },
  };
}
