/**
 * The testkit runs in Node (Playwright, Vitest, an MCP server). It has no runtime imports, so it never pulls the
 * app in. It talks to the page only through `window.__desk`, the driver the framework installs.
 */

/** What the testkit needs from a browser page. A Playwright `Page` already fits. */
export interface DeskPage {
  evaluate<R, A = undefined>(fn: (arg: A) => R | Promise<R>, arg?: A): Promise<R>;
  waitForFunction?(fn: () => boolean, arg?: unknown, options?: { timeout?: number }): Promise<unknown>;
  locator?(selector: string): { first(): { click(options?: { timeout?: number }): Promise<void> }; count(): Promise<number> };
}

/**
 * A Playwright-style locator, for helpers that act as a person does (click, type, press keys) instead of calling the
 * driver's ops. A Playwright `Locator` fits.
 */
export interface DeskLocator {
  locator(selector: string): DeskLocator;
  filter(options: { hasText?: string | RegExp }): DeskLocator;
  first(): DeskLocator;
  click(options?: { timeout?: number }): Promise<void>;
  count(): Promise<number>;
  isVisible(options?: { timeout?: number }): Promise<boolean>;
}

/** A page a person drives: a Playwright `Page` fits. */
export interface DeskUserPage {
  locator(selector: string): DeskLocator;
  keyboard: { press(key: string): Promise<void> };
}

export interface DeskChange {
  path: string;
  before: unknown;
  after: unknown;
}

export interface DeskIssueView {
  path: string;
  message: string;
}

export interface DeskOutcome {
  ok: boolean;
  error?: string;
  reason?: string;
  result?: unknown;
  changed: DeskChange[];
  opened: string[];
  closed: string[];
  focus: string | null;
  issues: DeskIssueView[];
  toasts: string[];
  navigated?: string;
}

export interface DeskAuditFinding {
  rule: string;
  path?: string;
  detail: string;
}

export interface DeskSetSpec {
  name: string;
  extends?: string[];
  parts: Record<string, unknown>;
}

export type DeskRows = { offset?: number; limit?: number };
