import { describe, expect, it } from 'vitest';
import { deskActionClass } from '../src/grid/actionClass';

describe('deskActionClass', () => {
  it('adds the tone class and the host classes', () => {
    expect(deskActionClass({ tone: 'danger', class: 'extra' })).toEqual(['desk-tone-danger', undefined, undefined, 'extra']);
    expect(deskActionClass({ tone: 'warn', class: ['a', 'b'] })).toEqual(['desk-tone-warn', undefined, undefined, ['a', 'b']]);
    expect(deskActionClass({ tone: 'danger', missingData: true, class: 'extra' })).toEqual(['desk-tone-danger', 'desk-action-missing', undefined, 'extra']);
  });

  it('marks an action the user was not given apart from one the record cannot take', () => {
    expect(deskActionClass({ denied: true })).toEqual([undefined, undefined, 'desk-action-denied', undefined]);
  });

  it('omits a missing tone', () => {
    expect(deskActionClass({})).toEqual([undefined, undefined, undefined, undefined]);
  });
});
