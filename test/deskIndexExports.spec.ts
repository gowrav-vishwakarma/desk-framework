import { describe, expect, it } from 'vitest';
import * as desk from '../src/index';

describe('public entry', () => {
  it('exports field focus and the pivot table and chart for hosts', () => {
    expect(typeof desk.focusDeskField).toBe('function');
    expect(desk.PivotTable).toBeTruthy();
    expect(desk.PivotChart).toBeTruthy();
    expect(desk.focusDeskField('no-such-field')).toBe(false);
  });
});
