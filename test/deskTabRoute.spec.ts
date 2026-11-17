import { describe, expect, it } from 'vitest';
import { isPendingPrefix, joinTabPath, splitTabPath, TAB_QUERY_KEY } from '../src/form/deskTabRoute';

describe('deskTabRoute', () => {
  it('uses tab as the query key', () => {
    expect(TAB_QUERY_KEY).toBe('tab');
  });

  it('splits and joins nested tab paths', () => {
    expect(splitTabPath('places/racks')).toEqual(['places', 'racks']);
    expect(joinTabPath(['places', 'racks'])).toBe('places/racks');
    expect(joinTabPath(['serial'])).toBe('serial');
  });

  it('treats empty or array query values as no path', () => {
    expect(splitTabPath(undefined)).toEqual([]);
    expect(splitTabPath('')).toEqual([]);
    expect(splitTabPath('  ')).toEqual([]);
    expect(splitTabPath(['places', 'racks'])).toEqual(['places', 'racks']);
    expect(splitTabPath(['', 'x'])).toEqual(['x']);
  });

  it('skips sync when the next path is a prefix of a longer restore path', () => {
    expect(isPendingPrefix('places', 'places/racks')).toBe(true);
    expect(isPendingPrefix('places/racks', 'places/racks')).toBe(false);
    expect(isPendingPrefix('people', 'places/racks')).toBe(false);
    expect(isPendingPrefix('', 'places')).toBe(false);
  });
});
