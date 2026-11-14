import { inject, provide, type InjectionKey } from 'vue';
import { useRoute } from 'vue-router';

/** What a page hands back when it saves. A page fills the parts it has; the opener chooses which to keep. */
export interface DeskPageSaved {
  /** The API reply of the save. */
  response?: unknown;
  /** The saved record as the page holds it. */
  data?: unknown;
}

/**
 * What the dialog host gives a page it opened. It only needs Vue, so `leaveGuard` can read it
 * without pulling in the rest of the desk framework.
 */
export interface DeskPageFrame {
  readonly params: Readonly<Record<string, string>>;
  /** Ask about unsaved changes, then close with nothing. */
  close: () => void;
  /** Close and hand the result to whoever opened the page. */
  saved: (payload: DeskPageSaved) => void;
}

export const DESK_PAGE_FRAME: InjectionKey<DeskPageFrame> = Symbol('desk-page-frame');

export function provideDeskPageFrame(frame: DeskPageFrame): void {
  provide(DESK_PAGE_FRAME, frame);
}

/** True inside a page dialog. Route guards and route navigation do not apply there. */
export function inDeskPageDialog(): boolean {
  return inject(DESK_PAGE_FRAME, null) !== null;
}

export interface DeskPageOptions {
  /** Where a routed page goes when it closes. */
  routeClose?: () => void;
  /** What a routed page does after a save, such as going back to the list. */
  routeSaved?: (payload: DeskPageSaved) => void;
}

export interface DeskPageContext {
  readonly inDialog: boolean;
  /** Route params when routed, the params of the open call when in a dialog. */
  readonly params: Readonly<Record<string, string>>;
  close: () => void;
  saved: (payload: DeskPageSaved) => void;
}

function textParams(raw: Readonly<Record<string, string | string[] | undefined>>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first !== undefined) result[key] = first;
  }
  return result;
}

/**
 * A page asks the context where it runs. The same page is a route and a dialog: it reads its
 * parameters, closes and reports a save through this, and keeps its own route navigation in the options.
 */
export function useDeskPage(options: DeskPageOptions = {}): DeskPageContext {
  const frame = inject(DESK_PAGE_FRAME, null);
  if (frame) {
    return { inDialog: true, params: frame.params, close: frame.close, saved: frame.saved };
  }
  const route = useRoute();
  return {
    inDialog: false,
    get params() {
      return textParams(route.params);
    },
    close: () => options.routeClose?.(),
    saved: (payload) => options.routeSaved?.(payload),
  };
}
