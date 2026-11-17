<template>
  <DeskDialog v-model:open="open" name="form-layout" page panel-class="is-wide desk-form-designer-panel" :initial-focus="initialFocus" @close="emit('cancel')" @accept="emit('save')">
    <div class="desk-designer-frame desk-form-studio">
      <header class="desk-form-studio-bar">
        <h3>Form layout</h3>
        <div v-if="tabItems.length > 0" class="desk-form-studio-tabs">
          <DeskTabs v-model="designerTab" label="Layout sections" :tabs="tabItems" :in-url="false" />
        </div>
        <span class="desk-form-studio-spacer" />
        <DesignerSelect v-if="presetChoices.length > 1" label="Preset" field-id="layout-preset" value="" :choices="presetChoices" @change="onPreset" />
        <button type="button" title="Throw away your layout and use the shipped one" @click="emit('reset')">Reset to default</button>
        <button type="button" data-desk-field="layout-designer-cancel" @click="cancel">Cancel</button>
        <button type="button" class="is-primary" data-desk-field="layout-save" @click="emit('save')">Save</button>
      </header>
      <p v-if="notice" class="desk-designer-note">{{ notice }}</p>

      <!-- Header and footer: hidden fields | form mock | settings. A form without zones has options only. -->
      <div v-if="onHeaderTab" class="desk-form-studio-body">
        <aside class="desk-form-studio-hidden" @dragover.prevent @drop.prevent="onHideDrop">
          <h4>Not shown <span class="hint">({{ layout.hidden.length }})</span></h4>
          <input v-if="layout.hidden.length > 6" v-model="hiddenSearch" type="search" placeholder="Search hidden fields" aria-label="Search hidden fields" />
          <div class="desk-form-studio-hidden-list">
            <div v-for="id in hiddenShown" :key="id" class="desk-form-studio-hidden-row">
              <DesignerChip
                :id="id"
                :label="info(id)?.label ?? id"
                :hint="info(id)?.hint"
                hidden
                :selected="selectedId === id"
                @restore="restore(id)"
                @drop="hide($event)"
                @focus="selectedId = id"
                @click="selectedId = id"
              />
              <button type="button" class="desk-form-studio-add" :title="`Show ${info(id)?.label ?? id} on the form`" @click="restore(id)">+</button>
            </div>
            <p v-if="layout.hidden.length === 0" class="hint">Every field is on the form.</p>
            <p v-else-if="hiddenShown.length === 0" class="hint">No hidden field matches.</p>
          </div>
          <p class="desk-form-studio-drop hint">Drag a field here to hide it.</p>
        </aside>

        <div class="desk-form-studio-canvas" :class="`is-${layout.labelStyle}`" @focusin="onCanvasFocus" @click="onCanvasFocus">
          <template v-for="(zone, zoneIndex) in zones" :key="zone.id">
            <div v-if="zoneIndex > 0" class="desk-form-studio-items" aria-hidden="true">Item rows</div>
            <section class="desk-form-studio-zone">
              <header>
                <h4>{{ zone.title }}</h4>
                <button type="button" @click="apply(addSection(layout, zone.id, 'Section'))">+ Section</button>
              </header>
              <DesignerSection
                v-for="(section, index) in layout.zones[zone.id] ?? []"
                :key="section.id"
                :section="section"
                :index="index"
                :count="(layout.zones[zone.id] ?? []).length"
                :label-style="layout.labelStyle"
                :inset="layout.inset"
                :info="info"
                :selected-id="selectedId"
                @rename="apply(renameSection(layout, zone.id, section.id, $event))"
                @toggle-open="apply(setOpen(layout, zone.id, section.id, $event))"
                @move="apply(moveSection(layout, zone.id, section.id, $event))"
                @remove="apply(removeSection(layout, zone.id, section.id, lockedIds))"
                @move-chip="moveChip(zone.id, $event)"
                @hide="hide($event)"
                @toggle-inset="apply(toggleInset(layout, $event), `chip:${$event}`)"
                @place="drop(zone.id, section.id, $event)"
                @width="apply(setFieldCols(layout, $event.id, $event.cols), `chip:${$event.id}`)"
                @add-gap="addBlank(zone.id, section.id)"
              />
              <p v-if="(layout.zones[zone.id] ?? []).length === 0" class="hint">No sections. Add one to put fields here.</p>
            </section>
          </template>
        </div>

        <aside class="desk-form-studio-settings">
          <section class="desk-form-studio-card">
            <h4>Form</h4>
            <DesignerSelect label="Labels" field-id="layout-style" :value="layout.labelStyle" :choices="LABEL_CHOICES" @change="onStyle" />
            <DesignerSelect
              v-for="option in visibleOptions"
              :key="option.id"
              :label="option.label"
              :field-id="`layout-option-${option.id}`"
              :value="layout.options?.[option.id] ?? option.default"
              :choices="option.choices"
              @change="onOption(option, $event)"
            />
          </section>

          <section v-if="selected" class="desk-form-studio-card desk-form-studio-field">
            <div class="desk-form-studio-field-head">
              <h4>{{ selected.label }}</h4>
              <span v-if="selected.locked" class="desk-form-studio-badge" title="This field cannot be hidden">Always shown</span>
              <span v-else-if="selected.hidden" class="desk-form-studio-badge is-muted">Hidden</span>
            </div>
            <p v-if="selected.gap" class="hint">Leaves an empty gap on the form. Give it a width, or start a new row to push the fields after it down.</p>
            <p v-if="selected.hint" class="hint">{{ selected.hint }}</p>
            <p class="desk-form-studio-where">{{ selected.where }}</p>
            <button v-if="selected.hidden" type="button" class="is-primary" @click="restore(selected.id)">Show on the form</button>
            <template v-else>
              <div class="desk-form-studio-buttons">
                <button type="button" title="Move earlier (Alt+↑)" @click="moveChip(selected.zone, { id: selected.id, dir: -1 })">↑ Earlier</button>
                <button type="button" title="Move later (Alt+↓)" @click="moveChip(selected.zone, { id: selected.id, dir: 1 })">↓ Later</button>
              </div>
              <div class="desk-form-studio-width">
                <div class="desk-form-studio-width-head">
                  <span>Width</span>
                  <span class="hint">{{ selected.custom ? '' : 'default · ' }}{{ selected.cols }} of 12 columns</span>
                </div>
                <div class="desk-form-studio-stepper">
                  <button type="button" title="Narrower (Alt+←)" :disabled="selected.cols <= 1" @click="setWidth(selected.cols - 1)">−</button>
                  <div class="desk-form-studio-ruler" role="radiogroup" aria-label="Width in twelfths">
                    <button
                      v-for="n in 12"
                      :key="n"
                      type="button"
                      role="radio"
                      :aria-checked="n === selected.cols"
                      :class="{ on: n <= selected.cols }"
                      :title="`${n} of 12`"
                      @click="setWidth(n)"
                    />
                  </div>
                  <button type="button" title="Wider (Alt+→)" :disabled="selected.cols >= 12" @click="setWidth(selected.cols + 1)">+</button>
                </div>
                <div class="desk-form-studio-presets">
                  <button v-for="preset in WIDTH_PRESETS" :key="preset.cols" type="button" :class="{ on: selected.cols === preset.cols }" @click="setWidth(preset.cols)">{{ preset.label }}</button>
                  <button type="button" :disabled="!selected.custom" title="Use the label style's width" @click="setWidth(null)">Auto</button>
                </div>
                <label class="desk-form-studio-check">
                  <input type="checkbox" :checked="selected.row" @change="apply(setFieldRowStart(layout, selected.id, ($event.target as HTMLInputElement).checked))" />
                  <span>Start a new row</span>
                </label>
              </div>
              <label v-if="layout.labelStyle === 'placeholder'" class="desk-form-studio-check">
                <input type="checkbox" :checked="layout.inset.includes(selected.id)" @change="apply(toggleInset(layout, selected.id))" />
                <span>Label inside the input <kbd>L</kbd></span>
              </label>
              <button v-if="!selected.locked" type="button" class="is-danger" @click="hide(selected.id)">{{ selected.gap ? 'Delete this blank space' : 'Hide from the form' }}</button>
            </template>
          </section>
          <p v-else class="hint desk-form-studio-nothing">Click a field to move, hide, or change its label.</p>

          <section class="desk-form-studio-card desk-form-studio-keys">
            <h4>Keys</h4>
            <p><kbd>Alt</kbd>+<kbd>↑</kbd>/<kbd>↓</kbd> move a field · <kbd>Alt</kbd>+<kbd>←</kbd>/<kbd>→</kbd> narrower / wider · <kbd>Delete</kbd> hides it · <kbd>Enter</kbd> on a hidden field shows it<template v-if="layout.labelStyle === 'placeholder'"> · <kbd>L</kbd> label inside</template>. Drag works too.</p>
          </section>
        </aside>
      </div>

      <!-- Other tabs: option cards -->
      <div v-else class="desk-form-studio-options">
        <p v-if="visibleOptions.length === 0" class="hint">Nothing to set on this tab.</p>
        <div class="desk-form-studio-option-grid">
          <section v-for="option in visibleOptions" :key="option.id" class="desk-form-studio-card desk-form-studio-option" :class="{ 'is-changed': isChanged(option) }">
            <DesignerSelect
              :label="option.label"
              :field-id="`layout-option-${option.id}`"
              :value="layout.options?.[option.id] ?? option.default"
              :choices="option.choices"
              @change="onOption(option, $event)"
            />
            <p v-if="isChanged(option)" class="hint">
              Default: {{ option.choices.find((choice) => choice.value === option.default)?.label ?? option.default }}
              <button type="button" class="desk-form-studio-link" @click="onOption(option, option.default)">Use default</button>
            </p>
          </section>
        </div>
      </div>
    </div>
  </DeskDialog>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import DeskDialog from '../../form/DeskDialog.vue';
import DeskTabs from '../../form/DeskTabs.vue';
import { layoutOptionsOnTab } from '../options';
import { addGap, addSection, hideField, moveField, moveSection, removeSection, renameSection, restoreField, setFieldCols, setFieldRowStart, setLabelStyle, setLayoutOption, setOpen, toggleInset } from '../edit';
import { locateField } from '../resolve';
import { isGapId, slotCols, type DeskFormLayout, type DeskLayoutFieldInfo, type DeskLayoutOption, type DeskLayoutPreset } from '../types';
import DesignerChip from './DesignerChip.vue';
import DesignerSection from './DesignerSection.vue';
import DesignerSelect from './DesignerSelect.vue';

/** Common widths, as parts of the row. */
const WIDTH_PRESETS = [
  { cols: 3, label: '¼' },
  { cols: 4, label: '⅓' },
  { cols: 6, label: '½' },
  { cols: 8, label: '⅔' },
  { cols: 9, label: '¾' },
  { cols: 12, label: 'Full' },
];

const LABEL_CHOICES = [
  { value: 'side', label: 'Beside the input' },
  { value: 'top', label: 'Above the input' },
  { value: 'placeholder', label: 'Inside the input, as a placeholder' },
];

const open = defineModel<boolean>('open', { required: true });
const props = withDefaults(
  defineProps<{
    layout: DeskFormLayout;
    zones: readonly { id: string; title: string }[];
    fields: readonly DeskLayoutFieldInfo[];
    options?: readonly DeskLayoutOption[];
    /** When set, the first tab holds labels, untabbed options, and the zones. Later tabs list their options. */
    tabs?: readonly { id: string; label: string }[];
    /** Named bundles of option values for the tab that is open. */
    presets?: readonly DeskLayoutPreset[];
  }>(),
  { options: () => [], tabs: () => [], presets: () => [] },
);
const emit = defineEmits<{
  'update:layout': [DeskFormLayout];
  save: [];
  reset: [];
  cancel: [];
}>();

const notice = ref('');
const hiddenSearch = ref('');
/** Field shown in the side panel. Set when a chip takes focus or is clicked. */
const selectedId = ref<string | null>(null);
const designerTab = ref('');
const lockedIds = computed(() => props.fields.filter((field) => field.locked).map((field) => field.id));
const tabItems = computed(() => props.tabs.map((tab) => ({ id: tab.id, label: tab.label })));
const headerTabId = computed(() => props.tabs[0]?.id ?? 'header');
/** A form with no zones (a document whose fields are fixed) has only options: every tab shows them as cards. */
const onHeaderTab = computed(() => props.zones.length > 0 && (props.tabs.length === 0 || designerTab.value === headerTabId.value));
const visibleOptions = computed(() => {
  if (props.tabs.length === 0) return props.options;
  return layoutOptionsOnTab(props.options, designerTab.value || headerTabId.value, headerTabId.value);
});
const initialFocus = computed(() => (props.zones.length > 0 ? 'layout-style' : `layout-option-${visibleOptions.value[0]?.id ?? ''}`));
const presetChoices = computed(() => {
  const tab = designerTab.value || headerTabId.value;
  const presets = props.presets.filter((preset) => !preset.tab || preset.tab === tab);
  if (presets.length === 0) return [];
  return [{ value: '', label: 'Choose a preset' }, ...presets.map((preset) => ({ value: preset.id, label: preset.label }))];
});

watch(
  () => props.tabs,
  (tabs) => {
    if (!designerTab.value && tabs[0]) designerTab.value = tabs[0].id;
  },
  { immediate: true },
);
watch(open, (shown) => {
  if (shown && props.tabs[0]) designerTab.value = props.tabs[0].id;
});

const hiddenShown = computed(() => {
  const text = hiddenSearch.value.trim().toLowerCase();
  if (!text) return props.layout.hidden;
  return props.layout.hidden.filter((id) => (info(id)?.label ?? id).toLowerCase().includes(text) || id.toLowerCase().includes(text));
});

const selected = computed(() => {
  const id = selectedId.value;
  if (!id) return null;
  const field = info(id);
  const gap = isGapId(id);
  const label = gap ? 'Blank space' : (field?.label ?? id);
  const at = locateField(props.layout, id);
  if (!at) {
    if (!props.layout.hidden.includes(id)) return null;
    return { id, label, hint: field?.hint ?? '', locked: field?.locked === true, gap: false, hidden: true, zone: '', where: 'Not shown on the form.', cols: 0, custom: false, row: false };
  }
  const zone = props.zones.find((item) => item.id === at.zone)?.title ?? at.zone;
  const home = props.layout.zones[at.zone]?.find((item) => item.id === at.sectionId);
  const section = home?.title ?? '';
  const slot = home?.fields[at.index] ?? { id };
  return {
    id,
    label,
    hint: field?.hint ?? '',
    locked: field?.locked === true,
    gap,
    hidden: false,
    zone: at.zone,
    cols: slotCols(slot, props.layout.labelStyle),
    custom: slot.cols !== undefined,
    row: slot.row === true,
    where: `${zone} › ${section || 'Section'} › #${at.index + 1}`,
  };
});

/** A chip took focus or was clicked: show it in the side panel. */
function onCanvasFocus(event: Event): void {
  const chip = event.target instanceof Element ? event.target.closest('[data-desk-field^="chip:"]') : null;
  const raw = chip?.getAttribute('data-desk-field');
  if (!raw) return;
  selectedId.value = raw.slice('chip:'.length).replace(/:hidden$/, '');
}

/** Width of the selected field in twelfths. Null goes back to the label style's default. */
function setWidth(cols: number | null): void {
  const id = selectedId.value;
  if (!id) return;
  apply(setFieldCols(props.layout, id, cols));
}

function isChanged(option: DeskLayoutOption): boolean {
  const value = props.layout.options?.[option.id];
  return value !== undefined && value !== option.default;
}

function info(id: string): DeskLayoutFieldInfo | undefined {
  return props.fields.find((field) => field.id === id);
}

function apply(next: DeskFormLayout, focusId?: string): void {
  notice.value = '';
  emit('update:layout', next);
  if (!focusId) return;
  void nextTick(() => {
    const node = document.querySelector(`[data-desk-field="${CSS.escape(focusId)}"]`);
    if (node instanceof HTMLElement) node.focus();
  });
}

function onStyle(value: string): void {
  if (value !== 'side' && value !== 'top' && value !== 'placeholder') return;
  apply(setLabelStyle(props.layout, value));
}

function onPreset(id: string): void {
  const preset = props.presets.find((item) => item.id === id);
  if (!preset) return;
  let next = props.layout;
  for (const [key, value] of Object.entries(preset.options)) next = setLayoutOption(next, key, value);
  apply(next);
}

function onOption(option: DeskLayoutOption, value: string): void {
  if (!option.choices.some((choice) => choice.value === value)) return;
  apply(setLayoutOption(props.layout, option.id, value));
}

/** Add a blank box at the end of a section and select it. */
function addBlank(zone: string, sectionId: string): void {
  const result = addGap(props.layout, zone, sectionId);
  if (!result.id) return;
  apply(result.layout, `chip:${result.id}`);
  selectedId.value = result.id;
}

function hide(id: string): void {
  const field = info(id);
  if (field?.locked) {
    notice.value = `${field.label} stays on the form`;
    return;
  }
  apply(hideField(props.layout, id, false), `chip:${id}:hidden`);
}

function restore(id: string): void {
  const field = info(id);
  const zone = field?.zone && props.layout.zones[field.zone] ? field.zone : props.zones[0]?.id;
  if (!zone) return;
  const sections = props.layout.zones[zone] ?? [];
  const sectionId = sections.find((section) => section.id === field?.sectionId)?.id ?? sections[0]?.id;
  if (!sectionId) return;
  apply(restoreField(props.layout, id, { zone, sectionId }), `chip:${id}`);
}

function moveChip(zone: string, payload: { id: string; dir: -1 | 1 }): void {
  const { id, dir } = payload;
  const at = locateField(props.layout, id);
  if (!at || at.zone !== zone) return;
  const sections = props.layout.zones[zone] ?? [];
  const sectionIndex = sections.findIndex((section) => section.id === at.sectionId);
  const section = sections[sectionIndex];
  if (!section) return;
  const nextIndex = at.index + dir;
  if (nextIndex >= 0 && nextIndex < section.fields.length) {
    apply(moveField(props.layout, id, { zone, sectionId: section.id, index: nextIndex }), `chip:${id}`);
    return;
  }
  const neighbor = sections[sectionIndex + dir];
  if (neighbor) {
    const index = dir < 0 ? neighbor.fields.length : 0;
    apply(moveField(props.layout, id, { zone, sectionId: neighbor.id, index }), `chip:${id}`);
    return;
  }
  hide(id);
}

function drop(zone: string, sectionId: string, payload: { id: string; index: number }): void {
  const { id, index } = payload;
  const from = locateField(props.layout, id);
  let target = index;
  if (from && from.zone === zone && from.sectionId === sectionId && from.index < index) target -= 1;
  apply(moveField(props.layout, id, { zone, sectionId, index: target }), `chip:${id}`);
}

function onHideDrop(event: DragEvent): void {
  const id = event.dataTransfer?.getData('text/plain');
  if (id) hide(id);
}

function cancel(): void {
  open.value = false;
  emit('cancel');
}
</script>

<style scoped>
.hint {
  color: var(--desk-muted, dimgray);
  font-size: 0.8rem;
  margin: 4px 0;
}
</style>
