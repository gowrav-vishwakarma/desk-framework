import type { DeskFieldLabelStyle, DeskFormLayout } from './types';

/**
 * The label drawing for one field. A date has no placeholder, so the placeholder
 * style draws it with the label inside the input.
 */
export function labelStyleFor(layout: Pick<DeskFormLayout, 'labelStyle' | 'inset'>, field: { id: string; kind?: string | undefined }): DeskFieldLabelStyle {
  if (layout.labelStyle === 'side') return 'side';
  if (layout.labelStyle === 'top') return 'top';
  if (field.kind === 'date' || layout.inset.includes(field.id)) return 'inset';
  return 'placeholder';
}
