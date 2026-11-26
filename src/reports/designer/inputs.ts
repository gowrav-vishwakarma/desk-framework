import type { Rdl2ParamType } from '../language';
import type { IconName } from './icons';

/** Date defaults the runner understands, worked out from the user's financial year. */
export const DATE_WORDS: { value: string; label: string }[] = [
  { value: 'fyStart', label: 'Start of the year' },
  { value: 'fyToDate', label: 'Today (within the year)' },
  { value: 'fyEnd', label: 'End of the year' },
  { value: 'monthStart', label: 'Start of the month' },
  { value: 'today', label: 'Today' },
];

export const PARAM_TYPES: { value: Rdl2ParamType; label: string; icon: IconName; help: string }[] =
  [
    { value: 'date', label: 'Date', icon: 'date', help: 'A day, such as the start of the period' },
    {
      value: 'number',
      label: 'Number',
      icon: 'number',
      help: 'A number, such as a minimum amount',
    },
    { value: 'text', label: 'Text', icon: 'text', help: 'Text to search for' },
    { value: 'boolean', label: 'Yes / no', icon: 'boolean', help: 'A switch' },
    {
      value: 'select',
      label: 'Choice',
      icon: 'blocks',
      help: 'One of a few fixed choices you list',
    },
    {
      value: 'lookup',
      label: 'Pick records',
      icon: 'source',
      help: 'Parties, products, branches… picked from the records',
    },
  ];
