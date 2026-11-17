import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { auditDesk } from '../src/automation/audit';

describe('desk audit: controls outside a node', () => {
  let rects: typeof HTMLElement.prototype.getClientRects;
  beforeEach(() => {
    rects = HTMLElement.prototype.getClientRects;
    // happy-dom lays nothing out: every element counts as shown.
    HTMLElement.prototype.getClientRects = () => [{}] as unknown as DOMRectList;
  });
  afterEach(() => {
    HTMLElement.prototype.getClientRects = rects;
    document.body.innerHTML = '';
  });

  it("a lookup's suggestion list is its field's (its ☆ buttons are not findings); a loose button still is", () => {
    document.body.innerHTML = `
      <div data-desk-path="page:x/form:f"><input aria-label="Party" /></div>
      <div class="desk-suggest"><table><tr><td>Shah</td><td><button class="star-btn">☆</button></td></tr></table></div>
      <button aria-label="Stray">x</button>`;
    expect(auditDesk().filter((f) => f.rule === 'outside-node').map((f) => f.detail)).toEqual(['button Stray']);
  });
});
