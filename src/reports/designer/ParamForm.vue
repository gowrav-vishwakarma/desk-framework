<template>
  <div v-if="param" class="sf">
    <div class="sf-field" :class="{ bad: problemAt('label') }">
      <label class="sf-label">Label</label>
      <input
        type="text"
        class="sf-input"
        :value="param.label"
        placeholder="Date from, Party, Minimum amount…"
        :data-desk-field="`studio-params.${index}.label`"
        @input="setLabel(($event.target as HTMLInputElement).value)"
      />
      <p v-if="problemAt('label')" class="sf-problem">
        <StudioIcon name="warn" /> {{ problemAt('label') }}
      </p>
    </div>

    <div class="sf-field">
      <label class="sf-label">Kind</label>
      <span class="cond-seg sf-seg in-kinds" role="radiogroup" aria-label="Kind of input">
        <button
          v-for="kind in PARAM_TYPES"
          :key="kind.value"
          type="button"
          role="radio"
          :aria-checked="param.type === kind.value"
          :class="{ on: param.type === kind.value }"
          :title="kind.help"
          @click="setType(kind.value)"
        >
          <StudioIcon :name="kind.icon" /> {{ kind.label }}
        </button>
      </span>
    </div>

    <template v-if="param.type === 'lookup'">
      <div class="sf-field" :class="{ bad: problemAt('lookup.preset') }">
        <label class="sf-label">Lookup</label>
        <PickButton
          :model-value="param.lookup?.preset ?? ''"
          :items="presetItems"
          show-sub
          :popup-width="360"
          placeholder="Plain list"
          search-placeholder="Search: party, item, salesman"
          @update:model-value="setPreset"
        />
        <p v-if="problemAt('lookup.preset')" class="sf-problem">
          <StudioIcon name="warn" /> {{ problemAt('lookup.preset') }}
        </p>
        <p v-if="chosenPreset" class="sf-hint">
          The same {{ chosenPreset.title.toLowerCase() }} lookup as the rest of the app: its
          columns, search choices, last picks and starred rows. It lists
          <code>{{ chosenPreset.model }}</code> records.
        </p>
        <p v-else-if="suggested.length" class="sf-hint">
          {{ param.lookup?.model }} has a ready lookup:
          <button
            v-for="preset in suggested"
            :key="preset.id"
            type="button"
            class="sf-link"
            @click="setPreset(preset.id)"
          >
            {{ preset.title }}
          </button>
        </p>
      </div>
      <div v-if="!chosenPreset" class="sf-field" :class="{ bad: problemAt('lookup.model') }">
        <label class="sf-label">Pick from</label>
        <PickButton
          :model-value="param.lookup?.model ?? ''"
          :items="modelItems(draft.models.value)"
          placeholder="Parties, products, branches…"
          search-placeholder="Search: party, product, branch"
          @update:model-value="setLookupModel"
        />
        <p v-if="problemAt('lookup.model')" class="sf-problem">
          <StudioIcon name="warn" /> {{ problemAt('lookup.model') }}
        </p>
      </div>
      <div v-if="param.lookup?.model && !chosenPreset" class="sf-field" :class="{ bad: problemAt('lookup.label') }">
        <label class="sf-label">The user sees</label>
        <PathButton
          :model-value="param.lookup.label"
          :model="param.lookup.model"
          :catalog="draft.catalog.value"
          @update:model-value="(label) => edit((p) => (p.lookup = { ...p.lookup!, label }))"
        />
        <p v-if="problemAt('lookup.label')" class="sf-problem">
          <StudioIcon name="warn" /> {{ problemAt('lookup.label') }}
        </p>
        <p class="sf-hint">
          The report gets the ids of what is picked: compare it with an id column, such as
          <code>partyId in @{{ param.id || 'parties' }}</code
          >.
        </p>
      </div>
    </template>

    <div v-if="param.type === 'select'" class="sf-field" :class="{ bad: problemAt('options') }">
      <label class="sf-label">Choices</label>
      <div class="in-options">
        <div v-for="(option, at) in param.options ?? []" :key="at" class="in-option">
          <input
            type="text"
            class="sf-input"
            :value="option.label"
            placeholder="Shown as"
            @input="setOption(at, { label: ($event.target as HTMLInputElement).value })"
          />
          <input
            type="text"
            class="sf-input in-option-value"
            :value="String(option.value)"
            placeholder="Value"
            title="What the report compares with"
            @input="setOption(at, { value: ($event.target as HTMLInputElement).value })"
          />
          <button
            type="button"
            class="studio-icon-btn danger"
            title="Remove"
            @click="removeOption(at)"
          >
            <StudioIcon name="close" />
          </button>
        </div>
        <button type="button" class="studio-chip-btn" @click="addOption">
          <StudioIcon name="plus" /> Add a choice
        </button>
      </div>
      <p v-if="problemAt('options')" class="sf-problem">
        <StudioIcon name="warn" /> {{ problemAt('options') }}
      </p>
    </div>

    <div class="sf-field">
      <label class="sf-label">Starts as <span class="sf-optional">optional</span></label>
      <select
        v-if="param.type === 'date'"
        class="sf-input"
        :value="dateDefaultKind"
        @change="setDateDefault(($event.target as HTMLSelectElement).value)"
      >
        <option value="">Empty</option>
        <option v-for="word in DATE_WORDS" :key="word.value" :value="word.value">
          {{ word.label }}
        </option>
        <option value="fixed">A fixed date…</option>
      </select>
      <input
        v-if="param.type === 'date' && dateDefaultKind === 'fixed'"
        type="date"
        class="sf-input"
        :value="String(param.default ?? '')"
        @input="setDefault(($event.target as HTMLInputElement).value || undefined)"
      />
      <select
        v-else-if="param.type === 'boolean'"
        class="sf-input"
        :value="param.default === undefined ? '' : String(param.default)"
        @change="setBoolDefault(($event.target as HTMLSelectElement).value)"
      >
        <option value="">Not set</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
      <select
        v-else-if="param.type === 'select'"
        class="sf-input"
        :value="String(param.default ?? '')"
        @change="setDefault(($event.target as HTMLSelectElement).value || undefined)"
      >
        <option value="">Nothing chosen</option>
        <option
          v-for="option in param.options ?? []"
          :key="String(option.value)"
          :value="String(option.value)"
        >
          {{ option.label }}
        </option>
      </select>
      <input
        v-else-if="param.type === 'number'"
        type="number"
        class="sf-input sf-number"
        :value="param.default ?? ''"
        @input="setNumberDefault(($event.target as HTMLInputElement).value)"
      />
      <input
        v-else-if="param.type === 'text'"
        type="text"
        class="sf-input"
        :value="String(param.default ?? '')"
        @input="setDefault(($event.target as HTMLInputElement).value || undefined)"
      />
      <span v-else class="desk-muted">Nothing picked: the report reads every record.</span>
    </div>

    <div class="sf-field in-switches">
      <label class="sf-switch"
        ><input
          type="checkbox"
          :checked="param.required === true"
          @change="edit((p) => toggle(p, 'required', ($event.target as HTMLInputElement).checked))"
        />
        <span>Must be filled in</span></label
      >
      <label v-if="param.type === 'lookup' || param.type === 'select'" class="sf-switch">
        <input
          type="checkbox"
          :checked="param.multi === true"
          @change="edit((p) => toggle(p, 'multi', ($event.target as HTMLInputElement).checked))"
        />
        <span>Several can be picked</span>
      </label>
      <label
        v-if="param.type === 'lookup' && param.lookup?.model === 'Branch'"
        class="sf-switch"
        title="Only the branches picked are read; it never adds branches the user may not see"
      >
        <input
          type="checkbox"
          :checked="param.branchScope === true"
          @change="
            edit((p) => toggle(p, 'branchScope', ($event.target as HTMLInputElement).checked))
          "
        />
        <span>Limits the branches read</span>
      </label>
    </div>

    <p v-if="uses.length" class="in-uses desk-muted">
      <StudioIcon name="ok" /> Used in {{ uses.join(', ') }}
    </p>
    <p v-else-if="param.id" class="in-uses warn">
      <StudioIcon name="warn" /> No step uses <code>@{{ param.id }}</code> yet: add it to a
      condition, or it filters nothing.
    </p>

    <button type="button" class="sf-more" :aria-expanded="moreOpen" @click="moreOpen = !moreOpen">
      <StudioIcon :name="moreOpen ? 'open' : 'right'" /> More options
    </button>
    <div v-if="moreOpen" class="sf-advanced">
      <div class="sf-field" :class="{ bad: problemAt('id') }">
        <label class="sf-label">Name in formulas</label>
        <span class="in-idbox"
          >@<input
            type="text"
            class="sf-input sf-name"
            :value="param.id"
            spellcheck="false"
            @change="rename(($event.target as HTMLInputElement).value)"
        /></span>
        <p class="sf-hint">Renaming changes every formula that uses it.</p>
        <p v-if="problemAt('id')" class="sf-problem">
          <StudioIcon name="warn" /> {{ problemAt('id') }}
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Rdl2Param, Rdl2ParamType } from '../language';
import type { Issue } from './checks';
import { DATE_WORDS, PARAM_TYPES } from './inputs';
import { camelName, cleanName } from './naming';
import PathButton from './PathButton.vue';
import PickButton from './PickButton.vue';
import { modelItems, type PickItem } from './pickItems';
import { lookupPreset, lookupPresets, presetsFor } from '../lookupPresets';
import StudioIcon from './StudioIcon.vue';
import { useReportDraftContext } from './useReportDraft';

/** One input of the report. Edits that input in the draft by its place in the list. */
const props = defineProps<{ index: number; issues: readonly Issue[] }>();

const draft = useReportDraftContext();
const param = computed(() => draft.report.params[props.index] ?? null);
const uses = computed(() => (param.value?.id ? draft.paramUses(param.value.id) : []));
const moreOpen = ref(false);

const dateDefaultKind = computed(() => {
  const value = param.value?.default;
  if (value === undefined || value === '') return '';
  return typeof value === 'string' && DATE_WORDS.some((word) => word.value === value) ? value : 'fixed';
});

function problemAt(path: string): string {
  return (
    props.issues.find((issue) => issue.path === `params.${props.index}.${path}`)?.message ?? ''
  );
}

function edit(change: (target: Rdl2Param) => void): void {
  if (param.value) change(param.value);
}

function toggle(target: Rdl2Param, key: 'required' | 'multi' | 'branchScope', on: boolean): void {
  if (on) target[key] = true;
  else delete target[key];
}

/** A free input name from a label: "Minimum amount" → `minimumAmount`. */
function freeId(label: string): string {
  const base = camelName(label) || 'input';
  const taken = new Set(
    draft.report.params.filter((item) => item !== param.value).map((item) => item.id),
  );
  let id = base;
  for (let n = 2; taken.has(id); n += 1) id = `${base}${n}`;
  return id;
}

function rename(raw: string): void {
  const next = cleanName(raw);
  const current = param.value?.id ?? '';
  if (!next || next === current || draft.report.params.some((item) => item.id === next)) return;
  if (current) draft.renameParam(current, next);
  else edit((p) => (p.id = next));
}

/** The name follows the label until the user names it: `@from` for "From". */
function setLabel(label: string): void {
  const target = param.value;
  if (!target) return;
  const followed = !target.id || target.id === freeId(target.label);
  target.label = label;
  if (followed && label.trim()) rename(freeId(label));
}

function setType(type: Rdl2ParamType): void {
  edit((p) => {
    if (p.type === type) return;
    p.type = type;
    delete p.default;
    if (type !== 'lookup') {
      delete p.lookup;
      delete p.branchScope;
    }
    if (type !== 'lookup' && type !== 'select') delete p.multi;
    if (type !== 'select') delete p.options;
    if (type === 'date') p.default = 'fyStart';
  });
}

/** The app's own lookups first, then a plain list that takes the model and field below. */
const presetItems = computed((): PickItem[] => [
  { value: '', label: 'Plain list', sub: 'Choose the model and the field to show', icon: 'source', tone: 'get' },
  ...lookupPresets().map((preset) => ({ value: preset.id, label: preset.title, ...(preset.hint ? { sub: preset.hint } : {}), icon: 'source' as const, tone: 'get' })),
]);
const chosenPreset = computed(() => lookupPreset(param.value?.lookup?.preset));
/** Ready lookups over the model a plain list already chose. */
const suggested = computed(() => (param.value?.lookup?.model ? presetsFor(param.value.lookup.model) : []));

/** A preset sets the model and field it lists, so the definition still reads without it. */
function setPreset(id: string): void {
  const preset = lookupPreset(id);
  edit((p) => {
    if (!preset) {
      if (p.lookup) delete p.lookup.preset;
      return;
    }
    p.lookup = { model: preset.model, label: preset.label, preset: preset.id };
    if (preset.model !== 'Branch') delete p.branchScope;
  });
}

/** Picking a model also picks what the user sees: its name field when it has one. */
function setLookupModel(model: string): void {
  const fields = draft.catalog.value.get(model)?.fields ?? [];
  const label =
    fields.find((field) => field.name === 'name')?.name ??
    fields.find((field) => field.type === 'text')?.name ??
    'id';
  edit((p) => {
    p.lookup = { model, label };
    if (model !== 'Branch') delete p.branchScope;
  });
}

function setDefault(value: unknown): void {
  edit((p) => {
    if (value === undefined) delete p.default;
    else p.default = value;
  });
}

function setDateDefault(kind: string): void {
  setDefault(
    kind === '' ? undefined : kind === 'fixed' ? new Date().toISOString().slice(0, 10) : kind,
  );
}

function setBoolDefault(raw: string): void {
  setDefault(raw === '' ? undefined : raw === 'true');
}

function setNumberDefault(raw: string): void {
  setDefault(raw === '' ? undefined : Number(raw));
}

function setOption(at: number, change: Partial<{ value: string; label: string }>): void {
  edit((p) => {
    const options = [...(p.options ?? [])];
    const current = options[at];
    if (!current) return;
    // The value follows the label until it is typed: "Cash only" → `cashOnly`.
    const followed =
      change.label !== undefined && String(current.value) === camelName(current.label);
    options[at] = {
      ...current,
      ...change,
      ...(followed ? { value: camelName(change.label!) } : {}),
    };
    p.options = options;
  });
}

function addOption(): void {
  edit((p) => (p.options = [...(p.options ?? []), { value: '', label: '' }]));
}

function removeOption(at: number): void {
  edit((p) => {
    const options = (p.options ?? []).filter((_option, index) => index !== at);
    if (options.length) p.options = options;
    else delete p.options;
  });
}
</script>
