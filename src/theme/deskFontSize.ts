import { ref } from 'vue';

export type DeskFontSizePresetId = 'xsmall' | 'small' | 'default' | 'large';

export interface DeskFontSizePreset {
  id: DeskFontSizePresetId;
  label: string;
  percent: number;
}

export const DESK_FONT_SIZE_PRESETS: readonly DeskFontSizePreset[] = [
  { id: 'xsmall', label: 'XSmall', percent: 80 },
  { id: 'small', label: 'Small', percent: 90 },
  { id: 'default', label: 'Default', percent: 100 },
  { id: 'large', label: 'Large', percent: 110 },
];

const MIN_PERCENT = 50;
const MAX_PERCENT = 150;
const STORAGE_KEY = 'desk-font-size';

/** Active UI scale as a percentage of the browser default (100 = unchanged). */
export const deskFontSizePercent = ref(100);

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 100;
  return Math.min(MAX_PERCENT, Math.max(MIN_PERCENT, Math.round(value)));
}

export function deskFontSizePresetId(percent: number): DeskFontSizePresetId | 'custom' {
  const match = DESK_FONT_SIZE_PRESETS.find((preset) => preset.percent === percent);
  return match?.id ?? 'custom';
}

export function deskFontSizeLabel(percent: number): string {
  const preset = DESK_FONT_SIZE_PRESETS.find((item) => item.percent === percent);
  if (preset) return preset.label;
  return `${percent}%`;
}

function paint(percent: number): void {
  const clamped = clampPercent(percent);
  deskFontSizePercent.value = clamped;
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const scale = clamped / 100;
  root.style.setProperty('--desk-ui-scale', String(scale));
  if (clamped === 100) root.style.fontSize = '';
  else root.style.fontSize = `${clamped}%`;
}

/** Paint `percent` now and keep it for the next load. */
export function applyDeskFontSize(percent: number): number {
  const clamped = clampPercent(percent);
  paint(clamped);
  try {
    localStorage.setItem(STORAGE_KEY, String(clamped));
  } catch {
    // A private window still keeps the choice until reload.
  }
  return clamped;
}

export function applyDeskFontSizePreset(id: DeskFontSizePresetId): number {
  const preset = DESK_FONT_SIZE_PRESETS.find((item) => item.id === id);
  if (!preset) return applyDeskFontSize(100);
  return applyDeskFontSize(preset.percent);
}

function paintStoredFontSize(): void {
  let stored: string | null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    stored = null;
  }
  const parsed = stored ? Number.parseInt(stored, 10) : 100;
  paint(Number.isFinite(parsed) ? parsed : 100);
}

if (typeof document !== 'undefined') paintStoredFontSize();
