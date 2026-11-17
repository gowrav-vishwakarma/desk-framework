import type { DeskOutcome } from './types';
import { focusPath } from './visible';

export type DeskRecordStep =
  | { type: 'act'; path: string; op: string; args: Record<string, unknown>; outcome?: Pick<DeskOutcome, 'ok' | 'opened' | 'closed' | 'focus'> }
  | { type: 'key'; key: string; focus: string | null }
  | { type: 'click'; path: string | null; text: string };

let recording = false;
let steps: DeskRecordStep[] = [];
let off: (() => void) | null = null;

function describeCombo(event: KeyboardEvent): string {
  const mods = [event.ctrlKey ? 'ctrl' : '', event.shiftKey ? 'shift' : '', event.altKey ? 'alt' : '', event.metaKey ? 'meta' : ''].filter(Boolean);
  return [...mods, event.key.length === 1 ? event.key : event.key].join('+');
}

function onKey(event: KeyboardEvent): void {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return;
  steps.push({ type: 'key', key: describeCombo(event), focus: focusPath() });
}

function onClick(event: MouseEvent): void {
  const el = event.target instanceof Element ? event.target : null;
  steps.push({
    type: 'click',
    path: el?.closest('[data-desk-path]')?.getAttribute('data-desk-path') ?? null,
    text: (el?.textContent ?? '').trim().slice(0, 40),
  });
}

export function startDeskRecording(): void {
  if (recording) return;
  recording = true;
  steps = [];
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('click', onClick, true);
  off = () => {
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('click', onClick, true);
  };
}

export function stopDeskRecording(): DeskRecordStep[] {
  off?.();
  off = null;
  recording = false;
  const out = steps;
  steps = [];
  return out;
}

export function deskRecordingActive(): boolean {
  return recording;
}

/** Called by the driver after every semantic op. */
export function recordDeskAct(path: string, op: string, args: Record<string, unknown>, outcome: DeskOutcome): void {
  if (!recording) return;
  steps.push({ type: 'act', path, op, args, outcome: { ok: outcome.ok, opened: outcome.opened, closed: outcome.closed, focus: outcome.focus } });
}
