import type { Rdl2ColumnFormat, Rdl2Tone } from '../language';
import type { ValueType } from './expr';

export const FORMATS: { value: Rdl2ColumnFormat; label: string; for: ValueType[] }[] = [
  { value: 'money', label: 'Money', for: ['number'] },
  { value: 'qty', label: 'Quantity', for: ['number'] },
  { value: 'number', label: 'Number', for: ['number'] },
  { value: 'percent', label: 'Percent', for: ['number'] },
  { value: 'date', label: 'Date', for: ['date'] },
  { value: 'datetime', label: 'Date and time', for: ['date'] },
  { value: 'boolean', label: 'Yes / no', for: ['boolean'] },
  { value: 'text', label: 'Text', for: ['text', 'number', 'date', 'boolean'] },
];

/** Formats that suit a column of this type first, then the rest. */
export function formatsFor(type: ValueType): typeof FORMATS {
  if (type === 'unknown') return FORMATS;
  return [
    ...FORMATS.filter((item) => item.for.includes(type)),
    ...FORMATS.filter((item) => !item.for.includes(type)),
  ];
}

export const TONES: { value: Rdl2Tone; label: string }[] = [
  { value: 'success', label: 'Green' },
  { value: 'info', label: 'Blue' },
  { value: 'warning', label: 'Yellow' },
  { value: 'alert', label: 'Orange' },
  { value: 'danger', label: 'Red' },
];
