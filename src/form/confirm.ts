import { ref, type Ref } from 'vue';
import type { DeskActionTone } from '../grid/types';

/** The question on screen, if any. `DeskConfirmHost` shows it and calls `answerDeskConfirm`. */
export interface DeskConfirmRequest {
  title: string;
  message: string;
  details: readonly string[];
  okLabel: string;
  cancelLabel: string;
  tone?: DeskActionTone;
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
