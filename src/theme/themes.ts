import { reactive, ref } from 'vue';

/** Theme ids are plain strings, so a host can add its own with `registerDeskTheme`. */
export type DeskThemeId = string;

export interface DeskTheme {
  id: DeskThemeId;
  label: string;
  /** Page, bar, and cursor, painted in the chooser while another theme is active. */
  swatches: readonly [string, string, string];
}

/**
 * The theme chooser's list. `classic` is Light, the :root default. A host appends to it with
 * `registerDeskTheme` and ships the CSS under `:root[data-desk-theme='<id>']`.
 */
const themes = reactive<DeskTheme[]>([
  { id: 'classic', label: 'Light', swatches: ['#ffffff', '#e9ecef', '#6c8f6c'] },
  { id: 'dark', label: 'Dark', swatches: ['#1e2226', '#2c3136', '#8fbc8f'] },
  { id: 'blue', label: 'Blue', swatches: ['#f7f9fc', '#e4ebf4', '#4a7eab'] },
  { id: 'green', label: 'Green', swatches: ['#f8f7f2', '#e6eee4', '#5d8a56'] },
  { id: 'sand', label: 'Sand', swatches: ['#fbf7f0', '#f0e6d6', '#b07a3c'] },
  { id: 'slate', label: 'Slate', swatches: ['#f4f6f8', '#e6eaee', '#5c6e80'] },
  { id: 'night', label: 'Night', swatches: ['#0e1624', '#152033', '#4c9aff'] },
  { id: 'frost', label: 'Frost', swatches: ['#f3f5f7', 'rgba(255, 255, 255, 0.72)', '#3d6b56'] },
]);

export const DESK_THEMES: readonly DeskTheme[] = themes;

const STORAGE_KEY = 'desk-theme';

/** The theme on screen. The chooser reads this. */
export const deskTheme = ref<DeskThemeId>('classic');

/** A saved id that no theme claims yet. A later `registerDeskTheme` can still honour it. */
let wanted: string | null = null;

function isThemeId(value: string): boolean {
  return themes.some((theme) => theme.id === value);
}

export function deskThemeId(value: string | null | undefined): DeskThemeId {
  if (value && isThemeId(value)) return value;
  return 'classic';
}

function paint(id: DeskThemeId): void {
  deskTheme.value = id;
  if (typeof document !== 'undefined') document.documentElement.dataset.deskTheme = id;
}

/** Add a theme to the chooser. If the user saved this id earlier, it is painted now. */
export function registerDeskTheme(theme: DeskTheme): void {
  const at = themes.findIndex((known) => known.id === theme.id);
  if (at >= 0) themes.splice(at, 1, theme);
  else themes.push(theme);
  if (wanted === theme.id) {
    wanted = null;
    paint(theme.id);
  }
}

/** Paint `id` now and keep it for the next load. An unknown id becomes Light. */
export function applyDeskTheme(id: string): DeskThemeId {
  const theme = deskThemeId(id);
  wanted = null;
  paint(theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // A private window still keeps the choice until reload.
  }
  return theme;
}

function paintStoredTheme(): void {
  let stored: string | null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    stored = null;
  }
  if (stored && isThemeId(stored)) {
    applyDeskTheme(stored);
    return;
  }
  // Light for now. The saved choice stays in storage until a host registers that theme.
  wanted = stored;
  paint('classic');
}

if (typeof document !== 'undefined') paintStoredTheme();
