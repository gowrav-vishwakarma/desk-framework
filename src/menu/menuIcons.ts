/**
 * Icons a menu row may show before its label (`DeskMenuNode.icon`) or at its end (`endIcon`):
 * 16 × 16 strokes, drawn in the row's text colour.
 */
export const DESK_MENU_ICONS = {
  /** A pivot table: header row and column over a grid. */
  pivot: 'M2.5 2.5h11v11h-11zM2.5 6h11M6 2.5v11M9.75 6v7.5M6 9.75h7.5',
  /** A plain list of rows. */
  table: 'M2.5 3.5h11v9h-11zM2.5 6.5h11M2.5 9.5h11',
  /** Bars. */
  chart: 'M2.5 13.5h11M4.5 11.5v-4M8 11.5v-7M11.5 11.5v-5.5',
  /** A star, for a favourite. */
  star: 'M8 2.2l1.75 3.6 3.95.55-2.85 2.8.7 3.95L8 11.25 4.45 13.1l.7-3.95L2.3 6.35l3.95-.55z',
  /** A shield with a tick: a report that ships with Ankpal. */
  system: 'M8 1.6 3.1 3.5v3.9c0 2.9 2.05 4.85 4.9 6 2.85-1.15 4.9-3.1 4.9-6V3.5zM6.05 7.7l1.35 1.35L10.05 6.25',
  /** A person: a report saved for this company. */
  company: 'M8 2.15a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8M3.35 13.85c.7-2.6 2.35-3.85 4.65-3.85s3.95 1.25 4.65 3.85',
  /** A padlock: not permitted for this user. */
  lock: 'M4.5 7.5h7v6h-7zM5.75 7.5V5.25a2.25 2.25 0 0 1 4.5 0V7.5',
  /** A tag: not in the company's plan. */
  plan: 'M2.5 8.2V2.5h5.7l5.3 5.3-5.7 5.7zM5.25 5.25h.01',
} as const;

export type DeskMenuIcon = keyof typeof DESK_MENU_ICONS;
