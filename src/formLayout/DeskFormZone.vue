<template>
  <div ref="root" class="desk-form-zone" :class="`is-${labelStyle}`" :data-desk-section="section">
    <div v-for="block in openSections" :key="block.id" class="desk-zone-grid" :data-zone-section="block.id">
      <div v-for="slot in block.fields" :key="slot.id" class="desk-zone-slot" :class="{ 'is-row-start': slot.row, 'is-gap': isGapId(slot.id) }" :style="slotGridVars(slot, labelStyle)">
        <slot v-if="!isGapId(slot.id)" name="field" :id="slot.id" :label-style="styleOf(slot.id)" />
      </div>
    </div>
    <div v-if="strips.length > 0" class="desk-zone-strips">
      <template v-for="strip in strips" :key="strip.id">
        <DeskSectionStrip
          :section-id="strip.id"
          :title="strip.title"
          :summary="strip.summary"
          :full="strip.full"
          :problem="strip.problem"
          :open="openId === strip.id"
          @open="togglePanel(strip.id)"
        />
        <div
          v-if="panel && panel.id === strip.id"
          class="desk-zone-panel"
          :data-zone-panel="panel.id"
          @focusout="onPanelBlur"
          @keydown.esc="onEscape"
        >
          <div v-for="slot in panel.fields" :key="slot.id" class="desk-zone-slot" :class="{ 'is-row-start': slot.row, 'is-gap': isGapId(slot.id) }" :style="slotGridVars(slot, labelStyle)">
            <slot v-if="!isGapId(slot.id)" name="field" :id="slot.id" :label-style="styleOf(slot.id)" />
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, nextTick, ref, watch } from 'vue';
import { focusDeskField } from '../focus/useDeskFocus';
import { DESK_FORM_ISSUES } from '../form/issues';
import DeskSectionStrip from './DeskSectionStrip.vue';
import { labelStyleFor } from './labels';
import { sectionSummary } from './summary';
import { isGapId, slotGridVars, type DeskFieldLabelStyle, type DeskLabelStyle, type DeskLayoutSection } from './types';
import { useZoneKeys } from './useZoneKeys';

const props = defineProps<{
  /** Jump target. The whole zone is one section, so Ctrl+Enter leaves it for the next one. */
  section: string;
  sections: readonly DeskLayoutSection[];
  labelStyle: DeskLabelStyle;
  inset: readonly string[];
  visible: (id: string) => boolean;
  label: (id: string) => string;
  value: (id: string) => string;
  required: (id: string) => boolean;
  kind: (id: string) => string | undefined;
}>();

const root = ref<HTMLElement | null>(null);
const openId = ref<string | null>(null);
const form = inject(DESK_FORM_ISSUES, null);

const shown = computed(() =>
  props.sections
    .map((section) => ({ ...section, fields: section.fields.filter((slot) => isGapId(slot.id) || props.visible(slot.id)) }))
    // A section of blank boxes alone draws nothing.
    .filter((section) => section.fields.some((slot) => !isGapId(slot.id))),
);
const openSections = computed(() => shown.value.filter((section) => section.open));
const closed = computed(() => shown.value.filter((section) => !section.open));

const strips = computed(() =>
  closed.value.map((section) => {
    const summary = sectionSummary(
      section.fields.filter((slot) => !isGapId(slot.id)).map((slot) => ({
        label: props.label(slot.id),
        value: props.value(slot.id),
        problem: form?.issueFor(slot.id) != null || (props.required(slot.id) && props.value(slot.id).trim() === ''),
      })),
    );
    return { id: section.id, title: section.title, summary: summary.text, full: summary.text || section.title, problem: summary.problem };
  }),
);

const panel = computed(() => closed.value.find((section) => section.id === openId.value) ?? null);

watch(closed, (sections) => {
  if (openId.value && !sections.some((section) => section.id === openId.value)) openId.value = null;
});

function styleOf(id: string): DeskFieldLabelStyle {
  return labelStyleFor({ labelStyle: props.labelStyle, inset: [...props.inset] }, { id, kind: props.kind(id) });
}

function fieldsOf(sectionId: string): string[] {
  return shown.value.find((section) => section.id === sectionId)?.fields.filter((slot) => !isGapId(slot.id)).map((slot) => slot.id) ?? [];
}

function showPanel(sectionId: string): void {
  const fields = fieldsOf(sectionId);
  if (fields.length === 0) return;
  openId.value = sectionId;
  void nextTick(() => {
    for (const id of fields) {
      if (focusDeskField(id)) return;
    }
  });
}

function togglePanel(sectionId: string): void {
  if (openId.value === sectionId) {
    openId.value = null;
    return;
  }
  showPanel(sectionId);
}

function onPanelBlur(event: FocusEvent): void {
  const panelNode = event.currentTarget;
  if (!(panelNode instanceof HTMLElement)) return;
  const next = event.relatedTarget;
  if (next instanceof Node && panelNode.contains(next)) return;
  // A dialog opened from a panel field (Ship to) gives focus back to that field, so the panel stays.
  if (next instanceof Element) {
    const dialog = next.closest('.desk-dialog');
    if (dialog && dialog !== panelNode.closest('.desk-dialog')) return;
  }
  openId.value = null;
}

function onEscape(event: KeyboardEvent): void {
  if (event.defaultPrevented) return;
  const sectionId = openId.value;
  if (!sectionId) return;
  event.preventDefault();
  event.stopPropagation();
  openId.value = null;
  void nextTick(() => focusDeskField(`section:${sectionId}`));
}

/** Open the section that holds this field and focus it. Returns false when this zone does not have it. */
function reveal(fieldId: string): boolean {
  const section = shown.value.find((item) => item.fields.some((slot) => slot.id === fieldId));
  if (!section) return false;
  if (!section.open) openId.value = section.id;
  void nextTick(() => focusDeskField(fieldId));
  return true;
}

/**
 * Focus the next field shown after this one in its section, as on screen. False when it is the last one
 * there, so the caller can go on with the normal Enter order.
 */
function focusAfter(fieldId: string): boolean {
  const own = root.value?.querySelector<HTMLElement>(`[data-desk-field="${fieldId}"]`);
  const section = own?.closest<HTMLElement>('[data-zone-panel], [data-zone-section]');
  if (!own || !section) return false;
  const nodes = [...section.querySelectorAll<HTMLElement>('[data-desk-field]')];
  for (const node of nodes.slice(nodes.indexOf(own) + 1)) {
    const id = node.getAttribute('data-desk-field');
    if (id && focusDeskField(id)) return true;
  }
  return false;
}

useZoneKeys({
  root,
  strips: () => strips.value,
  openId,
  lastField: (sectionId) => fieldsOf(sectionId).at(-1),
  openPanel: showPanel,
});

defineExpose({ reveal, focusAfter });
</script>
