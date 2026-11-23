import { afterEach, describe, expect, it } from 'vitest';
import { deskLocators } from '../src/testkit/locators';

afterEach(() => {
  document.body.innerHTML = '';
});

/** A page with a settings grid and an item grid (two rows, a footer line), as the framework stamps them. */
function page(): void {
  document.body.innerHTML = `
    <div data-desk-path="page:p/settings:inv">
      <table><tr>
        <td data-setting-label="a">A</td><td data-setting="a">1</td>
        <td data-setting-label="b">B</td><td data-setting="b">2</td>
      </tr></table>
      <input id="in-settings" />
    </div>
    <div data-desk-path="page:p/form:form/grid:items">
      <table>
        <tbody>
          <tr><td class="first-col">1</td><td data-cell="0-0" data-col="item">Phone</td><td data-cell="0-1" data-col="qty">5</td></tr>
          <tr><td class="first-col">2</td><td data-cell="1-0" data-col="item">Case</td><td data-cell="1-1" data-col="qty">2</td></tr>
        </tbody>
        <tfoot><tr><td data-foot-line="grand">Grand total</td><td data-foot-line="grand">100</td><td data-foot-line="tax">18</td></tr></tfoot>
      </table>
    </div>
    <div data-desk-path="page:other/grid:items"><table><tbody><tr><td data-cell="0-1" data-col="qty">9</td></tr></tbody></table></div>`;
}
const texts = (selector: string): string[] => [...document.querySelectorAll(selector)].map((el) => el.textContent ?? '');

describe('deskLocators: elements inside a node', () => {
  it('within never matches the node itself, by full or short path', () => {
    page();
    expect(texts(deskLocators.within('page:p/settings:inv', '[data-setting="a"]'))).toEqual(['1']);
    expect(texts(deskLocators.within('settings:inv', '[data-setting="a"]'))).toEqual(['1']);
    expect(document.querySelectorAll(deskLocators.within('settings:inv', '[data-setting="a"]'))[0]?.tagName).toBe('TD');
  });

  it('settingRow is the label and value of one setting, not its neighbour on the same line', () => {
    page();
    expect(texts(deskLocators.settingRow('page:p/settings:inv', 'b'))).toEqual(['B', '2']);
  });

  it('control is the input inside the node only', () => {
    page();
    expect([...document.querySelectorAll(deskLocators.control('settings:inv'))].map((el) => el.id)).toEqual(['in-settings']);
  });

  it('grid cells, rows and footer lines stay inside the named grid', () => {
    page();
    expect(texts(deskLocators.gridCellIn('page:p/form:form/grid:items', 0, 'qty'))).toEqual(['5']);
    expect(texts(deskLocators.gridRowCells('page:p/form:form/grid:items', 1))).toEqual(['Case', '2']);
    expect(texts(deskLocators.footLine('form:form/grid:items', 'grand'))).toEqual(['Grand total', '100']);
  });
});
