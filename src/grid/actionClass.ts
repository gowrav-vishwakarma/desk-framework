import type { DeskActionTone } from './types';

/** Classes for an action button: the tone class, the missing-data and not-permitted classes, then any classes the host passed. */
export function deskActionClass(action: {
  tone?: DeskActionTone;
  missingData?: boolean;
  denied?: boolean;
  class?: string | string[];
}): Array<string | string[] | undefined> {
  return [
    action.tone ? `desk-tone-${action.tone}` : undefined,
    action.missingData ? 'desk-action-missing' : undefined,
    action.denied ? 'desk-action-denied' : undefined,
    action.class,
  ];
}
