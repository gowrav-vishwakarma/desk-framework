<template>
  <nav class="flow" aria-label="Report steps">
    <button data-desk-field="flow-rail-inputs"
      type="button"
      class="flow-card is-fixed"
      :class="{ on: selected === AT_INPUTS }"
      @click="select(AT_INPUTS)"
    >
      <span class="flow-badge tone-inputs"><StudioIcon name="inputs" /></span>
      <span class="flow-text">
        <strong>Inputs</strong>
        <span class="flow-sentence">{{ inputsLine }}</span>
      </span>
      <span
        v-if="problems(AT_INPUTS) + problems(AT_REPORT)"
        class="flow-bad"
        :title="`${problems(AT_INPUTS) + problems(AT_REPORT)} to fix`"
        ><StudioIcon name="warn" /> {{ problems(AT_INPUTS) + problems(AT_REPORT) }}</span
      >
    </button>

    <template v-for="(stage, index) in report.stages" :key="stage.id">
      <div class="flow-link">
        <button
          type="button"
          class="flow-insert"
          :title="
            index === 0
              ? 'Add a step at the start'
              : `Add a step after ${report.stages[index - 1]!.id}`
          "
          @click="openGallery(index - 1, $event)"
        >
          <StudioIcon name="plus" />
        </button>
      </div>
      <div
        class="flow-card"
        :class="{ on: selected === stage.id, bad: problems(stage.id) > 0 }"
        role="button"
        tabindex="0"
        @click="select(stage.id)"
        @keydown.enter.self.prevent="select(stage.id)"
      >
        <span class="flow-badge" :class="`tone-${stepTone(stage)}`"
          ><StudioIcon :name="stepInfo(stage.kind)?.icon ?? 'native'"
        /></span>
        <span class="flow-text">
          <span class="flow-title">
            <strong>{{ index + 1 }}. {{ stepInfo(stage.kind)?.label ?? 'System step' }}</strong>
            <code class="flow-id">{{ stage.id }}</code>
          </span>
          <span class="flow-sentence">{{ describeStep(stage, draft.catalog.value) }}</span>
          <span v-if="readsOther(stage, index)" class="flow-reads"
            ><StudioIcon name="link" /> reads {{ readsOther(stage, index) }}</span
          >
          <span class="flow-tags">
            <span v-if="report.output.stage === stage.id" class="flow-tag shown"
              ><StudioIcon name="output" /> shown</span
            >
            <span
              v-if="counts[stage.id] !== undefined"
              class="flow-tag"
              title="Rows in the last preview"
              >{{ counts[stage.id] }} rows</span
            >
          </span>
        </span>
        <span v-if="problems(stage.id)" class="flow-bad" :title="`${problems(stage.id)} to fix`"
          ><StudioIcon name="warn" /> {{ problems(stage.id) }}</span
        >
        <span class="flow-tools" @click.stop>
          <button
            type="button"
            class="studio-icon-btn"
            title="Preview this step's rows"
            @click="emit('preview', stage.id)"
          >
            <StudioIcon name="play" />
          </button>
          <button
            type="button"
            class="studio-icon-btn"
            title="Move up"
            :disabled="index === 0"
            @click="draft.moveStep(stage.id, -1)"
          >
            <StudioIcon name="up" />
          </button>
          <button
            type="button"
            class="studio-icon-btn"
            title="Move down"
            :disabled="index === report.stages.length - 1"
            @click="draft.moveStep(stage.id, 1)"
          >
            <StudioIcon name="down" />
          </button>
          <button
            type="button"
            class="studio-icon-btn"
            title="Duplicate"
            @click="draft.duplicateStep(stage.id)"
          >
            <StudioIcon name="copy" />
          </button>
          <button
            type="button"
            class="studio-icon-btn danger"
            title="Remove"
            @click="remove(stage.id)"
          >
            <StudioIcon name="close" />
          </button>
        </span>
      </div>
    </template>

    <div class="flow-link" />
    <button
      type="button"
      class="flow-add"
      data-desk-field="studio-add-step"
      @click="openGallery(report.stages.length - 1, $event)"
    >
      <StudioIcon name="plus" />
      {{ report.stages.length ? 'Add a step' : 'Start: read some records' }}
    </button>
    <div class="flow-link" />

    <button data-desk-field="flow-rail-output"
      type="button"
      class="flow-card is-fixed"
      :class="{ on: selected === AT_OUTPUT, bad: problems(AT_OUTPUT) > 0 }"
      @click="select(AT_OUTPUT)"
    >
      <span class="flow-badge tone-output"><StudioIcon name="output" /></span>
      <span class="flow-text">
        <strong>Output</strong>
        <span class="flow-sentence">{{ outputLine }}</span>
      </span>
      <span v-if="problems(AT_OUTPUT)" class="flow-bad" :title="`${problems(AT_OUTPUT)} to fix`"
        ><StudioIcon name="warn" /> {{ problems(AT_OUTPUT) }}</span
      >
    </button>

    <StudioPopup v-model:open="galleryOpen" :anchor="galleryAnchor" :width="460">
      <StepGallery :needs-input="insertAt === 0" @pick="addAt" />
    </StudioPopup>
  </nav>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { askDeskConfirm } from '../../form/confirm';
import type { Rdl2Stage } from '../language';
import { AT_INPUTS, AT_OUTPUT, AT_REPORT } from './checks';
import { stepTone } from './pickItems';
import { stageInputs } from './schema';
import StepGallery from './StepGallery.vue';
import { describeStep, stepInfo, type StepKind } from './steps';
import StudioIcon from './StudioIcon.vue';
import StudioPopup from './StudioPopup.vue';
import { useReportDraftContext } from './useReportDraft';

/** The report as a pipeline: inputs, then each step, then what is shown. A card opens its editor. */
defineProps<{ counts: Readonly<Record<string, number>> }>();
const emit = defineEmits<{ preview: [id: string] }>();

const draft = useReportDraftContext();
const report = draft.report;
const selected = draft.selected;

const galleryOpen = ref(false);
const galleryAnchor = ref<HTMLElement | null>(null);
/** Where the new step goes. */
const insertAt = ref(0);

const inputsLine = computed(() => {
  const labels = report.params.map((param) => param.label || param.id).filter(Boolean);
  return labels.length ? labels.join(', ') : 'None: the report has no filters';
});

const outputLine = computed(() => {
  const output = report.output;
  if (!output.stage) return 'Choose the step to show';
  const parts = [
    `${output.stage}`,
    `${output.columns.length} column${output.columns.length === 1 ? '' : 's'}`,
  ];
  if (output.totals?.length) parts.push('totals');
  if (output.groups?.length)
    parts.push(`grouped by ${output.groups.map((group) => group.column).join(', ')}`);
  return parts.join(' · ');
});

function problems(at: string): number {
  return draft.issues.value.filter((issue) => issue.at === at).length;
}

function select(at: string): void {
  selected.value = at;
}

/** Inputs other than the step just above, which a reader cannot see from the order alone. */
function readsOther(stage: Rdl2Stage, index: number): string {
  const above = report.stages[index - 1]?.id;
  const inputs = stageInputs(stage).filter((id) => id && id !== above);
  return inputs.join(', ');
}

function openGallery(after: number, event: MouseEvent): void {
  insertAt.value = after + 1;
  galleryAnchor.value = event.currentTarget as HTMLElement;
  galleryOpen.value = true;
}

function addAt(kind: StepKind): void {
  galleryOpen.value = false;
  draft.addStep(kind, insertAt.value);
}

async function remove(id: string): Promise<void> {
  const readers = draft.readers(id).map((stage) => stage.id);
  if (readers.length) {
    const ok = await askDeskConfirm({
      title: `Remove ${id}?`,
      message: `${readers.join(', ')} read${readers.length === 1 ? 's' : ''} this step. ${readers.length === 1 ? 'It' : 'They'} will read what ${id} read instead. Undo brings it back.`,
      okLabel: 'Remove',
      tone: 'danger',
    });
    if (!ok) return;
  }
  draft.removeStep(id);
}
</script>
