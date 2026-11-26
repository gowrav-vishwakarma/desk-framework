<template>
  <div v-if="stage" class="src">
    <div v-if="!model" class="src-choose">
      <h3 class="src-question">What do you want to read?</h3>
      <p class="desk-muted">
        Pick the kind of record. You choose its fields next, including fields of what it links to
        (party, product, branch).
      </p>
      <div class="src-models">
        <PickList
          :items="modelItems(draft.models.value)"
          placeholder="Search: invoice, party, stock…"
          empty="Loading what can be read…"
          @pick="setModel"
        />
      </div>
      <p v-if="problemAt('model')" class="sf-problem">
        <StudioIcon name="warn" /> {{ problemAt('model') }}
      </p>
    </div>

    <template v-else>
      <div class="src-head">
        <span class="src-model"
          ><StudioIcon name="source" /> Reading <strong>{{ model.label }}</strong></span
        >
        <button type="button" class="studio-link" @click="changeModel">Read something else</button>
      </div>

      <div class="src-body">
        <div class="src-panel">
          <h4>Tick the fields to read</h4>
          <CatalogTree
            :model="model.name"
            :catalog="draft.catalog.value"
            :checked="checked"
            multi
            @pick="toggleField"
            @read="readAsStep"
          />
        </div>
        <div class="src-panel">
          <h4>
            Columns this step gives <span class="desk-muted">({{ stage.fields.length }})</span>
          </h4>
          <p v-if="problemAt('fields')" class="sf-problem">
            <StudioIcon name="warn" /> {{ problemAt('fields') }}
          </p>
          <FoldList
            :items="stage.fields"
            :blank="() => ({ as: '', path: '' })"
            :problems="fieldProblems"
            add-label="Add by path"
            :copyable="false"
            empty-text="Tick fields on the left; each becomes a column."
            @update="setFields"
          >
            <template #summary="{ item }">
              <span class="src-col-name">{{ item.as || '…' }}</span>
              <span class="src-col-path">{{ pathLabel(item.path) }}</span>
            </template>
            <template #default="{ item, index }">
              <div class="sf-field" :class="{ bad: problemAt(`fields.${index}.as`) }">
                <label class="sf-label">Column name</label>
                <input
                  type="text"
                  class="sf-input sf-name"
                  :value="item.as"
                  spellcheck="false"
                  @input="renameField(index, ($event.target as HTMLInputElement).value)"
                />
                <p v-if="problemAt(`fields.${index}.as`)" class="sf-problem">
                  <StudioIcon name="warn" /> {{ problemAt(`fields.${index}.as`) }}
                </p>
              </div>
              <div class="sf-field" :class="{ bad: problemAt(`fields.${index}.path`) }">
                <label class="sf-label">Field</label>
                <PathButton
                  :model-value="item.path"
                  :model="model.name"
                  :catalog="draft.catalog.value"
                  @update:model-value="(path) => setPath(index, path)"
                />
                <p v-if="problemAt(`fields.${index}.path`)" class="sf-problem">
                  <StudioIcon name="warn" /> {{ problemAt(`fields.${index}.path`) }}
                </p>
              </div>
            </template>
          </FoldList>
        </div>
      </div>

      <div class="sf-field" :class="{ bad: problemAt('where') }">
        <label class="sf-label">Only rows where <span class="sf-optional">optional</span></label>
        <ConditionEditor
          :model-value="stage.where ?? ''"
          :scope="{ columns: [], model: model.name }"
          :invalid="Boolean(problemAt('where'))"
          field-id="studio-where"
          @update:model-value="setWhere"
        />
        <p v-if="problemAt('where')" class="sf-problem">
          <StudioIcon name="warn" /> {{ problemAt('where') }}
        </p>
      </div>

      <button type="button" class="sf-more" :aria-expanded="moreOpen" @click="moreOpen = !moreOpen">
        <StudioIcon :name="moreOpen ? 'open' : 'right'" /> More options
      </button>
      <div v-if="moreOpen" class="sf-advanced">
        <div class="sf-field">
          <label class="sf-label">Branches</label>
          <span class="cond-seg sf-seg" role="radiogroup" aria-label="Branches">
            <button
              type="button"
              role="radio"
              :aria-checked="stage.branchScope !== 'none'"
              :class="{ on: stage.branchScope !== 'none' }"
              @click="setShared(false)"
            >
              The user's branches
            </button>
            <button
              type="button"
              role="radio"
              :aria-checked="stage.branchScope === 'none'"
              :class="{ on: stage.branchScope === 'none' }"
              @click="setShared(true)"
            >
              Shared by all branches
            </button>
          </span>
          <p class="sf-hint">Masters such as products are shared; vouchers belong to a branch.</p>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { askDeskConfirm } from '../../form/confirm';
import type { Rdl2SourceField, Rdl2SourceStage } from '../language';
import CatalogTree from './CatalogTree.vue';
import type { Issue } from './checks';
import ConditionEditor from './ConditionEditor.vue';
import FoldList from './FoldList.vue';
import PathButton from './PathButton.vue';
import { cleanName } from './naming';
import { modelItems } from './pickItems';
import PickList from './PickList.vue';
import { columnNameFromPath, freeName, resolvePath } from './schema';
import StudioIcon from './StudioIcon.vue';
import { useReportDraftContext } from './useReportDraft';

/** The "Read records" step: what to read, its fields by ticking, and which rows. Edits that step in the draft. */
const props = defineProps<{ stageId: string; issues: readonly Issue[] }>();

const draft = useReportDraftContext();
const stage = computed(() => {
  const found = draft.report.stages.find((item) => item.id === props.stageId);
  return found?.kind === 'source' ? found : null;
});
const model = computed(() =>
  stage.value ? (draft.catalog.value.get(stage.value.model) ?? null) : null,
);
const checked = computed(() => new Set(stage.value?.fields.map((field) => field.path) ?? []));
const moreOpen = ref(stage.value?.branchScope === 'none');

function problemAt(path: string): string {
  return props.issues.find((issue) => issue.path === path)?.message ?? '';
}

function fieldProblems(index: number): number {
  return props.issues.filter((issue) => issue.path?.startsWith(`fields.${index}.`)).length;
}

function pathLabel(path: string): string {
  if (!path || !model.value) return path;
  const found = resolvePath(draft.catalog.value, model.value.name, path);
  return 'error' in found ? path : found.labels.join(' › ');
}

/** Run `change` on the step, when it is still a "Read records" step of the draft. */
function edit(change: (target: Rdl2SourceStage) => void): void {
  if (stage.value) change(stage.value);
}

function setModel(name: string): void {
  edit((target) => {
    target.model = name;
    target.fields = [];
    delete target.where;
  });
}

async function changeModel(): Promise<void> {
  const target = stage.value;
  if (!target) return;
  if (target.fields.length || target.where) {
    const ok = await askDeskConfirm({
      title: 'Read something else?',
      message: `The ${target.fields.length} fields picked and the condition are cleared. Undo brings them back.`,
      okLabel: 'Choose again',
    });
    if (!ok) return;
  }
  setModel('');
}

/** Tick adds the field as a column; untick removes it. */
function toggleField(path: string): void {
  edit((target) => {
    const at = target.fields.findIndex((field) => field.path === path);
    if (at >= 0) target.fields.splice(at, 1);
    else
      target.fields.push({
        as: freeName(
          columnNameFromPath(path),
          target.fields.map((field) => field.as),
        ),
        path,
      });
  });
}

function setFields(fields: Rdl2SourceField[]): void {
  edit((target) => {
    target.fields = fields;
  });
}

function renameField(index: number, raw: string): void {
  edit((target) => {
    const field = target.fields[index];
    if (field) field.as = cleanName(raw);
  });
}

function setPath(index: number, path: string): void {
  edit((target) => {
    const field = target.fields[index];
    if (!field) return;
    const suggested = columnNameFromPath(field.path);
    // A name that was the old field's own follows the new field.
    if (!field.as || field.as === suggested)
      field.as = freeName(
        columnNameFromPath(path),
        target.fields.filter((other) => other !== field).map((other) => other.as),
      );
    field.path = path;
  });
}

function setWhere(text: string): void {
  edit((target) => {
    if (text.trim()) target.where = text;
    else delete target.where;
  });
}

function setShared(shared: boolean): void {
  edit((target) => {
    if (shared) target.branchScope = 'none';
    else delete target.branchScope;
  });
}

/** A list that links here (invoice → items) becomes its own step, read next. */
function readAsStep(modelName: string): void {
  const at = draft.report.stages.findIndex((item) => item.id === props.stageId);
  draft.addStep('source', at + 1, modelName);
}
</script>
