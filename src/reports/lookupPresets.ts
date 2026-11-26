import { reportsHost, type ReportsLookupPreset } from './host';

/** The app's lookups an input may name (`lookup.preset`), from the host. */
export function lookupPresets(): readonly ReportsLookupPreset[] {
  return reportsHost().lookupPresets ?? [];
}

export function lookupPreset(id: string | undefined): ReportsLookupPreset | undefined {
  return id ? lookupPresets().find((preset) => preset.id === id) : undefined;
}

/** Presets that list this model: the designer offers them for a plain list over it. */
export function presetsFor(model: string): ReportsLookupPreset[] {
  return lookupPresets().filter((preset) => preset.model === model);
}
