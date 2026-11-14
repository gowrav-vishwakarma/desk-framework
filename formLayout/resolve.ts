import { copyFormLayout, FORM_LAYOUT_VERSION, isGapId, type DeskFormLayout, type DeskLayoutFieldRef, type DeskLayoutOption, type DeskLayoutSection } from './types';

const LABEL_STYLES = new Set(['side', 'top', 'placeholder']);

interface FieldHome {
  zone: string;
  section: DeskLayoutSection;
}

function isSavedLayout(value: unknown): value is DeskFormLayout {
  if (!value || typeof value !== 'object') return false;
  const row = value as DeskFormLayout;
  return row.version === FORM_LAYOUT_VERSION && typeof row.zones === 'object' && row.zones !== null && Array.isArray(row.hidden);
}

function hasField(section: DeskLayoutSection, id: string): boolean {
  return section.fields.some((field) => field.id === id);
}

function homeIn(layout: DeskFormLayout, id: string): FieldHome | null {
  for (const [zone, sections] of Object.entries(layout.zones)) {
    const section = sections.find((item) => hasField(item, id));
    if (section) return { zone, section };
  }
  return null;
}

function ensureSection(layout: DeskFormLayout, zone: string, source: DeskLayoutSection): DeskLayoutSection {
  const sections = layout.zones[zone] ?? (layout.zones[zone] = []);
  const found = sections.find((section) => section.id === source.id);
  if (found) return found;
  const created: DeskLayoutSection = {
    id: source.id,
    title: source.title,
    fields: [],
    ...(source.open ? { open: true } : {}),
  };
  sections.push(created);
  return created;
}

/**
 * The layout to draw. A missing or outdated save falls back to the defaults.
 * Unknown ids are dropped, new ids land in their default section, hidden ids stay
 * hidden, and a locked id is never hidden.
 */
function savedOptions(saved: unknown): Record<string, string> {
  if (!isSavedLayout(saved) || !saved.options || typeof saved.options !== 'object') return {};
  return saved.options;
}

function resolveOptions(saved: unknown, options: readonly DeskLayoutOption[]): Record<string, string> | undefined {
  if (options.length === 0) return undefined;
  const stored = savedOptions(saved);
  const next: Record<string, string> = {};
  for (const option of options) {
    const raw = stored[option.id];
    const known = typeof raw === 'string' && option.choices.some((choice) => choice.value === raw);
    next[option.id] = known ? raw : option.default;
  }
  return next;
}

export function resolveFormLayout(
  defaults: DeskFormLayout,
  saved: unknown,
  fields: readonly DeskLayoutFieldRef[],
  options: readonly DeskLayoutOption[] = [],
): DeskFormLayout {
  const allowed = new Set(fields.map((field) => field.id));
  const locked = new Set(fields.filter((field) => field.locked).map((field) => field.id));
  const base = copyFormLayout(defaults);
  for (const sections of Object.values(base.zones)) {
    for (const section of sections) section.fields = section.fields.filter((field) => allowed.has(field.id));
  }
  base.hidden = base.hidden.filter((id) => allowed.has(id) && !locked.has(id));
  base.inset = base.inset.filter((id) => allowed.has(id));
  base.version = FORM_LAYOUT_VERSION;

  function withOptions(layout: DeskFormLayout): DeskFormLayout {
    const chosen = resolveOptions(saved, options);
    if (chosen) layout.options = chosen;
    else delete layout.options;
    return layout;
  }

  if (!isSavedLayout(saved)) return withOptions(base);

  const result = copyFormLayout(saved);
  result.version = FORM_LAYOUT_VERSION;
  if (!LABEL_STYLES.has(result.labelStyle)) result.labelStyle = base.labelStyle;
  for (const zone of Object.keys(base.zones)) {
    if (!result.zones[zone]) result.zones[zone] = [];
  }

  const placed = new Set<string>();
  for (const sections of Object.values(result.zones)) {
    for (const section of sections) {
      section.fields = section.fields.filter((field) => {
        if (isGapId(field.id)) {
          // A blank box needs no catalog entry. A repeated id is dropped like a repeated field.
          if (placed.has(field.id)) return false;
          placed.add(field.id);
          return true;
        }
        if (!allowed.has(field.id) || placed.has(field.id)) return false;
        placed.add(field.id);
        return true;
      });
    }
  }
  result.hidden = result.hidden.filter((id) => allowed.has(id) && !placed.has(id) && !locked.has(id));
  for (const id of result.hidden) placed.add(id);

  for (const field of fields) {
    if (placed.has(field.id)) continue;
    const known = homeIn(base, field.id);
    const zone = known?.zone ?? field.zone;
    const sectionSource = known?.section ?? (field.sectionId ? { id: field.sectionId, title: field.sectionId, fields: [] } : null);
    if (!zone || !sectionSource) continue;
    ensureSection(result, zone, sectionSource).fields.push({ id: field.id });
    if (base.inset.includes(field.id) && !result.inset.includes(field.id)) result.inset.push(field.id);
    placed.add(field.id);
  }

  result.inset = [...new Set(result.inset.filter((id) => allowed.has(id)))];
  return withOptions(result);
}

/** Where a field sits, or null when it is hidden or absent. */
export function locateField(layout: DeskFormLayout, fieldId: string): { zone: string; sectionId: string; index: number } | null {
  for (const [zone, sections] of Object.entries(layout.zones)) {
    for (const section of sections) {
      const index = section.fields.findIndex((field) => field.id === fieldId);
      if (index >= 0) return { zone, sectionId: section.id, index };
    }
  }
  return null;
}
