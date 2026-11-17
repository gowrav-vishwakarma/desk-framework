import { nextTick } from 'vue';
import { keyInputOf, toCombo } from '../keys/combo';
import { deskActionsFor } from '../keys/deskKeymap';
import { deskLayers, layerByRoot, resolveLayerHandler, topDeskLayer, type DeskFocusField, type DeskFocusTarget, type DeskLayer } from '../keys/layers';
import { deskJumpLabel, pickToward, type DeskBox, type DeskDir, type DeskJumpStop } from './jump';

export type { DeskFocusField, DeskFocusTarget, DeskBox, DeskDir, DeskJumpStop };
export type DeskFocusVia = 'enter' | 'tab';

const NAV_MOVE: Record<string, DeskDir> = {
  'desk-move-up': 'up',
  'desk-move-down': 'down',
  'desk-move-left': 'left',
  'desk-move-right': 'right',
};

const NAV_TAB = ['desk-tab-prev', 'desk-tab-next'];

function targetList(targets: DeskFocusTarget | undefined): string[] {
  if (targets === undefined) return [];
  return Array.isArray(targets) ? targets : [targets];
}

/**
 * Next target for Enter or Tab. Explicit targets are tried first, then later fields in order.
 * A field that cannot be focused is skipped. An id outside the list has no next field.
 */
export function resolveDeskEnter(
  orderedIds: readonly string[],
  currentId: string,
  targets: DeskFocusTarget | undefined,
  canFocus: (id: string) => boolean,
): string | null {
  const index = orderedIds.indexOf(currentId);
  if (index < 0) return null;
  for (const id of targetList(targets)) {
    if (id !== 'next' && canFocus(id)) return id;
  }
  for (const id of orderedIds.slice(index + 1)) {
    if (canFocus(id)) return id;
  }
  return null;
}

/** Previous focusable field for Shift+Tab. */
export function resolveDeskPrev(
  orderedIds: readonly string[],
  currentId: string,
  canFocus: (id: string) => boolean,
): string | null {
  const index = orderedIds.indexOf(currentId);
  if (index <= 0) return null;
  for (let at = index - 1; at >= 0; at -= 1) {
    const id = orderedIds[at];
    if (id && canFocus(id)) return id;
  }
  return null;
}

/**
 * Which field opens with focus.
 * False focuses nothing. A field id wins when that field can be focused.
 * Otherwise a field marked initial, otherwise the first focusable field.
 */
export function pickInitialFieldId(
  orderedIds: readonly string[],
  preference: string | false | undefined,
  markedId: string | null,
  canFocus: (id: string) => boolean,
): string | null {
  if (preference === false) return null;
  if (typeof preference === 'string' && canFocus(preference)) return preference;
  if (markedId && canFocus(markedId)) return markedId;
  return orderedIds.find((id) => canFocus(id)) ?? null;
}

function shown(node: HTMLElement): boolean {
  return node.getClientRects().length > 0;
}

/** Field nodes that belong to this layer, not to a dialog layer nested inside it. */
function ownNodes(layer: DeskLayer): HTMLElement[] {
  const root = layer.root;
  if (!root) return [];
  return [...root.querySelectorAll<HTMLElement>('[data-desk-field]')].filter(
    (node) => node.parentElement?.closest('[data-desk-layer]') === root,
  );
}

function nodeIn(layer: DeskLayer, id: string): HTMLElement | null {
  return ownNodes(layer).find((node) => node.getAttribute('data-desk-field') === id) ?? null;
}

/** Field ids of a layer in page order. */
function layerIds(layer: DeskLayer): string[] {
  return ownNodes(layer)
    .map((node) => node.getAttribute('data-desk-field') ?? '')
    .filter((id) => id !== '');
}

function layerOf(id: string): DeskLayer | null {
  const layers = deskLayers();
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    const layer = layers[index];
    if (layer && nodeIn(layer, id)) return layer;
  }
  return null;
}

/**
 * A read-only or disabled control is on the form to be seen. Enter and Tab do not stop on it,
 * unless it opens a dialog (`data-desk-opens`).
 */
function editable(node: HTMLElement): boolean {
  const control = controlOf(node);
  if (control.matches(':disabled') || control.getAttribute('aria-disabled') === 'true') return false;
  if ((control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) && control.readOnly) {
    return control.hasAttribute('data-desk-opens');
  }
  return true;
}

function canFocusIn(layer: DeskLayer, id: string): boolean {
  const field = layer.fields.get(id);
  if (field?.visible && !field.visible()) return false;
  const node = nodeIn(layer, id);
  return Boolean(node && shown(node) && editable(node));
}

/** The element that stands for a field: the node itself when it takes focus, else its first shown control. */
function controlOf(node: HTMLElement): HTMLElement {
  if (node.matches('input, textarea, select, button, [tabindex]')) return node;
  const inner = node.querySelector<HTMLElement>('input, textarea, select, button');
  return inner && shown(inner) ? inner : node;
}

/** Select a text value so typing replaces it. File and check inputs have no text selection. */
export function selectDeskControl(node: EventTarget | null): void {
  if (node instanceof HTMLTextAreaElement) {
    node.select();
    return;
  }
  if (!(node instanceof HTMLInputElement)) return;
  const kind = node.type;
  if (kind === 'checkbox' || kind === 'radio' || kind === 'file' || kind === 'button' || kind === 'color') return;
  node.select();
}

function focusNode(node: HTMLElement): boolean {
  const target = controlOf(node);
  target.focus();
  selectDeskControl(document.activeElement);
  return document.activeElement === target || node.contains(document.activeElement);
}

function focusIn(layer: DeskLayer, id: string): boolean {
  if (!canFocusIn(layer, id)) return false;
  const field = layer.fields.get(id);
  if (field?.focus) return field.focus();
  const node = nodeIn(layer, id);
  return node ? focusNode(node) : false;
}

/** Enter on a checkbox moves to the next field. Space still toggles the box. Modified Enter is left for jump. */
export function onDeskCheckboxKey(event: KeyboardEvent): void {
  if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || event.defaultPrevented) return;
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox') return;
  const id = target.getAttribute('data-desk-field');
  if (!id) return;
  event.preventDefault();
  focusNextDeskField(id);
}

/** Focus a field in the topmost layer that owns it. */
export function focusDeskField(id: string): boolean {
  const layer = layerOf(id);
  return layer ? focusIn(layer, id) : false;
}

/** Focus the layer Save control (`data-form-save-btn`) after the last settings cell. */
export function focusFormSaveForField(fromFieldId: string): boolean {
  const layer = layerOf(fromFieldId);
  if (!layer?.root) return false;
  const btn = layer.root.querySelector<HTMLElement>('[data-form-save-btn]:not(:disabled)');
  if (!btn || !shown(btn)) return false;
  return focusNode(btn);
}

/**
 * Enter or Tab from a field. Tab follows `onTab`, else the Enter path.
 * At the end of a dialog, Enter accepts it and Tab wraps to its first field.
 */
export function focusNextDeskField(id: string, via: DeskFocusVia = 'enter'): boolean {
  const layer = layerOf(id);
  if (!layer) return false;
  const ids = layerIds(layer);
  const field = layer.fields.get(id);
  const can = (target: string): boolean => canFocusIn(layer, target);
  const targets = via === 'tab' ? (field?.onTab ?? field?.onEnter) : field?.onEnter;
  const next = resolveDeskEnter(ids, id, targets, can);
  if (next) return focusIn(layer, next);
  if (!layer.modal) return false;
  if (via === 'enter') {
    layer.onAccept?.();
    return true;
  }
  const first = ids.find(can);
  return first ? focusIn(layer, first) : false;
}

/** Shift+Tab. Wraps to the last field inside a dialog. */
export function focusPrevDeskField(id: string): boolean {
  const layer = layerOf(id);
  if (!layer) return false;
  const ids = layerIds(layer);
  const can = (target: string): boolean => canFocusIn(layer, target);
  const prev = resolveDeskPrev(ids, id, can) ?? (layer.modal ? [...ids].reverse().find(can) ?? null : null);
  return prev ? focusIn(layer, prev) : false;
}

function skipsAutoFocus(layer: DeskLayer, id: string): boolean {
  if (layer.fields.get(id)?.noAutoFocus) return true;
  return nodeIn(layer, id)?.hasAttribute('data-desk-noauto') ?? false;
}

function markedInitial(layer: DeskLayer, ids: string[]): string | null {
  return ids.find((id) => layer.fields.get(id)?.initial || nodeIn(layer, id)?.hasAttribute('data-desk-initial')) ?? null;
}

/** True when `node` comes after `after` in the document. Without `after`, every node does. */
function follows(node: Node, after: Node | undefined): boolean {
  return !after || Boolean(after.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING);
}

/**
 * First focusable field or grid inside `container`. A grid's own focus hook lands on its first cell.
 * With `after`, only fields after that node count, such as the grid below a tab bar.
 */
export function focusFirstDeskFieldIn(layer: DeskLayer, container: ParentNode, after?: Node): boolean {
  const ids = ownNodes(layer)
    .filter((node) => container.contains(node) && follows(node, after))
    .map((node) => node.getAttribute('data-desk-field') ?? '')
    .filter((id) => id !== '' && !skipsAutoFocus(layer, id) && canFocusIn(layer, id));
  const id = markedInitial(layer, ids) ?? ids[0] ?? null;
  return id ? focusIn(layer, id) : false;
}

/**
 * Focus the pane's first field once it exists. One observer, no timer.
 * The returned function disconnects it.
 */
export function focusFirstWhenReady(layer: DeskLayer, container: HTMLElement, after?: Node): () => void {
  let observer: MutationObserver | null = null;
  let stopped = false;
  const started = document.activeElement;
  const stop = (): void => {
    stopped = true;
    observer?.disconnect();
    observer = null;
  };
  const ready = (): boolean => {
    if (stopped || !container.isConnected) return true;
    if (topDeskLayer() !== layer) return true;
    const active = document.activeElement;
    if (active instanceof HTMLElement && container.contains(active) && follows(active, after) && active.closest('[data-desk-field]')) return true;
    if (active !== started && active instanceof HTMLElement && !active.closest('.desk-tabs')) {
      const away = active.closest('[data-desk-field]');
      if (away && !container.contains(away)) return true;
    }
    if (focusFirstDeskFieldIn(layer, container, after)) return true;
    return false;
  };
  void nextTick(() => {
    if (stopped || ready()) {
      stop();
      return;
    }
    observer = new MutationObserver(() => {
      if (ready()) stop();
    });
    observer.observe(container, { childList: true, subtree: true });
  });
  return stop;
}

function boxOf(rect: DOMRect): DeskBox | null {
  if (rect.width === 0 && rect.height === 0) return null;
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
}

function fieldBox(layer: DeskLayer, id: string): DeskBox | null {
  const node = nodeIn(layer, id);
  if (!node) return null;
  return boxOf(controlOf(node).getBoundingClientRect());
}

function labelText(node: HTMLElement): string {
  const wrapping = node.closest('label');
  const own = wrapping ? textOf(wrapping) : '';
  if (own) return own;
  const id = node.id || node.getAttribute('data-desk-field') || '';
  if (!id) return '';
  const root = node.closest('[data-desk-layer]');
  const labeled = root?.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(id)}"]`);
  return labeled ? textOf(labeled) : '';
}

function textOf(label: HTMLElement): string {
  for (const child of label.childNodes) {
    if (child.nodeType !== Node.TEXT_NODE) continue;
    const text = child.textContent?.trim() ?? '';
    if (text) return text;
  }
  return '';
}

function layerSections(layer: DeskLayer): HTMLElement[] {
  const root = layer.root;
  if (!root) return [];
  return [...root.querySelectorAll<HTMLElement>('[data-desk-section]')].filter(
    (node) => node.closest('[data-desk-layer]') === root,
  );
}

function sectionFields(layer: DeskLayer, section: HTMLElement): string[] {
  return ownNodes(layer)
    .filter((node) => node.closest('[data-desk-section]') === section)
    .map((node) => node.getAttribute('data-desk-field') ?? '')
    .filter((id) => id !== '' && canFocusIn(layer, id));
}

/** The section's entry field, or its first field that can take focus. */
function sectionEntry(layer: DeskLayer, section: HTMLElement): string | null {
  const marked = [...section.querySelectorAll<HTMLElement>('[data-desk-entry]')].find(
    (node) => node.closest('[data-desk-section]') === section && node.closest('[data-desk-layer]') === layer.root,
  );
  const markedId =
    marked?.getAttribute('data-desk-field') ??
    marked?.querySelector<HTMLElement>('[data-desk-field]')?.getAttribute('data-desk-field') ??
    '';
  if (markedId && canFocusIn(layer, markedId)) return markedId;
  return sectionFields(layer, section)[0] ?? null;
}

function stopLabel(node: HTMLElement | null, section: HTMLElement | null, id: string): string {
  const fromField = node ? labelText(node) : '';
  if (fromField) return fromField;
  const sectionId = section?.getAttribute('data-desk-section') ?? id;
  return deskJumpLabel(sectionId);
}

function stopFor(layer: DeskLayer, id: string): DeskJumpStop | null {
  const custom = layer.fields.get(id)?.jumpTo?.();
  if (custom) return custom;
  if (!canFocusIn(layer, id)) return null;
  const rect = fieldBox(layer, id);
  if (!rect) return null;
  const node = nodeIn(layer, id);
  const section = node?.closest('[data-desk-section]');
  return {
    rect,
    label: stopLabel(node, section instanceof HTMLElement ? section : null, id),
    go: () => focusIn(layer, id),
  };
}

/** The field that currently has focus, when it belongs to the top layer. */
function focusedField(): { layer: DeskLayer; id: string } | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return null;
  const node = active.closest('[data-desk-field]');
  if (!(node instanceof HTMLElement)) return null;
  const id = node.getAttribute('data-desk-field') ?? '';
  if (!id) return null;
  const layer = layerOf(id);
  if (!layer || layer !== topDeskLayer() || !nodeIn(layer, id)) return null;
  return { layer, id };
}

/**
 * Where Ctrl+Enter will land from the focused field.
 * A field hook wins, then `onJump`, then the next section's entry.
 */
export function resolveDeskJump(): DeskJumpStop | null {
  const current = focusedField();
  if (!current) return null;
  const { layer, id } = current;
  const field = layer.fields.get(id);
  const hooked = field?.jumpFrom?.();
  if (hooked) return hooked;
  if (field?.onJump) {
    const can = (target: string): boolean => canFocusIn(layer, target);
    const chosen = resolveDeskEnter(layerIds(layer), id, field.onJump, can);
    if (chosen) {
      const stop = stopFor(layer, chosen);
      if (stop) return stop;
    }
  }
  const sections = layerSections(layer);
  const host = nodeIn(layer, id);
  const section = host?.closest('[data-desk-section]');
  const index = section instanceof HTMLElement ? sections.indexOf(section) : -1;
  for (let at = index + 1; at < sections.length; at += 1) {
    const next = sections[at];
    if (!next) continue;
    const entry = sectionEntry(layer, next);
    if (!entry) continue;
    const stop = stopFor(layer, entry);
    if (stop) return stop;
  }
  return null;
}

/**
 * Move to the nearest field in a direction, using on-screen positions.
 * A field with `focusNear` (a grid) chooses the cell. Otherwise the field itself is focused.
 */
export function focusDeskToward(dir: DeskDir, fromId?: string, fromBox?: DeskBox): boolean {
  const layer = fromId ? layerOf(fromId) : (focusedField()?.layer ?? null);
  if (!layer || layer !== topDeskLayer()) return false;
  const originId = fromId ?? focusedField()?.id ?? '';
  const origin = fromBox ?? (originId ? fieldBox(layer, originId) : null);
  if (!origin) return false;
  const candidates = ownNodes(layer).flatMap((node) => {
    const id = node.getAttribute('data-desk-field') ?? '';
    if (!id || id === originId || !canFocusIn(layer, id)) return [];
    const box = fieldBox(layer, id);
    return box ? [{ id, box }] : [];
  });
  const id = pickToward(origin, candidates, dir);
  if (!id) return false;
  const field = layer.fields.get(id);
  if (field?.focusNear?.(origin, dir)) return true;
  return focusIn(layer, id);
}

function navActions(event: KeyboardEvent): readonly string[] {
  const combo = toCombo(keyInputOf(event));
  return combo ? deskActionsFor(combo) : [];
}

/** True for the four Ctrl+Arrow field-move action ids. */
export function isDeskMoveAction(id: string): boolean {
  return id in NAV_MOVE;
}

/**
 * True when Ctrl+Arrow is not a field move for a key pressed on this target: the top layer
 * turned it off, or the target sits inside a `data-desk-no-move` element.
 */
export function isDeskMoveOff(target: EventTarget | null): boolean {
  if (topDeskLayer()?.disableSpatialMove) return true;
  return target instanceof Element && target.closest('[data-desk-no-move]') !== null;
}

/** A tab key only counts while some page or dialog has a handler for it. Otherwise the key stays native. */
function tabHandled(id: string): boolean {
  return NAV_TAB.includes(id) && resolveLayerHandler(deskLayers(), [id]) !== null;
}

/** True when this key changes tabs on the current page. Widgets and grids let it bubble. */
export function isDeskTabKey(event: KeyboardEvent): boolean {
  if (!event.ctrlKey && !event.metaKey) return false;
  return navActions(event).some(tabHandled);
}

/**
 * True when this key is the section jump, a Ctrl+Arrow field move, or a tab change.
 * Widgets let it bubble.
 */
export function isDeskNavKey(event: KeyboardEvent): boolean {
  if (!event.ctrlKey && !event.metaKey) return false;
  const off = isDeskMoveOff(event.target);
  return navActions(event).some((id) => id === 'desk-jump' || (id in NAV_MOVE && !off) || tabHandled(id));
}

const claimedKeys = new WeakSet<Event>();

/**
 * A field widget handles this key. Parent widgets such as the grid skip it, but it still
 * bubbles, so app shortcuts (Ctrl+S, F2, nav keys) keep working from inside the widget.
 * Field widgets never call `stopPropagation`.
 */
export function claimDeskKey(event: KeyboardEvent): void {
  claimedKeys.add(event);
}

/** True when a widget below already claimed this key with `claimDeskKey`. */
export function isClaimedDeskKey(event: KeyboardEvent): boolean {
  return claimedKeys.has(event);
}

/** Direction of a Ctrl+Arrow field move, or null when this key is not one or moves are off here. */
export function deskMoveDir(event: KeyboardEvent): DeskDir | null {
  if (isDeskMoveOff(event.target)) return null;
  for (const id of navActions(event)) {
    const dir = NAV_MOVE[id];
    if (dir) return dir;
  }
  return null;
}

/** True when this key is the section jump. */
export function isDeskJumpKey(event: KeyboardEvent): boolean {
  return navActions(event).includes('desk-jump');
}

/** Initial-focus pass for a page or dialog that just opened. Fields and grids take part alike. */
export function focusLayerInitial(layer: DeskLayer | null = topDeskLayer()): boolean {
  if (!layer || layer.disableInitialFocus) return false;
  const candidates = layerIds(layer).filter((id) => !skipsAutoFocus(layer, id));
  const can = (id: string): boolean => canFocusIn(layer, id);
  const id = pickInitialFieldId(candidates, layer.initialFocus, markedInitial(layer, candidates), can);
  return id ? focusIn(layer, id) : false;
}

/** Remember the field that has focus, so a bare Enter after a stray click can return to it. */
export function rememberDeskFocus(target: EventTarget | null): void {
  if (!(target instanceof Element)) return;
  const field = target.closest('[data-desk-field]');
  const id = field?.getAttribute('data-desk-field');
  if (!id) return;
  const root = field?.closest('[data-desk-layer]');
  const layer = root ? layerByRoot(root) : null;
  if (layer) layer.lastFieldId = id;
}

/** Put focus back on the layer's last field, else on the first field that can take it. */
export function focusLayerRecover(layer: DeskLayer): boolean {
  const last = layer.lastFieldId;
  if (last && canFocusIn(layer, last) && focusIn(layer, last)) return true;
  const candidates = layerIds(layer).filter((id) => !skipsAutoFocus(layer, id));
  const can = (id: string): boolean => canFocusIn(layer, id);
  const id = pickInitialFieldId(candidates, layer.initialFocus, markedInitial(layer, candidates), can);
  return id ? focusIn(layer, id) : false;
}

function nothingFocused(): boolean {
  const active = document.activeElement;
  if (!active || active === document.body || active === document.documentElement) return true;
  if (!(active instanceof HTMLElement)) return true;
  // A click on blank page space focuses the layout shell, which is not a field or a control.
  if (active.closest('[data-desk-field]')) return false;
  return !active.matches('input, textarea, select, button, a, [contenteditable="true"]');
}

function desktopPointer(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

/**
 * A bare Escape or Enter while nothing has focus (after a click on blank space).
 * Escape closes the top dialog. Enter returns focus to the top layer's last or first field.
 * Returns true when the key was taken.
 */
export function recoverDeskKey(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.isComposing || event.repeat) return false;
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return false;
  if (event.key !== 'Escape' && event.key !== 'Enter') return false;
  if (!nothingFocused()) return false;
  const layer = topDeskLayer();
  if (!layer?.root) return false;
  if (event.key === 'Escape') {
    if (!layer.modal || !layer.onEscape) return false;
    event.preventDefault();
    layer.onEscape();
    return true;
  }
  if (!layer.refocusOnEnter || !desktopPointer()) return false;
  if (!focusLayerRecover(layer)) return false;
  event.preventDefault();
  return true;
}
