import type { DeskClient } from './client';
import type { DeskOutcome } from './types';

/** What a refused or failed outcome says, for an assertion message. */
export function describeOutcome(outcome: DeskOutcome): string {
  if (outcome.ok) return 'ok';
  const issues = outcome.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ');
  return [outcome.error, outcome.reason, issues].filter(Boolean).join(' | ') || 'failed';
}

/** An outcome that must be ok. Throws with the page's own words when it is not. */
export function expectOk(outcome: DeskOutcome, doing: string): DeskOutcome {
  if (!outcome.ok) throw new Error(`${doing} failed: ${describeOutcome(outcome)}`);
  return outcome;
}

/**
 * Steps a person would take, built on the client. Each step is strict: a refused op throws with the reason, so a
 * spec fails where the page said no, not three steps later.
 */
export interface DeskUser {
  go(target: string): Promise<string>;
  fill(path: string, value: unknown): Promise<DeskOutcome>;
  fillForm(path: string, values: Record<string, unknown>): Promise<DeskOutcome[]>;
  /** Press a function-key action or any combo, then wait for the page to settle. */
  press(combo: string): Promise<void>;
  /** Run an op on a node. */
  do(path: string, op: string, args?: Record<string, unknown>): Promise<DeskOutcome>;
  /** Save the form (the form node's own `save` op, the same as Ctrl+S). */
  save(formPath?: string): Promise<DeskOutcome>;
  /** Answer the topmost dialog: `ok`, `cancel`, `yes`, `no`, `save`, `keep`, `lose`. */
  answer(choice: string): Promise<DeskOutcome>;
  /** The topmost dialog's name, or null. */
  topDialog(): Promise<string | null>;
  /** Rows a grid shows now (capped at 100). */
  rows(gridPath: string, limit?: number): Promise<Record<string, unknown>[]>;
  /** The invalid fields under a node, by name and message. */
  invalid(path?: string): Promise<{ path: string; message: string }[]>;
}

export function createDeskUser(client: DeskClient): DeskUser {
  const user: DeskUser = {
    async go(target) {
      const result = await client.navigate(target);
      if (!result.ok) throw new Error(`could not open ${target}: ${result.error ?? 'unknown'}`);
      return result.reached ?? '';
    },
    async fill(path, value) {
      return expectOk(await client.fill(path, value), `fill ${path}`);
    },
    async fillForm(path, values) {
      const outcomes = await client.fillForm(path, values);
      outcomes.forEach((outcome, index) => expectOk(outcome, `fill ${Object.keys(values)[index] ?? index} in ${path}`));
      return outcomes;
    },
    async press(combo) {
      await client.press(combo);
      await client.waitIdle();
    },
    async do(path, op, args = {}) {
      return expectOk(await client.act(path, op, args), `${op} on ${path}`);
    },
    async save(formPath = 'top/form') {
      return expectOk(await client.act(formPath, 'save', {}), `save ${formPath}`);
    },
    async answer(choice) {
      return expectOk(await client.act('top', 'answer', { choice }), `answer ${choice}`);
    },
    async topDialog() {
      const top = await client.call<string | null>('top');
      const last = top?.split('/').pop() ?? '';
      return last.startsWith('dialog:') ? last.slice('dialog:'.length) : null;
    },
    async rows(gridPath, limit = 20) {
      const read = await client.read<{ rows?: Record<string, unknown>[] }>(gridPath, { offset: 0, limit });
      return read.rows ?? [];
    },
    async invalid(path = 'top') {
      const tree = (await client.snapshot({ path, depth: 6 }));
      const found: { path: string; message: string }[] = [];
      const walk = (node: unknown): void => {
        if (!node || typeof node !== 'object') return;
        const item = node as { path?: string; state?: { invalid?: boolean; issue?: string | null }; children?: unknown[] };
        if (item.state?.invalid) found.push({ path: item.path ?? '', message: item.state.issue ?? '' });
        item.children?.forEach(walk);
      };
      (Array.isArray(tree) ? tree : [tree]).forEach(walk);
      return found;
    },
  };
  return user;
}
