/** The row a lookup inserts when `blank` is set. It is not a record from the server. */
export interface DeskBlankHit {
  __deskBlank: true;
  [key: string]: unknown;
}

export const DESK_BLANK_HIT: DeskBlankHit = { __deskBlank: true };

export function isDeskBlankHit(hit: unknown): hit is DeskBlankHit {
  return Boolean(hit) && typeof hit === 'object' && (hit as { __deskBlank?: unknown }).__deskBlank === true;
}

/** The row an `acceptTyped` lookup adds when nothing matches the typed text. Choosing it keeps that text as new. */
export interface DeskTypedHit {
  __deskTyped: true;
  [key: string]: unknown;
}

export const DESK_TYPED_HIT: DeskTypedHit = { __deskTyped: true };

export function isDeskTypedHit(hit: unknown): hit is DeskTypedHit {
  return Boolean(hit) && typeof hit === 'object' && (hit as { __deskTyped?: unknown }).__deskTyped === true;
}
