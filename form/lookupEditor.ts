import type { DeskLookupConfig } from '../grid/types';
import { keyInputOf, toCombo } from '../keys/combo';
import { deskActionsFor, deskKeyLabel } from '../keys/deskKeymap';
import type { DeskFieldMenu } from '../menu/fieldMenu';
import { openDeskPage } from '../page/openDeskPage';

export type DeskLookupEditorMode = 'new' | 'edit';

/** What the lookup knows when the user asks for the editor. */
export interface DeskLookupEditorInput {
  /** The row chosen in this lookup, or null when the value came from the page. */
  picked?: Record<string, unknown> | null;
  /** The text in the box. */
  typed?: string;
}

/**
 * The New or Edit key of the active preset, for a lookup that has an editor.
 * In a preset where Alt+Enter is Edit, Ctrl+Enter stays the section jump, so only a lookup
 * with an editor claims the Edit key.
 */
export function deskEditorMode(event: KeyboardEvent, lookup: DeskLookupConfig | null | undefined): DeskLookupEditorMode | null {
  if (!lookup?.editor) return null;
  const combo = toCombo(keyInputOf(event));
  if (!combo) return null;
  const actions = deskActionsFor(combo);
  if (actions.includes('action-new')) return 'new';
  if (actions.includes('action-edit')) return 'edit';
  return null;
}

function idParams(picked: Record<string, unknown> | null | undefined, valueKey: string): Record<string, string> | null {
  const value = picked?.[valueKey] ?? picked?.id;
  return typeof value === 'string' || typeof value === 'number' ? { id: String(value) } : null;
}

/**
 * Open the lookup's editor page in a dialog and answer with the row to pick, or null when the
 * user closed it without saving or the page returned nothing to pick.
 */
export async function runLookupEditor(
  lookup: DeskLookupConfig,
  mode: DeskLookupEditorMode,
  input: DeskLookupEditorInput = {},
): Promise<Record<string, unknown> | null> {
  const editor = lookup.editor;
  if (!editor) return null;
  const params =
    mode === 'new'
      ? (editor.create?.(input.typed ?? '') ?? {})
      : editor.edit
        ? editor.edit(input.picked ?? null)
        : idParams(input.picked, lookup.valueKey);
  if (!params) return null;
  const title = editor.title?.(mode);
  const saved = await openDeskPage({
    page: editor.page,
    params,
    ...(title ? { title } : {}),
    ...(editor.result ? { result: editor.result } : {}),
  });
  return saved ? editor.toRow(saved) : null;
}

/** New and Edit rows for the right-click menu of a lookup that has an editor. */
export function lookupEditorMenu(run: (mode: DeskLookupEditorMode) => void): DeskFieldMenu {
  const labelled = (text: string, actionId: string): string => {
    const key = deskKeyLabel(actionId);
    return key ? `${text} (${key})` : text;
  };
  return {
    groups: () => [
      {
        id: 'lookup-editor',
        mode: 'action',
        items: [
          { id: 'new', label: labelled('New', 'action-new') },
          { id: 'edit', label: labelled('Edit selected', 'action-edit') },
        ],
      },
    ],
    choose(groupId, itemId) {
      if (groupId !== 'lookup-editor') return;
      if (itemId === 'new' || itemId === 'edit') run(itemId);
    },
  };
}
