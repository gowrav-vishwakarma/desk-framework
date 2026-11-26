<template>
  <div class="inputs-editor">
    <section class="ed-section">
      <h3>About the report</h3>
      <div class="sf-field" :class="{ bad: problemAt('title', AT_REPORT) }">
        <label class="sf-label" for="rep-title">Title</label>
        <input
          id="rep-title"
          v-model="report.title"
          type="text"
          class="sf-input"
          data-desk-field="studio-report-title"
        />
        <p v-if="problemAt('title', AT_REPORT)" class="sf-problem">
          <StudioIcon name="warn" /> {{ problemAt('title', AT_REPORT) }}
        </p>
      </div>
      <div class="sf-field">
        <label class="sf-label" for="rep-desc"
          >What it shows <span class="sf-optional">optional</span></label
        >
        <textarea
          id="rep-desc"
          v-model="description"
          class="sf-input"
          rows="2"
          placeholder="Shown above the report, to say what it is for"
        />
      </div>
      <div class="sf-field">
        <label class="sf-label" for="rep-cat"
          >Category <span class="sf-optional">optional</span></label
        >
        <input
          id="rep-cat"
          v-model="category"
          type="text"
          class="sf-input"
          placeholder="Sales, Inventory…"
        />
      </div>
    </section>

    <section class="ed-section">
      <h3>Inputs the user fills in</h3>
      <p class="desk-muted ed-lead">
        Each input is a filter on the report. Use it in conditions as <code>@name</code>, such as
        <code>invoiceDate between @from and @to</code>.
      </p>
      <FoldList
        :items="report.params"
        :blank="blankParam"
        :problems="paramProblems"
        add-label="Add an input"
        field-id="studio-add-input"
        @update="(params) => (report.params = params)"
      >
        <template #summary="{ item }">
          <span class="in-type" :class="`tone-${paramType(item)}`"
            ><StudioIcon :name="TYPE_ICON[paramType(item)]"
          /></span>
          <strong>{{ item.label || 'New input' }}</strong>
          <code class="in-id">@{{ item.id || '…' }}</code>
          <span v-if="item.required" class="in-tag">required</span>
          <span v-if="item.multi" class="in-tag">several</span>
          <span v-if="defaultText(item)" class="in-tag">{{ defaultText(item) }}</span>
          <span
            v-if="item.id && !draft.paramUses(item.id).length"
            class="in-tag warn"
            title="No step reads this input yet"
            >not used</span
          >
        </template>
        <template #default="{ item, index }">
          <ParamForm :param="item" :index="index" :issues="issues" />
        </template>
      </FoldList>
    </section>

    <section class="ed-section">
      <button type="button" class="sf-more" :aria-expanded="menuOpen" @click="menuOpen = !menuOpen">
        <StudioIcon :name="menuOpen ? 'open' : 'right'" /> Menu and link
      </button>
      <div v-if="menuOpen" class="sf-advanced">
        <div class="sf-field">
          <label class="sf-switch"
            ><input
              type="checkbox"
              :checked="report.menu?.show === true"
              @change="setMenu('show', ($event.target as HTMLInputElement).checked || undefined)"
            />
            <span>Show in the Studio Reports menu</span></label
          >
        </div>
        <div class="sf-field">
          <label class="sf-label">Menu group <span class="sf-optional">optional</span></label>
          <input
            type="text"
            class="sf-input"
            :value="report.menu?.group ?? ''"
            placeholder="Sales / Monthly"
            @input="setMenu('group', ($event.target as HTMLInputElement).value || undefined)"
          />
          <p class="sf-hint">
            Reports in the same group share a submenu; "Sales / Monthly" nests one inside another.
          </p>
        </div>
        <div class="sf-field">
          <label class="sf-label">Menu text <span class="sf-optional">optional</span></label>
          <input
            type="text"
            class="sf-input"
            :value="report.menu?.label ?? ''"
            :placeholder="report.title"
            @input="setMenu('label', ($event.target as HTMLInputElement).value || undefined)"
          />
        </div>
        <div class="sf-field">
          <label class="sf-label">Menu order <span class="sf-optional">optional</span></label>
          <input
            type="number"
            class="sf-input sf-number"
            :value="report.menu?.order ?? ''"
            placeholder="Lower comes first"
            @input="setMenuOrder(($event.target as HTMLInputElement).value)"
          />
        </div>
        <div class="sf-field">
          <label class="sf-label">Link name <span class="sf-optional">optional</span></label>
          <input
            v-model="report.name"
            type="text"
            class="sf-input"
            :placeholder="`Made from the title on save`"
            spellcheck="false"
          />
          <p class="sf-hint">
            Used in the report's link and the menu. Left empty, Save makes it from the title.
          </p>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Rdl2Menu, Rdl2Param } from '../language';
import { AT_INPUTS, AT_REPORT } from './checks';
import FoldList from './FoldList.vue';
import { DATE_WORDS } from './inputs';
import ParamForm from './ParamForm.vue';
import { paramType, TYPE_ICON } from './pickItems';
import StudioIcon from './StudioIcon.vue';
import { useReportDraftContext } from './useReportDraft';

/** The report's title, description, inputs and menu place. Edits the draft. */
const draft = useReportDraftContext();
const report = draft.report;
const issues = computed(() => draft.issues.value.filter((issue) => issue.at === AT_INPUTS));
const menuOpen = ref(Boolean(report.menu?.show || report.menu?.group || report.name));

const description = computed({
  get: () => report.description ?? '',
  set: (value: string) => {
    if (value) report.description = value;
    else delete report.description;
  },
});

const category = computed({
  get: () => report.category ?? '',
  set: (value: string) => {
    if (value) report.category = value;
    else delete report.category;
  },
});

function problemAt(path: string, at = AT_INPUTS): string {
  return draft.issues.value.find((issue) => issue.at === at && issue.path === path)?.message ?? '';
}

function paramProblems(index: number): number {
  return issues.value.filter((issue) => issue.path?.startsWith(`params.${index}.`)).length;
}

function blankParam(): Rdl2Param {
  return { id: '', label: '', type: 'text' };
}

function defaultText(param: Rdl2Param): string {
  if (param.default === undefined || param.default === '') return '';
  if (param.type === 'date')
    return (
      DATE_WORDS.find((word) => word.value === param.default)?.label.toLowerCase() ??
      String(param.default as string)
    );
  if (param.type === 'boolean') return param.default === true ? 'yes' : 'no';
  return `default ${String(param.default as string | number)}`;
}

function setMenu<K extends keyof Rdl2Menu>(key: K, value: Rdl2Menu[K] | undefined): void {
  const menu: Rdl2Menu = { ...(report.menu ?? {}) };
  if (value === undefined) delete menu[key];
  else menu[key] = value;
  if (Object.keys(menu).length) report.menu = menu;
  else delete report.menu;
}

function setMenuOrder(raw: string): void {
  setMenu('order', raw === '' ? undefined : Number(raw));
}
</script>
