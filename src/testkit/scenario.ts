import type { DeskClient } from './client';
import type { DeskSetSpec } from './types';

/** One scenario: a set to apply first, then steps. */
export interface DeskScenario<Ctx = Record<string, unknown>> {
  name: string;
  /** Test sets applied before the steps, in order. */
  sets?: (string | DeskSetSpec)[];
  steps: (client: DeskClient, ctx: Ctx) => Promise<void>;
}

export interface DeskScenarioSuite<Ctx> {
  name: string;
  /** Sets registered on the page once, before any scenario. */
  library: DeskSetSpec[];
  scenarios: DeskScenario<Ctx>[];
}

export function defineScenarioSuite<Ctx = Record<string, unknown>>(suite: DeskScenarioSuite<Ctx>): DeskScenarioSuite<Ctx> {
  const seen = new Set<string>();
  for (const scenario of suite.scenarios) {
    if (seen.has(scenario.name)) throw new Error(`suite ${suite.name} has two scenarios named ${scenario.name}`);
    seen.add(scenario.name);
  }
  return suite;
}

/** Register a suite's sets, apply a scenario's sets, then run its steps. The caller's runner reports failures. */
export async function runScenario<Ctx>(client: DeskClient, suite: DeskScenarioSuite<Ctx>, name: string, ctx: Ctx): Promise<void> {
  const scenario = suite.scenarios.find((item) => item.name === name);
  if (!scenario) throw new Error(`no scenario ${name} in ${suite.name}`);
  for (const set of suite.library) await client.sets.register(set);
  for (const set of scenario.sets ?? []) await client.sets.apply(set);
  await scenario.steps(client, ctx);
}

/** A small seeded random source, so a failing property run can be replayed from its seed. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface PropertyOptions {
  runs?: number;
  seed?: number;
}

/**
 * Run `check` on `runs` generated inputs. On failure, throws with the seed and the input, so the run can be
 * replayed: `deskProperty(gen, check, { seed })`.
 */
export async function deskProperty<T>(generate: (random: () => number) => T, check: (input: T) => Promise<void> | void, options: PropertyOptions = {}): Promise<void> {
  const seed = options.seed ?? Math.floor(Math.random() * 2 ** 31);
  const random = seeded(seed);
  for (let run = 0; run < (options.runs ?? 25); run += 1) {
    const input = generate(random);
    try {
      await check(input);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      throw new Error(`property failed on run ${run} (seed ${seed}) with ${JSON.stringify(input)}: ${message}`, { cause: caught });
    }
  }
}

export interface ScreenCheck {
  /** Name of the screen in the report. */
  screen: string;
  /** Target for `desk_navigate`. */
  target: string;
  /** Node paths that must exist once the screen is idle. */
  expect?: string[];
}

export interface ScreenResult {
  screen: string;
  ok: boolean;
  problems: string[];
}

function problemText(caught: unknown): string {
  const message = caught instanceof Error ? caught.message : String(caught);
  const first = message.split('\n')[0] ?? message;
  return first.length > 240 ? `${first.slice(0, 240)}…` : first;
}

/** The page navigated, or the tab died, while the driver was still reading it. */
function leftTheDesk(caught: unknown): boolean {
  const message = caught instanceof Error ? caught.message : String(caught);
  return /execution context was destroyed|target page, context or browser has been closed|frame was detached|target crashed/i.test(message);
}

/**
 * Open each screen and check it: it opens, the expected nodes exist, and the audit finds nothing. Returns every
 * result instead of stopping at the first, so one run shows how many screens are drivable.
 *
 * A screen marked done that navigates away, or crashes the tab, is recorded on that screen (`left the desk`).
 * `again` reopens a page where `window.__desk` exists, so the following screens are still checked.
 */
export async function screenChecklist(
  client: DeskClient,
  screens: ScreenCheck[],
  again?: () => Promise<void>,
): Promise<ScreenResult[]> {
  const results: ScreenResult[] = [];
  for (const screen of screens) {
    const problems: string[] = [];
    let departed = false;
    try {
      const opened = await client.navigate(screen.target);
      if (!opened.ok) problems.push(`did not open: ${opened.error ?? 'unknown'}`);
      else {
        await client.waitIdle();
        for (const path of screen.expect ?? []) {
          const described = await client.describe(path).catch(() => null);
          if (!described) problems.push(`missing node ${path}`);
        }
        for (const finding of await client.audit()) problems.push(`${finding.rule}${finding.path ? ` at ${finding.path}` : ''}: ${finding.detail}`);
      }
    } catch (caught) {
      departed = leftTheDesk(caught);
      problems.push(departed ? `left the desk: ${problemText(caught)}` : problemText(caught));
    }
    results.push({ screen: screen.screen, ok: problems.length === 0, problems });
    if (!departed || !again) continue;
    try {
      await again();
    } catch (caught) {
      results.push({
        screen: screen.screen,
        ok: false,
        problems: [`could not return to the desk after ${screen.target}: ${problemText(caught)}`],
      });
      break;
    }
  }
  return results;
}

export interface IntegrityCheck {
  name: string;
  /** Returns problems found, or nothing when the check passes. */
  run: () => Promise<string[] | void>;
}

/** Run named checks and collect every problem, so one sweep reports all the broken checks at once. */
export async function runIntegritySweep(checks: IntegrityCheck[]): Promise<{ ok: boolean; failed: { name: string; problems: string[] }[] }> {
  const failed: { name: string; problems: string[] }[] = [];
  for (const check of checks) {
    try {
      const problems = (await check.run()) ?? [];
      if (problems.length > 0) failed.push({ name: check.name, problems });
    } catch (caught) {
      failed.push({ name: check.name, problems: [caught instanceof Error ? caught.message : String(caught)] });
    }
  }
  return { ok: failed.length === 0, failed };
}
