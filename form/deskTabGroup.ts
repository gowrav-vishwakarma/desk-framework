import type { DeskLayer } from '../keys/layers';

export interface DeskTabItem {
  id: string;
  label: string;
  disabled?: boolean;
  title?: string;
}

/** One tab strip. A strip inside another's pane is its child, so the keys walk depth-first. */
export interface TabGroup {
  host: HTMLElement | null;
  paneEl: HTMLElement | null;
  layer: DeskLayer | null;
  parent: TabGroup | null;
  child: TabGroup | null;
  entry: 'first' | 'last' | null;
  stop: (() => void) | null;
  /** When false, this strip does not read or write `?tab=`. */
  inUrl: boolean;
  /** Segments from the URL still waiting on a child restore. */
  restore: string[] | null;
  /** Root-only: push the chain into the route query. */
  syncUrl: () => void;
  openTabs: () => readonly DeskTabItem[];
  value: () => string | null;
  select: (id: string) => void;
  selectEdge: (edge: 'first' | 'last') => void;
}

/**
 * Every mounted strip. Slot content cannot inject the group that rendered it,
 * so a strip finds its parent from the pane element that contains its bar.
 */
export const deskTabGroups = new Set<TabGroup>();
