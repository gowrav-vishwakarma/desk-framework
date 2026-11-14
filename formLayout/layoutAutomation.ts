import type { ComputedRef, Ref } from 'vue';
import type { DeskOpDef } from '../automation/types';
import { addGap, addSection, hideField, moveField, moveSection, removeSection, renameSection, restoreField, setFieldCols, setFieldRowStart, setLabelStyle, setLayoutOption, setOpen, toggleInset } from './edit';
import { layoutOptionsOnTab } from './options';
import { locateField } from './resolve';
import type { DeskFormLayout, DeskLayoutFieldInfo, DeskLayoutFieldRef, DeskLayoutOption, DeskLayoutPreset } from './types';

/** What the page tells the layout node about its designer, so an agent can read it without the dialog open. */
export interface DeskLayoutAutomation {
  /** Name in the automation tree. Defaults to the storage key. */
  name?: string;
  zones?: readonly { id: string; title: string }[];
  tabs?: readonly { id: string; label: string }[];
  presets?: readonly DeskLayoutPreset[];
  /** The designer's field catalog: label, kind and home section. Without it fields come from `fields()`. */
  catalog?: () => readonly DeskLayoutFieldInfo[];
}

export interface LayoutApi {
  key: () => string;
  layout: ComputedRef<DeskFormLayout>;
  draft: Ref<DeskFormLayout | null>;
  fields: () => readonly DeskLayoutFieldRef[];
  options: () => readonly DeskLayoutOption[];
  begin: () => void;
  replace: (next: DeskFormLayout) => void;
  cancel: () => void;
  save: () => Promise<void>;
  reset: () => void;
  invalidate: () => Promise<void>;
}

type Result = { ok: boolean; error?: string; reason?: string; [key: string]: unknown };

const isLayout = (value: DeskFormLayout | Result): value is DeskFormLayout => 'zones' in value && 'labelStyle' in value;

const fail = (error: string, reason?: string): Result => ({ ok: false, error, ...(reason ? { reason } : {}) });

export function layoutReadout(api: LayoutApi, extra: DeskLayoutAutomation): Record<string, unknown> {
  const layout = api.layout.value;
  const tabs = extra.tabs ?? [];
  const headerTab = tabs[0]?.id ?? 'header';
  const options = api.options();
  const byTab = (tab: string): Record<string, unknown>[] =>
    (tabs.length === 0 ? options : layoutOptionsOnTab(options, tab, headerTab)).map((option) => ({
      id: option.id,
      label: option.label,
      value: layout.options?.[option.id] ?? option.default,
      default: option.default,
      choices: option.choices.map((choice) => choice.value),
    }));
  const catalog = extra.catalog?.() ?? api.fields();
  return {
    key: api.key(),
    state: api.draft.value ? 'draft' : 'saved',
    labelStyle: layout.labelStyle,
    inset: layout.inset,
    hidden: layout.hidden,
    zones: Object.fromEntries(
      Object.entries(layout.zones).map(([zone, sections]) => [
        zone,
        sections.map((section) => ({ id: section.id, title: section.title, open: section.open === true, fields: section.fields.map((slot) => `${slot.id}${slot.cols ? ':' + slot.cols : ''}${slot.row ? '|row' : ''}`) })),
      ]),
    ),
    options: tabs.length === 0 ? { main: byTab(headerTab) } : Object.fromEntries(tabs.map((tab) => [tab.id, byTab(tab.id)])),
    presets: (extra.presets ?? []).map((preset) => ({ id: preset.id, label: preset.label, tab: preset.tab ?? null, options: preset.options })),
    fields: catalog.map((field) => ({ id: field.id, locked: field.locked === true, label: 'label' in field ? field.label : field.id })),
  };
}

export function layoutOps(api: LayoutApi, extra: DeskLayoutAutomation): Record<string, DeskOpDef> {
  const known = (id: string): boolean => api.fields().some((field) => field.id === id);
  const locked = (id: string): boolean => api.fields().some((field) => field.id === id && field.locked === true);
  const sectionExists = (layout: DeskFormLayout, zone: string, section: string): string | null => {
    if (!layout.zones[zone]) return `no zone ${zone} (zones: ${Object.keys(layout.zones).join(', ')})`;
    if (!layout.zones[zone]?.some((item) => item.id === section)) return `no section ${section} in ${zone} (sections: ${(layout.zones[zone] ?? []).map((item) => item.id).join(', ')})`;
    return null;
  };

  function edit(change: (layout: DeskFormLayout) => DeskFormLayout | Result): Result {
    api.begin();
    const next = change(api.layout.value);
    if (!isLayout(next)) return next;
    api.replace(next);
    return { ok: true, state: 'draft' };
  }

  function setOption(layout: DeskFormLayout, id: string, value: string): DeskFormLayout | Result {
    const option = api.options().find((item) => item.id === id);
    if (!option) return fail(`option ${id} is not offered here`, `offered: ${api.options().map((item) => item.id).join(', ') || 'none'}`);
    if (!option.choices.some((choice) => choice.value === value)) return fail(`${value} is not a choice of ${id}`, `choices: ${option.choices.map((choice) => choice.value).join(', ')}`);
    return setLayoutOption(layout, id, value);
  }

  function setPreset(layout: DeskFormLayout, id: string): DeskFormLayout | Result {
    const preset = (extra.presets ?? []).find((item) => item.id === id);
    if (!preset) return fail(`no preset ${id}`, `presets: ${(extra.presets ?? []).map((item) => item.id).join(', ')}`);
    let next = layout;
    for (const [key, value] of Object.entries(preset.options)) {
      const result = setOption(next, key, value);
      if (isLayout(result)) next = result;
      else return result;
    }
    return next;
  }

  const stringArg = { type: 'string' as const };
  return {
    move: {
      description: 'Move a field into a section at an index (draft)',
      args: { field: stringArg, zone: stringArg, section: stringArg, index: { type: 'number', optional: true } },
      run: (args) => edit((layout) => {
        const field = String(args.field);
        if (!known(field)) return fail(`unknown field ${field}`);
        const problem = sectionExists(layout, String(args.zone), String(args.section));
        if (problem) return fail(problem);
        return moveField(layout, field, { zone: String(args.zone), sectionId: String(args.section), index: Number(args.index ?? 9999) });
      }),
    },
    hide: {
      description: 'Hide a field (draft). A locked field stays.',
      args: { field: stringArg },
      run: (args) => edit((layout) => {
        const field = String(args.field);
        if (!known(field)) return fail(`unknown field ${field}`);
        if (locked(field)) return fail(`${field} is locked and stays on the form`);
        return hideField(layout, field, false);
      }),
    },
    restore: {
      description: 'Put a hidden field back at the end of its home section (draft)',
      args: { field: stringArg, zone: { type: 'string', optional: true }, section: { type: 'string', optional: true } },
      run: (args) => edit((layout) => {
        const field = String(args.field);
        if (!known(field)) return fail(`unknown field ${field}`);
        const home = api.fields().find((item) => item.id === field);
        const zone = typeof args.zone === 'string' ? args.zone : (home?.zone ?? Object.keys(layout.zones)[0] ?? '');
        const sections = layout.zones[zone] ?? [];
        const section = typeof args.section === 'string' ? args.section : (sections.find((item) => item.id === home?.sectionId)?.id ?? sections[0]?.id ?? '');
        const problem = sectionExists(layout, zone, section);
        return problem ? fail(problem) : restoreField(layout, field, { zone, sectionId: section });
      }),
    },
    inset: {
      description: 'Toggle a label inside the input for a field (draft)',
      args: { field: stringArg },
      run: (args) => edit((layout) => (known(String(args.field)) ? toggleInset(layout, String(args.field)) : fail(`unknown field ${String(args.field)}`))),
    },
    fieldCols: {
      description: 'Set how many columns a field spans, or null for one (draft)',
      args: { field: stringArg, cols: { type: 'number', optional: true } },
      run: (args) => edit((layout) => (known(String(args.field)) ? setFieldCols(layout, String(args.field), args.cols === undefined || args.cols === null ? null : Number(args.cols)) : fail(`unknown field ${String(args.field)}`))),
    },
    fieldRowStart: {
      description: 'Start a new row at this field (draft)',
      args: { field: stringArg, row: { type: 'boolean' } },
      run: (args) => edit((layout) => (known(String(args.field)) ? setFieldRowStart(layout, String(args.field), args.row === true) : fail(`unknown field ${String(args.field)}`))),
    },
    addGap: {
      description: 'Add an empty gap slot in a section (draft)',
      args: { zone: stringArg, section: stringArg, index: { type: 'number', optional: true } },
      run: (args) => edit((layout) => {
        const problem = sectionExists(layout, String(args.zone), String(args.section));
        if (problem) return fail(problem);
        return addGap(layout, String(args.zone), String(args.section), args.index === undefined ? undefined : Number(args.index)).layout;
      }),
    },
    addSection: { description: 'Add a section to a zone (draft)', args: { zone: stringArg, title: stringArg }, run: (args) => edit((layout) => addSection(layout, String(args.zone), String(args.title))) },
    removeSection: {
      description: 'Remove a section; its fields go to Not shown (draft)',
      args: { zone: stringArg, section: stringArg },
      run: (args) => edit((layout) => {
        const problem = sectionExists(layout, String(args.zone), String(args.section));
        return problem ? fail(problem) : removeSection(layout, String(args.zone), String(args.section), api.fields().filter((field) => field.locked).map((field) => field.id));
      }),
    },
    moveSection: {
      description: 'Move a section up (-1) or down (1) (draft)',
      args: { zone: stringArg, section: stringArg, dir: { type: 'number' } },
      run: (args) => edit((layout) => {
        const problem = sectionExists(layout, String(args.zone), String(args.section));
        return problem ? fail(problem) : moveSection(layout, String(args.zone), String(args.section), Number(args.dir) < 0 ? -1 : 1);
      }),
    },
    renameSection: {
      description: 'Rename a section (draft)',
      args: { zone: stringArg, section: stringArg, title: stringArg },
      run: (args) => edit((layout) => {
        const problem = sectionExists(layout, String(args.zone), String(args.section));
        return problem ? fail(problem) : renameSection(layout, String(args.zone), String(args.section), String(args.title));
      }),
    },
    sectionOpen: {
      description: 'Keep a section always open, or fold it into the summary strip (draft)',
      args: { zone: stringArg, section: stringArg, open: { type: 'boolean' } },
      run: (args) => edit((layout) => {
        const problem = sectionExists(layout, String(args.zone), String(args.section));
        return problem ? fail(problem) : setOpen(layout, String(args.zone), String(args.section), args.open === true);
      }),
    },
    labelStyle: {
      description: 'Set how labels are drawn: side, top or placeholder (draft)',
      args: { value: { type: 'string', enum: ['side', 'top', 'placeholder'] } },
      run: (args) => edit((layout) => {
        const value = String(args.value);
        return value === 'side' || value === 'top' || value === 'placeholder' ? setLabelStyle(layout, value) : fail(`${value} is not a label style`, 'side, top, placeholder');
      }),
    },
    option: {
      description: 'Choose a value for a layout option (draft). Strict: the option and the choice must be offered.',
      args: { id: stringArg, value: stringArg },
      run: (args) => edit((layout) => setOption(layout, String(args.id), String(args.value))),
    },
    preset: { description: 'Apply a named preset of option values (draft)', args: { id: stringArg }, run: (args) => edit((layout) => setPreset(layout, String(args.id))) },
    apply: {
      description: 'Apply a bundle in one call: { options, preset, labelStyle, hidden: [], restore: [] }, then optionally save',
      args: { changes: { type: 'object' }, save: { type: 'boolean', optional: true } },
      run: async (args) => {
        const changes = (args.changes ?? {}) as { options?: Record<string, string>; preset?: string; labelStyle?: string; hidden?: string[]; restore?: string[] };
        const result = edit((layout) => {
          let next: DeskFormLayout | Result = layout;
          const step = (fn: (current: DeskFormLayout) => DeskFormLayout | Result): void => {
            if (isLayout(next)) next = fn(next);
          };
          if (changes.preset) step((current) => setPreset(current, changes.preset as string));
          for (const [id, value] of Object.entries(changes.options ?? {})) step((current) => setOption(current, id, value));
          if (changes.labelStyle) step((current) => (['side', 'top', 'placeholder'].includes(changes.labelStyle as string) ? setLabelStyle(current, changes.labelStyle as 'side') : fail(`${changes.labelStyle} is not a label style`)));
          for (const id of changes.hidden ?? []) step((current) => (!known(id) ? fail(`unknown field ${id}`) : locked(id) ? fail(`${id} is locked and stays on the form`) : hideField(current, id, false)));
          for (const id of changes.restore ?? []) {
            step((current) => {
              const at = locateField(current, id);
              if (at || !known(id)) return at ? current : fail(`unknown field ${id}`);
              const home = api.fields().find((item) => item.id === id);
              const zone = home?.zone ?? Object.keys(current.zones)[0] ?? '';
              const section = current.zones[zone]?.find((item) => item.id === home?.sectionId)?.id ?? current.zones[zone]?.[0]?.id ?? '';
              return restoreField(current, id, { zone, sectionId: section });
            });
          }
          return next;
        });
        if (!result.ok) {
          api.cancel();
          return result;
        }
        if (args.save === true) await api.save();
        return { ok: true, state: args.save === true ? 'saved' : 'draft' };
      },
    },
    save: { description: 'Save the draft', run: async () => { await api.save(); return { ok: true }; } },
    cancel: { description: 'Drop the draft', run: () => api.cancel() },
    reset: { description: 'Rebuild the draft from the page defaults', run: () => api.reset() },
    invalidate: { description: 'Drop the cached saved layout and read it again', run: () => api.invalidate() },
  };
}
