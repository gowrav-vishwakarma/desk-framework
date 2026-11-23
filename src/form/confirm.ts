import { ref, type Ref } from 'vue';
import type { DeskActionTone } from '../grid/types';

/** A value the question asks for (an action's input: a cancellation reason). */
export interface DeskConfirmField {
  id: string;
  label: string;
  kind?: 'text' | 'textarea' | 'date';
  required?: boolean;
}

/** The question on screen, if any. `DeskConfirmHost` shows it and calls `answerDeskConfirm`. */
export interface DeskConfirmRequest {
  title: string;
  message: string;
  details: readonly string[];
  okLabel: string;
  cancelLabel: string;
  tone?: DeskActionTone;
  /** Values asked with the question, typed into `values` (`askDeskInput`). */
  fields?: readonly DeskConfirmField[];
  values?: Record<string, string>;
}

export const deskConfirmAsked: Ref<DeskConfirmRequest | null> = ref(null);
let pending: ((ok: boolean) => void) | null = null;

/**
 * Ask a yes/no question. Resolves `true` for OK and `false` for Cancel, Escape, or a second ask
 * while one is already open. A host mounts `DeskConfirmHost` once so the question has a place to show.
 */
export function askDeskConfirm(request: {
  title: string;
  message: string;
  details?: readonly string[];
  okLabel?: string;
  cancelLabel?: string;
  tone?: DeskActionTone;
}): Promise<boolean> {
  if (pending) return Promise.resolve(false);
  return new Promise((resolve) => {
    pending = resolve;
    deskConfirmAsked.value = {
      title: request.title,
      message: request.message,
      details: request.details ?? [],
      okLabel: request.okLabel ?? 'OK',
      cancelLabel: request.cancelLabel ?? 'Cancel',
      ...(request.tone ? { tone: request.tone } : {}),
    };
  });
}

/** The dialog's answer. `true` is OK, `false` is Cancel or Escape. */
export function answerDeskConfirm(ok: boolean): void {
  const resolve = pending;
  pending = null;
  deskConfirmAsked.value = null;
  resolve?.(ok);
}

/**
 * Ask for values with the question (an action's inputs): resolves the values typed on OK (a required one left empty
 * keeps the dialog open), `null` on Cancel or Escape.
 */
export async function askDeskInput(request: {
  title: string;
  message: string;
  fields: readonly DeskConfirmField[];
  okLabel?: string;
  cancelLabel?: string;
  tone?: DeskActionTone;
}): Promise<Record<string, string> | null> {
  const values: Record<string, string> = Object.fromEntries(request.fields.map((field) => [field.id, '']));
  const asked = askDeskConfirm(request);
  if (deskConfirmAsked.value) deskConfirmAsked.value = { ...deskConfirmAsked.value, fields: request.fields, values };
  const ok = await asked;
  return ok ? { ...values } : null;
}
