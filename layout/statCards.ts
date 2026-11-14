import type { DeskTone } from '../grid/types';

/** One figure for `DeskStatCards`: a label and a value already formatted by the page. */
export interface DeskStatCard {
  id: string;
  label: string;
  value: string;
  tone?: DeskTone;
  /** Cards with the same line share a row, lowest first. Default 1. */
  line?: number;
}
