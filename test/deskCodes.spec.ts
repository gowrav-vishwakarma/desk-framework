import { describe, expect, it } from 'vitest';
import { compactCodes } from '../src/split/codes';

describe('codes written short', () => {
  it('reads a run of consecutive codes as its first code and how many follow', () => {
    expect(compactCodes(['XABCD00224', 'XABCD00222', 'XABCD00225', 'XABCD00223', 'XABCD00300'])).toBe('XABCD00222+3, XABCD00300');
  });

  it('keeps prefixes and widths apart; a code without digits stands alone; repeats count once', () => {
    expect(compactCodes(['A1', 'A2', 'B3', 'B4', 'A01', 'IMEI', 'A2'])).toBe('A1+1, A01, B3+1, IMEI');
    expect(compactCodes([])).toBe('');
  });
});
