import { markRaw, shallowRef, type Component } from 'vue';
import type { DeskPageSaved } from './pageContext';

/** Which part of a save the opener receives. */
export type DeskPageResultMode = 'response' | 'data' | 'both';

export interface DeskPageSpec {
  /** Loads the page. A lazy import works as it is. */
  page: () => Promise<Component | { default: Component }>;
  /** What the page reads from `useDeskPage().params`, such as `{ id: '12' }`. */
  params?: Record<string, string>;
  /** Shown above the page. A page that draws its own title can leave it out. */
  title?: string;
  /** Defaults to `response`. */
  result?: DeskPageResultMode;
}

export interface DeskPageEntry {
  readonly id: number;
  readonly spec: DeskPageSpec;
}

const entries = shallowRef<readonly DeskPageEntry[]>([]);
const waiting = new Map<number, (value: DeskPageSaved | null) => void>();
let nextId = 1;

/** Pages open now, oldest first. The dialog host draws them. */
export function deskPageEntries(): readonly DeskPageEntry[] {
  return entries.value;
}

/** Keep only the part of a save the opener asked for. */
export function shapeDeskPageResult(mode: DeskPageResultMode | undefined, saved: DeskPageSaved): DeskPageSaved {
  const pick = mode ?? 'response';
  const result: DeskPageSaved = {};
  if (pick !== 'data' && saved.response !== undefined) result.response = saved.response;
  if (pick !== 'response' && saved.data !== undefined) result.data = saved.data;
  return result;
}

/**
 * Open a page in a dialog above the current one. It resolves with the save, shaped by
 * `result`, or with null when the user closed the page without saving.
 */
export function openDeskPage(spec: DeskPageSpec): Promise<DeskPageSaved | null> {
  const id = nextId;
  nextId += 1;
  return new Promise((resolve) => {
    waiting.set(id, resolve);
    entries.value = [...entries.value, { id, spec: markRaw(spec) }];
  });
}

/** Close one page and answer its opener. Closing twice answers once. */
export function settleDeskPage(id: number, saved: DeskPageSaved | null): void {
  const resolve = waiting.get(id);
  waiting.delete(id);
  entries.value = entries.value.filter((entry) => entry.id !== id);
  resolve?.(saved);
}

/** Close every open page without a result, such as when the host goes away. */
export function settleAllDeskPages(): void {
  for (const entry of [...entries.value]) settleDeskPage(entry.id, null);
}
