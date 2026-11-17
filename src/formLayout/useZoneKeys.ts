import { type Ref } from 'vue';
import type { DeskJumpStop } from '../focus/jump';
import type { DeskFocusField } from '../keys/layers';
import { useDeskFields } from '../keys/useDeskLayer';

export interface DeskZoneStrip {
  id: string;
  title: string;
}

/** The field id of a closed section's summary strip. */
export function sectionFieldId(sectionId: string): string {
  return `section:${sectionId}`;
}

function boxOf(node: HTMLElement): DeskJumpStop['rect'] | null {
  const rect = node.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
}

/** The first field after an open panel, so Enter on the strip skips the fields it already opened. */
function fieldAfter(root: HTMLElement | null, sectionId: string): string | undefined {
  if (!root) return undefined;
  const panel = root.querySelector(`[data-zone-panel="${sectionId}"]`);
  if (!(panel instanceof HTMLElement)) return undefined;
  const layer = panel.closest('[data-desk-layer]') ?? root;
  const nodes = [...layer.querySelectorAll<HTMLElement>('[data-desk-field]')];
  let last = -1;
  nodes.forEach((node, index) => {
    if (panel.contains(node)) last = index;
  });
  if (last < 0) return undefined;
  return nodes[last + 1]?.getAttribute('data-desk-field') || undefined;
}

function jumpStop(root: HTMLElement | null, strip: DeskZoneStrip, openPanel: (sectionId: string) => void): DeskJumpStop | null {
  const node = root?.querySelector(`[data-desk-field="${sectionFieldId(strip.id)}"]`);
  if (!(node instanceof HTMLElement)) return null;
  const rect = boxOf(node);
  if (!rect) return null;
  return {
    rect,
    label: strip.title,
    go: () => {
      openPanel(strip.id);
      return true;
    },
  };
}

/**
 * Ctrl+Enter on a strip opens its section. Enter and Tab move past it.
 * Enter on the last field of an open section moves to whatever follows the panel.
 */
export function useZoneKeys(options: {
  root: Ref<HTMLElement | null>;
  strips: () => readonly DeskZoneStrip[];
  openId: Ref<string | null>;
  lastField: (sectionId: string) => string | undefined;
  openPanel: (sectionId: string) => void;
}): void {
  useDeskFields(() => {
    const open = options.openId.value;
    const fields: DeskFocusField[] = options.strips().map((strip) => {
      const after = open === strip.id ? fieldAfter(options.root.value, strip.id) : undefined;
      return {
        id: sectionFieldId(strip.id),
        jumpFrom: () => jumpStop(options.root.value, strip, options.openPanel),
        ...(after ? { onEnter: after, onTab: after } : {}),
      };
    });
    if (open) {
      const last = options.lastField(open);
      const after = fieldAfter(options.root.value, open);
      if (last && after) fields.push({ id: last, onEnter: after, onTab: after });
    }
    return fields;
  });
}
