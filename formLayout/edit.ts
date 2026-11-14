import { copyFormLayout, DESK_FORM_GRID_COLUMNS, isGapId, newGapId, type DeskFormLayout, type DeskLabelStyle, type DeskLayoutSection, type DeskLayoutSlot } from './types';

export interface DeskFieldTarget {
  zone: string;
  sectionId: string;
  index: number;
}

function pull(layout: DeskFormLayout, fieldId: string): DeskLayoutSlot {
  let taken: DeskLayoutSlot = { id: fieldId };
  for (const sections of Object.values(layout.zones)) {
    for (const section of sections) {
      const slot = section.fields.find((field) => field.id === fieldId);
      if (slot) taken = slot;
      section.fields = section.fields.filter((field) => field.id !== fieldId);
    }
  }
  layout.hidden = layout.hidden.filter((id) => id !== fieldId);
  return taken;
}

function sectionAt(layout: DeskFormLayout, zone: string, sectionId: string): DeskLayoutSection | undefined {
  return layout.zones[zone]?.find((section) => section.id === sectionId);
}

/** Move a field into a section at an index. A missing section leaves the layout unchanged. */
export function moveField(layout: DeskFormLayout, fieldId: string, to: DeskFieldTarget): DeskFormLayout {
  const target = sectionAt(layout, to.zone, to.sectionId);
  if (!target) return layout;
  const next = copyFormLayout(layout);
  const slot = pull(next, fieldId);
  const section = sectionAt(next, to.zone, to.sectionId);
  if (!section) return layout;
  const index = Math.max(0, Math.min(to.index, section.fields.length));
  section.fields.splice(index, 0, slot);
  return next;
}

/** Hide a field. A locked field stays where it is. */
export function hideField(layout: DeskFormLayout, fieldId: string, locked: boolean): DeskFormLayout {
  if (locked || layout.hidden.includes(fieldId)) return layout;
  const next = copyFormLayout(layout);
  pull(next, fieldId);
  // A blank box is not a field, so removing it deletes it instead of listing it as hidden.
  if (!isGapId(fieldId)) next.hidden.push(fieldId);
  return next;
}

/** Put a blank box at the end of a section, or at `index`. Returns the new id too. */
export function addGap(layout: DeskFormLayout, zone: string, sectionId: string, index?: number): { layout: DeskFormLayout; id: string } {
  if (!sectionAt(layout, zone, sectionId)) return { layout, id: '' };
  const next = copyFormLayout(layout);
  const section = sectionAt(next, zone, sectionId);
  if (!section) return { layout, id: '' };
  const id = newGapId();
  const at = index === undefined ? section.fields.length : Math.max(0, Math.min(index, section.fields.length));
  section.fields.splice(at, 0, { id });
  return { layout: next, id };
}

/** Put a hidden field at the end of a section. */
export function restoreField(layout: DeskFormLayout, fieldId: string, to: { zone: string; sectionId: string }): DeskFormLayout {
  const section = sectionAt(layout, to.zone, to.sectionId);
  if (!section) return layout;
  return moveField(layout, fieldId, { zone: to.zone, sectionId: to.sectionId, index: section.fields.length });
}

function slotIn(layout: DeskFormLayout, fieldId: string): DeskLayoutSlot | undefined {
  for (const sections of Object.values(layout.zones)) {
    for (const section of sections) {
      const slot = section.fields.find((field) => field.id === fieldId);
      if (slot) return slot;
    }
  }
  return undefined;
}

/** Set a field's width in twelfths. Null goes back to the label style's default. */
export function setFieldCols(layout: DeskFormLayout, fieldId: string, cols: number | null): DeskFormLayout {
  if (!slotIn(layout, fieldId)) return layout;
  const next = copyFormLayout(layout);
  const slot = slotIn(next, fieldId);
  if (!slot) return layout;
  if (cols === null || !Number.isFinite(cols)) delete slot.cols;
  else slot.cols = Math.min(DESK_FORM_GRID_COLUMNS, Math.max(1, Math.round(cols)));
  return next;
}

/** Make a field start a new row, or flow after the field before it. */
export function setFieldRowStart(layout: DeskFormLayout, fieldId: string, row: boolean): DeskFormLayout {
  if (!slotIn(layout, fieldId)) return layout;
  const next = copyFormLayout(layout);
  const slot = slotIn(next, fieldId);
  if (!slot) return layout;
  if (row) slot.row = true;
  else delete slot.row;
  return next;
}

export function toggleInset(layout: DeskFormLayout, fieldId: string): DeskFormLayout {
  const next = copyFormLayout(layout);
  next.inset = next.inset.includes(fieldId) ? next.inset.filter((id) => id !== fieldId) : [...next.inset, fieldId];
  return next;
}

/** Remember one layout option. A value that is not a choice is ignored by resolve. */
export function setLayoutOption(layout: DeskFormLayout, id: string, value: string): DeskFormLayout {
  const next = copyFormLayout(layout);
  next.options = { ...next.options, [id]: value };
  return next;
}

export function setLabelStyle(layout: DeskFormLayout, labelStyle: DeskLabelStyle): DeskFormLayout {
  if (layout.labelStyle === labelStyle) return layout;
  const next = copyFormLayout(layout);
  next.labelStyle = labelStyle;
  return next;
}

export function addSection(layout: DeskFormLayout, zone: string, title: string): DeskFormLayout {
  const next = copyFormLayout(layout);
  const sections = next.zones[zone] ?? (next.zones[zone] = []);
  const id = `s-${Math.random().toString(16).slice(2, 8)}`;
  sections.push({ id, title: title.trim() || 'Section', fields: [] });
  return next;
}

/**
 * Remove a section. Its fields go to Hidden. Locked fields go to the first
 * section that remains, or stay in a section when they are the only ones left.
 */
export function removeSection(layout: DeskFormLayout, zone: string, sectionId: string, lockedIds: readonly string[]): DeskFormLayout {
  const sections = layout.zones[zone];
  if (!sections?.some((section) => section.id === sectionId)) return layout;
  const next = copyFormLayout(layout);
  const list = next.zones[zone] ?? [];
  const index = list.findIndex((section) => section.id === sectionId);
  const removed = list[index];
  if (!removed) return layout;
  list.splice(index, 1);
  const locked = new Set(lockedIds);
  const stay = removed.fields.filter((field) => locked.has(field.id));
  for (const field of removed.fields) {
    if (!locked.has(field.id) && !isGapId(field.id) && !next.hidden.includes(field.id)) next.hidden.push(field.id);
  }
  if (stay.length > 0) {
    const home = list[0];
    if (home) home.fields.push(...stay);
    else list.push({ id: removed.id, title: removed.title, fields: stay, ...(removed.open ? { open: true } : {}) });
  }
  return next;
}

export function moveSection(layout: DeskFormLayout, zone: string, sectionId: string, dir: -1 | 1): DeskFormLayout {
  const sections = layout.zones[zone];
  if (!sections) return layout;
  const index = sections.findIndex((section) => section.id === sectionId);
  const swap = index + dir;
  if (index < 0 || swap < 0 || swap >= sections.length) return layout;
  const next = copyFormLayout(layout);
  const list = next.zones[zone] ?? [];
  const current = list[index];
  const other = list[swap];
  if (!current || !other) return layout;
  list[index] = other;
  list[swap] = current;
  return next;
}

export function renameSection(layout: DeskFormLayout, zone: string, sectionId: string, title: string): DeskFormLayout {
  const trimmed = title.trim();
  if (!trimmed || !sectionAt(layout, zone, sectionId)) return layout;
  const next = copyFormLayout(layout);
  const section = sectionAt(next, zone, sectionId);
  if (section) section.title = trimmed;
  return next;
}

export function setOpen(layout: DeskFormLayout, zone: string, sectionId: string, open: boolean): DeskFormLayout {
  if (!sectionAt(layout, zone, sectionId)) return layout;
  const next = copyFormLayout(layout);
  const section = sectionAt(next, zone, sectionId);
  if (!section) return layout;
  if (open) section.open = true;
  else delete section.open;
  return next;
}
