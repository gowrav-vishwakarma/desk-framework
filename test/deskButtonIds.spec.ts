import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { deskButtonIdProblem } from '../src/automation/audit';

/**
 * Button ids name their thing and action, at least two words (`pivot-calc-save`), never one word or only generic
 * words (user, 2026-11-17). The audit checks the buttons a page draws; this checks every literal id in the
 * framework's own templates, so a new one-word id fails here before any app draws it.
 */
const SRC = join(__dirname, '../src');
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : name.endsWith('.vue') ? [path] : [];
  });

/** Literal ids on buttons: `<button … data-desk-field="x"` / `data-desk-action="x"` (also DeskButton, role="button"). */
function literalButtonIds(text: string): string[] {
  const tags = text.match(/<(button|DeskButton|a)\b[^>]*>|<[A-Za-z-]+\b[^>]*role="button"[^>]*>/g) ?? [];
  return tags.flatMap((tag) => [...tag.matchAll(/(?<![:\w])data-desk-(?:field|action)="([^"]+)"/g)].map((m) => m[1]!));
}

describe('button ids', () => {
  it('the rule: two words at least, and not only generic ones', () => {
    expect(deskButtonIdProblem('save')).toMatch(/one word/);
    expect(deskButtonIdProblem('add-new')).toMatch(/names no thing/);
    expect(deskButtonIdProblem('charge-add-new')).toBeNull();
    expect(deskButtonIdProblem('set-apply:base')).toBeNull();
  });

  it("every literal button id in the framework's templates follows it", () => {
    const bad = files(SRC).flatMap((file) =>
      literalButtonIds(readFileSync(file, 'utf8')).flatMap((id) => {
        const problem = deskButtonIdProblem(id);
        return problem ? [`${relative(SRC, file)}: ${problem}`] : [];
      }),
    );
    expect(bad).toEqual([]);
  });
});
