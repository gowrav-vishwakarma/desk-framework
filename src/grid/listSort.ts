import type { DeskColumn, DeskGridSortAction } from './types';

export interface DeskGridSortState {
  sortColumn: string;
  sortDescending: boolean;
}

export function columnSortMenuEnabled(mode: string, column: DeskColumn | null | undefined): boolean {
  if (mode !== 'list' || !column) return false;
  return column.sortable !== false;
}

/** Next sort state after a header click or menu choice. Returns null when the column cannot sort. */
export function applyDeskGridSort(
  columnId: string,
  action: DeskGridSortAction | undefined,
  columns: readonly DeskColumn[],
  state: DeskGridSortState,
  defaults: DeskGridSortState = { sortColumn: 'id', sortDescending: true },
): DeskGridSortState | null {
  const column = columns.find((item) => item.id === columnId);
  if (!columnSortMenuEnabled('list', column)) return null;
  if (action === 'clear') return { ...defaults };
  if (action === 'asc') return { sortColumn: columnId, sortDescending: false };
  if (action === 'desc') return { sortColumn: columnId, sortDescending: true };
  if (state.sortColumn === columnId) {
    return { sortColumn: columnId, sortDescending: !state.sortDescending };
  }
  return { sortColumn: columnId, sortDescending: false };
}
