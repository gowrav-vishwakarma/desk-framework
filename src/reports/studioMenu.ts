import { ref } from 'vue';
import type { DeskMenuNode } from '../menu/deskMenu';
import type { Rdl2Menu } from './language';
import { listPivots, listReports } from './studioApi';

/** What the menu lists: a report (shield when it ships with the system, person when the company saved it), or a saved pivot. */
interface MenuItem {
  name: string;
  title: string;
  menu: Rdl2Menu | undefined;
  pivot: boolean;
  /** A report ships with the system (`system`) or was saved for the company (`saved`). */
  origin?: 'system' | 'saved';
}

/** Reports and saved pivots the menu lists, per company. Loaded once; a save refreshes it. */
const items = ref<MenuItem[]>([]);
let loadedFor: number | null = null;
let loading: Promise<void> | null = null;

/** Load the report list for this company, once. */
export function loadStudioMenu(companyId: number | null | undefined, fresh = false): void {
  if (!companyId || (loadedFor === companyId && loading)) return;
  loadedFor = companyId;
  loading = Promise.all([listReports({ fresh }), listPivots()])
    .then(([reports, pivots]) => {
      if (loadedFor !== companyId) return;
      items.value = [
        ...reports.map((item) => ({ name: item.name, title: item.title, menu: item.definition.menu, pivot: false, origin: item.origin })),
        ...pivots.map((item) => ({ name: item.name, title: item.title, menu: item.definition.menu, pivot: true })),
      ];
    })
    .catch(() => {
      // No menu rather than a broken one; the studio list still works.
      if (loadedFor === companyId) items.value = [];
    });
}

/** Read the list again, such as after a report's menu setting changed. */
export function refreshStudioMenu(): void {
  const companyId = loadedFor;
  loading = null;
  loadedFor = null;
  loadStudioMenu(companyId, true);
}

const ROOT_LABEL = 'Studio Reports';
/** Access letters tried for the top menu, in order; the first not already taken wins (R: the old Reports menu's). */
const ROOT_LETTERS = ['r', 'o', 'u', 'w', 'y', 'z'];
/** Every flat-data report, from any parent folder, sits in this one submenu at the end. */
const FLAT_LABEL = 'Flat data';
/** Saved pivots sit in their own submenu after Flat data. */
const PIVOT_LABEL = 'Saved pivots';

interface Branch {
  label: string;
  order: number;
  groups: Map<string, Branch>;
  reports: { node: DeskMenuNode; order: number }[];
}

function branch(label: string): Branch {
  return { label, order: Number.POSITIVE_INFINITY, groups: new Map(), reports: [] };
}

function nodes(level: Branch): DeskMenuNode[] {
  const groups = [...level.groups.values()]
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
    .map((group): DeskMenuNode => ({ label: group.label, children: nodes(group) }));
  const reports = [...level.reports].sort((a, b) => a.order - b.order || a.node.label.localeCompare(b.node.label)).map((item) => item.node);
  // Groups first, then the reports at this level, as the classic menus read.
  return [...groups, ...reports];
}

function groupParts(group: string | undefined): string[] {
  return (group ?? '').split('/').map((part) => part.trim()).filter(Boolean);
}

/** Where a flat report sits among the others: the root Flat data list comes before MIS and the rest. */
function flatBand(parts: string[]): string {
  const at = parts.findIndex((part) => part.toLowerCase() === FLAT_LABEL.toLowerCase());
  return at <= 0 ? '' : parts.slice(0, at).join(' / ').toLowerCase();
}

function placeIn(root: Branch, parts: string[], node: DeskMenuNode, order: number): void {
  let level = root;
  for (const part of parts) {
    const key = part.toLowerCase();
    let next = level.groups.get(key);
    if (!next) {
      next = branch(part);
      level.groups.set(key, next);
    }
    // A group sorts by its first report's order.
    next.order = Math.min(next.order, order);
    level = next;
  }
  level.reports.push({ node, order });
}

/** A divider, then the section, when the section has rows and something already sits above it. */
function appendSection(children: DeskMenuNode[], label: string, section: DeskMenuNode[]): void {
  if (section.length === 0) return;
  if (children.length > 0) children.push({ label: '', separator: true });
  children.push({ label, children: section });
}

/** What goes in the menu besides the designer's reports. */
export interface StudioMenuOptions {
  /** Built-in report pages (made in code: Ledger, DayBook, …), listed first with their own mark. */
  builtIn?: readonly DeskMenuNode[];
  /** The designer's reports and pivots: false when the user may not open Report Studio. Default true. */
  studio?: boolean;
  /** A menu route for a report's viewer or pivot (relative to the app's base). Default `reports/studio/<page>/<name>`. */
  route?: (page: 'run' | 'pivot', name: string) => string;
}

/**
 * The "Studio Reports" menu, the desk's one reports menu: built-in reports first (code mark), a divider, then every
 * designer report whose `menu.show` is on, in its group's submenu (`Sales / Monthly` nests a level deeper), or at the
 * top when it has no group (shield: ships with the system; person: saved for the company). Flat data from every folder is
 * one submenu at the end, then saved pivots. Null when none.
 */
export function studioReportsMenu(takenLetters: ReadonlySet<string>, options: StudioMenuOptions = {}): DeskMenuNode | null {
  const root = branch(ROOT_LABEL);
  const flat: { node: DeskMenuNode; order: number; band: string }[] = [];
  const pivots: { node: DeskMenuNode; order: number }[] = [];
  const route = options.route ?? ((page: 'run' | 'pivot', name: string) => `reports/studio/${page}/${name}`);
  for (const item of options.studio === false ? [] : items.value) {
    const menu = item.menu;
    if (!menu?.show) continue;
    const order = typeof menu.order === 'number' ? menu.order : 1000;
    const node: DeskMenuNode = item.pivot
      ? { label: menu.label || item.title, route: route('pivot', item.name), icon: 'pivot', hint: 'A saved pivot' }
      : {
          label: menu.label || item.title,
          route: route('run', item.name),
          ...(item.origin === 'system'
            ? { icon: 'system' as const, hint: 'A system report' }
            : item.origin === 'saved'
              ? { icon: 'company' as const, hint: 'A company report' }
              : {}),
        };
    if (item.pivot) {
      pivots.push({ node, order });
      continue;
    }
    const parts = groupParts(menu.group);
    if (parts.some((part) => part.toLowerCase() === FLAT_LABEL.toLowerCase())) {
      flat.push({ node, order, band: flatBand(parts) });
      continue;
    }
    placeIn(root, parts, node, order);
  }
  const children: DeskMenuNode[] = [...(options.builtIn ?? [])];
  const designed = nodes(root);
  if (designed.length > 0 && children.length > 0) children.push({ label: '', separator: true });
  children.push(...designed);
  const flatNodes = [...flat]
    .sort((a, b) => a.band.localeCompare(b.band) || a.order - b.order || a.node.label.localeCompare(b.node.label))
    .map((item) => item.node);
  const pivotNodes = [...pivots]
    .sort((a, b) => a.order - b.order || a.node.label.localeCompare(b.node.label))
    .map((item) => item.node);
  appendSection(children, FLAT_LABEL, flatNodes);
  appendSection(children, PIVOT_LABEL, pivotNodes);
  if (children.length === 0) return null;
  const letter = ROOT_LETTERS.find((candidate) => !takenLetters.has(candidate));
  return { label: ROOT_LABEL, children, ...(letter ? { letter } : {}) };
}
