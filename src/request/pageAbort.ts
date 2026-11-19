import type { RouteLocationNormalized, Router } from 'vue-router';

/**
 * One abort signal per page. Every call a page makes carries its page's signal (the host's HTTP client asks
 * `deskPageSignal()` for each request); when the user leaves the page, the router aborts it, so a long report or
 * list the user no longer looks at stops instead of running on. A reload or a closed tab drops the calls anyway.
 *
 * A page is a route path: a change of path or params is another page, a change of query or hash (a filter, the
 * `?tab=` of `DeskTabs`) is the same one. While a navigation is on its way, calls belong to the page being opened
 * (its route guards load for it); the page being left made its last calls before that (its leave question and
 * its Save run first). When the navigation ends, every page but the one on screen is aborted, also when the
 * navigation was refused.
 */

export type DeskPageKey = (route: RouteLocationNormalized) => string;

const controllers = new Map<string, AbortController>();
let router: Router | null = null;
let pageKey: DeskPageKey = (route) => route.path;
let opening: string | null = null;

/** Never aborted: for a load several pages share (a once-per-session read), so leaving one page keeps it. */
const shared = new AbortController().signal;

/** The reason a left page's calls carry: an `AbortError`, as `fetch` and axios report it. */
function pageLeft(): DOMException {
  return new DOMException('The page was left', 'AbortError');
}

function controllerFor(key: string): AbortController {
  let controller = controllers.get(key);
  if (!controller) {
    controller = new AbortController();
    controllers.set(key, controller);
  }
  return controller;
}

/** Aborts the calls of every page but `keep`. */
function abortAllBut(keep: string | null): void {
  for (const [key, controller] of controllers) {
    if (key === keep) continue;
    controller.abort(pageLeft());
    controllers.delete(key);
  }
}

/** The page on screen, or null before the first navigation landed. */
function shownKey(): string | null {
  const route = router?.currentRoute.value;
  return route && route.matched.length > 0 ? pageKey(route) : null;
}

/**
 * Wire the router. Call it once, before the host adds its own `beforeEach` guards, so a guard that loads for the
 * page being opened already gets that page's signal. `key` names a page (default: the route's path). Returns the
 * uninstall (tests).
 */
export function installDeskPageAbort(target: Router, key?: DeskPageKey): () => void {
  router = target;
  if (key) pageKey = key;
  const removeBefore = target.beforeEach((to) => {
    opening = pageKey(to);
  });
  const removeAfter = target.afterEach(() => {
    opening = null;
    abortAllBut(shownKey());
  });
  return () => {
    removeBefore();
    removeAfter();
    abortAllBut(null);
    router = null;
    opening = null;
    pageKey = (route) => route.path;
  };
}

/**
 * The signal of the page a call belongs to: the page being opened while a navigation runs, else the page on
 * screen. Undefined before `installDeskPageAbort` or before the first page: such a call is never aborted.
 */
export function deskPageSignal(): AbortSignal | undefined {
  const key = opening ?? shownKey();
  return key === null ? undefined : controllerFor(key).signal;
}

/** A signal no page change aborts, for a load pages share (pass it as the call's own signal). */
export function deskSharedSignal(): AbortSignal {
  return shared;
}

/**
 * Whether a failure is an abort (a left page, a superseded run) rather than an answer: `AbortError` from `fetch` or
 * a signal, axios' `CanceledError` / `ERR_CANCELED`. An aborted call has nothing to tell the user.
 */
export function deskIsAborted(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { name, code } = error as { name?: unknown; code?: unknown };
  return name === 'AbortError' || name === 'CanceledError' || code === 'ERR_CANCELED';
}

/**
 * `child` aborts when `parent` does (with its reason). Returns the unlink, so a finished call does not leave a
 * listener on a long-lived page signal.
 */
export function linkDeskAbort(child: AbortController, parent: AbortSignal | undefined): () => void {
  if (!parent) return () => undefined;
  if (parent.aborted) {
    child.abort(parent.reason);
    return () => undefined;
  }
  const follow = () => child.abort(parent.reason);
  parent.addEventListener('abort', follow, { once: true });
  return () => parent.removeEventListener('abort', follow);
}
