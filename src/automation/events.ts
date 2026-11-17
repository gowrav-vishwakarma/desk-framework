import type { DeskEvent } from './types';

const LIMIT = 500;
const buffer: DeskEvent[] = [];
let nextId = 1;
const listeners = new Set<(event: DeskEvent) => void>();

/** Record something an agent or test may want to know: dialog open, navigation, save, toast. */
export function deskEvent(type: string, detail?: unknown): void {
  const event: DeskEvent = { id: nextId, at: Date.now(), type, ...(detail !== undefined ? { detail } : {}) };
  nextId += 1;
  buffer.push(event);
  if (buffer.length > LIMIT) buffer.splice(0, buffer.length - LIMIT);
  for (const listener of listeners) listener(event);
}

export function deskEventsSince(id: number, limit = 100): DeskEvent[] {
  return buffer.filter((event) => event.id > id).slice(0, Math.min(limit, 200));
}

export function lastDeskEventId(): number {
  return nextId - 1;
}

export function onDeskEvent(listener: (event: DeskEvent) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
