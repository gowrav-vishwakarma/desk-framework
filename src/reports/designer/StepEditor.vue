<template>
  <div class="step-editor">
    <header class="ed-head">
      <span class="flow-badge" :class="`tone-${stepTone(stage)}`"
        ><StudioIcon :name="info?.icon ?? 'native'"
      /></span>
      <div class="ed-title">
        <h2>{{ info?.label ?? 'System step' }}</h2>
        <p class="desk-muted">
          {{ info?.help ?? 'A step written in code for reports shipped with the system.' }}
        </p>
      </div>
      <label
        class="ed-name"
        :class="{ bad: nameProblem }"
        title="Other steps and the output refer to it by this name"
      >
        <span class="desk-muted">Step name</span>
        <input
          type="text"
          :value="stage.id"
          spellcheck="false"
          autocomplete="off"
          @change="rename($event.target as HTMLInputElement)"
          @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
        />
      </label>
    </header>
    <p v-if="nameProblem" class="sf-problem"><StudioIcon name="warn" /> {{ nameProblem }}</p>

    <p class="ed-links desk-muted">
      <template v-if="isResult"
        ><StudioIcon name="output" /> The report shows this step's rows.</template
      >
      <template v-if="readers.length"
        ><StudioIcon name="right" /> Read by {{ readers.join(', ') }}.</template
      >
      <template v-if="!isResult && !readers.length && draft.report.stages.length > 1"
        ><StudioIcon name="warn" /> Nothing reads this step yet.</template
      >
    </p>

    <SourceEditor v-if="stage.kind === 'source'" :stage-id="stage.id" :issues="issues" />
    <p v-else-if="stage.kind === 'native'" class="desk-muted">
      This step runs code shipped with the system; it cannot be changed here.
    </p>
    <StepForm
      v-else
      :key="stage.id"
      :fields="info?.fields ?? []"
      :target="stage as unknown as Record<string, unknown>"
      :columns="draft.columnsFor(stage)"
      :stages="draft.stepsBefore(stage.id)"
      :issues="issues"
      path=""
    />

    <p v-for="issue in looseIssues" :key="issue.message" class="sf-problem">
      <StudioIcon name="warn" /> {{ issue.message }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Rdl2Stage } from '../language';
import { stepTone } from './pickItems';
import SourceEditor from './SourceEditor.vue';
import StepForm from './StepForm.vue';
import { stepInfo } from './steps';
import StudioIcon from './StudioIcon.vue';
import { useReportDraftContext } from './useReportDraft';

/** The selected step: what it is, its name, what reads it, and its settings. */
const props = defineProps<{ stage: Rdl2Stage }>();

const draft = useReportDraftContext();
const info = computed(() => stepInfo(props.stage.kind));
const issues = computed(() => draft.issues.value.filter((issue) => issue.at === props.stage.id));
const readers = computed(() => draft.readers(props.stage.id).map((stage) => stage.id));
const isResult = computed(() => draft.report.output.stage === props.stage.id);
const renameProblem = ref('');
const nameProblem = computed(
  () => renameProblem.value || issues.value.find((issue) => issue.path === 'id')?.message || '',
);

/** Problems with no setting of their own to sit under. */
const looseIssues = computed(() => issues.value.filter((issue) => !issue.path));

function rename(input: HTMLInputElement): void {
  renameProblem.value = draft.renameStep(props.stage.id, input.value) ?? '';
  // Refused: show the name it still has.
  if (renameProblem.value) input.value = props.stage.id;
}

// Another step opened: an old refusal no longer applies.
watch(
  () => props.stage,
  () => (renameProblem.value = ''),
);
</script>
