/** Saved form layouts. A newer version is ignored and the page falls back to its defaults. */
export const FORM_LAYOUT_VERSION = 1;

/** How every field in the form draws its label. */
export type DeskLabelStyle = 'side' | 'top' | 'placeholder';

/** How one field draws its label. `inset` keeps the label inside the input. */
export type DeskFieldLabelStyle = DeskLabelStyle | 'inset';

/** Sections lay fields out on a 12-column grid, like Bootstrap rows and columns. */
export const DESK_FORM_GRID_COLUMNS = 12;

/** Blank boxes a layout adds to leave a gap. They are not form fields and need no catalog entry. */
export const DESK_GAP_PREFIX = 'gap:';

export function isGapId(id: string): boolean {
  return id.startsWith(DESK_GAP_PREFIX);
}

export function newGapId(): string {
  return `${DESK_GAP_PREFIX}${Math.random().toString(16).slice(2, 8)}`;
}

/** One field in a section. */
export interface DeskLayoutSlot {
  id: string;
  /** Width in twelfths of the row, 1 to 12. Missing uses the label style's default. */
  cols?: number;
  /** Starts a new row, even when the row before has room. */
  row?: true;
  /**
   * Older saves: columns of the old 4-to-6 column grid. Read once and turned into `cols`.
   * @deprecated
   */
  span?: number;
}

/** A saved layout may still list field ids as strings. Resolve turns those into slots. */
export type DeskLayoutFieldEntry = string | DeskLayoutSlot;

function clampCols(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.min(DESK_FORM_GRID_COLUMNS, Math.max(1, Math.round(value)));
}

export function layoutSlot(field: DeskLayoutFieldEntry): DeskLayoutSlot | null {
  if (typeof field === 'string') return field ? { id: field } : null;
  if (!field || typeof field.id !== 'string' || !field.id) return null;
  // An old span of N columns was N quarters of the row on the usual 4-column form.
  const cols = clampCols(field.cols) ?? (typeof field.span === 'number' && field.span > 1 ? clampCols(field.span * 3) : undefined);
  const slot: DeskLayoutSlot = { id: field.id };
  if (cols) slot.cols = cols;
  if (field.row === true) slot.row = true;
  return slot;
}

export function layoutSlots(fields: readonly DeskLayoutFieldEntry[]): DeskLayoutSlot[] {
  const slots: DeskLayoutSlot[] = [];
  for (const field of fields) {
    const slot = layoutSlot(field);
    if (slot) slots.push(slot);
  }
  return slots;
}

/** A field's width when it has none of its own: 4 per row beside the label, 6 per row otherwise. */
export function defaultSlotCols(labelStyle: DeskLabelStyle): number {
  return labelStyle === 'side' ? 3 : 2;
}

export function slotCols(slot: DeskLayoutSlot, labelStyle: DeskLabelStyle): number {
  return clampCols(slot.cols) ?? defaultSlotCols(labelStyle);
}

/**
 * CSS variables a slot needs on the 12-column grid: full width, and the wider widths it takes on
 * medium and small screens, so a row of four becomes three and then two.
 */
export function slotGridVars(slot: DeskLayoutSlot, labelStyle: DeskLabelStyle): Record<string, string> {
  const cols = slotCols(slot, labelStyle);
  return {
    '--desk-slot-cols': String(cols),
    '--desk-slot-cols-md': String(Math.min(DESK_FORM_GRID_COLUMNS, Math.round((cols * 4) / 3))),
    '--desk-slot-cols-sm': String(Math.min(DESK_FORM_GRID_COLUMNS, cols * 2)),
  };
}

export interface DeskLayoutSection {
  id: string;
  title: string;
  fields: DeskLayoutSlot[];
  /** Always open. A section without this sits in the summary strip until the user opens it. */
  open?: boolean;
}

/** A choice the form layout dialog offers, such as where a value comes from. */
export interface DeskLayoutOptionChoice {
  value: string;
  label: string;
}

/** A named bundle of option values. Choosing it writes those values; the user can still change each one. */
export interface DeskLayoutPreset {
  id: string;
  label: string;
  /** Designer tab this preset belongs to. Missing means every tab. */
  tab?: string;
  options: Record<string, string>;
}

/** One setting saved with the form layout. An unknown saved value falls back to `default`. */
export interface DeskLayoutOption {
  id: string;
  label: string;
  choices: DeskLayoutOptionChoice[];
  default: string;
  /** Designer tab this setting belongs to. Missing means the first tab. */
  tab?: string;
}

export interface DeskFormLayout {
  version: number;
  labelStyle: DeskLabelStyle;
  /** Field ids that keep a label inside the input while the form uses the placeholder style. */
  inset: string[];
  zones: Record<string, DeskLayoutSection[]>;
  hidden: string[];
  /** Chosen values for layout options. Missing keys use each option's default. */
  options?: Record<string, string>;
}

/** A field the designer can place. `zone` and `sectionId` are where a new field lands. */
export interface DeskLayoutFieldRef {
  id: string;
  locked?: boolean;
  zone?: string;
  sectionId?: string;
}

/** What the designer shows for one field. */
export interface DeskLayoutFieldInfo extends DeskLayoutFieldRef {
  label: string;
  kind?: string;
  hint?: string;
}

export function copyFormLayout(layout: DeskFormLayout): DeskFormLayout {
  const zones: DeskFormLayout['zones'] = {};
  for (const [zone, sections] of Object.entries(layout.zones)) {
    zones[zone] = sections.map((section) => ({
      id: section.id,
      title: section.title,
      fields: layoutSlots(section.fields),
      ...(section.open ? { open: true } : {}),
    }));
  }
  return {
    version: layout.version,
    labelStyle: layout.labelStyle,
    inset: [...layout.inset],
    zones,
    hidden: [...layout.hidden],
    ...(layout.options ? { options: { ...layout.options } } : {}),
  };
}
