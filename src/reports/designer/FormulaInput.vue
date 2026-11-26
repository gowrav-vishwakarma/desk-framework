<template>
  <div class="formula" :class="{ invalid: Boolean(problem) || invalid }">
    <div v-if="mode === 'column'" class="formula-column">
      <PathButton
        v-if="scope.model"
        :model-value="modelValue"
        :model="scope.model"
        :catalog="draft.catalog.value"
        :placeholder="placeholder || 'Choose a field…'"
        :invalid="invalid"
        :field-id="fieldId"
        @update:model-value="emit('update:modelValue', $event)"
      />
      <PickButton
        v-else
        :model-value="modelValue"
        :items="columnItems(scope.columns)"
        :placeholder="placeholder || 'Choose a column…'"
        :invalid="invalid"
        :field-id="fieldId"
        show-sub
        empty="The step this one reads has no columns yet"
        @update:model-value="emit('update:modelValue', $event)"
      />
      <button data-desk-field="formula-input-formula"
        type="button"
        class="studio-link"
        title="Work the value out with a formula instead"
        @click="toFormula"
      >
        <StudioIcon name="formula" /> Formula
      </button>
    </div>

    <template v-else>
      <div class="formula-box">
        <textarea
          ref="box"
          :value="modelValue"
          :rows="rows"
          spellcheck="false"
          autocomplete="off"
          :placeholder="
            placeholder ||
            (expect === 'boolean' ? 'amount > 1000 and status = \'active\'' : 'amount - discount')
          "
          :data-desk-field="fieldId"
          @input="onInput"
          @keydown.enter.exact="onEnter"
        />
        <div class="formula-tools">
          <button ref="colButton" type="button" class="studio-chip-btn" @click="openMenu('column')">
            <StudioIcon name="number" /> {{ scope.model ? 'Field' : 'Column' }}
          </button>
          <button data-desk-field="formula-input-input"
            v-if="draft.params.value.length"
            ref="paramButton"
            type="button"
            class="studio-chip-btn"
            @click="openMenu('param')"
          >
            @ Input
          </button>
          <button data-desk-field="formula-input-function"
            ref="fnButton"
            type="button"
            class="studio-chip-btn"
            @click="openMenu('function')"
          >
            <StudioIcon name="formula" /> Function
          </button>
          <span class="formula-spacer" />
          <button
            v-if="preferColumn && (!modelValue || isPlainName(modelValue))"
            type="button"
            class="studio-link"
            @click="mode = 'column'"
          >
            Pick a column
          </button>
        </div>
      </div>
      <p v-if="problem" class="formula-problem">
        <StudioIcon name="warn" /> {{ problem.message }}
        <span v-if="problem.excerpt" class="formula-excerpt">
          {{ problem.excerpt[0] }}<mark>{{ problem.excerpt[1] || ' ' }}</mark
          >{{ problem.excerpt[2] }}
        </span>
      </p>
      <p v-else-if="note" class="formula-note" :class="{ warn: note.warn }">
        <StudioIcon :name="note.warn ? 'warn' : 'ok'" /> {{ note.text }}
      </p>
      <p v-if="help" class="formula-help">
        <code>{{ help.signature }}</code> {{ help.text }}
      </p>
    </template>

    <StudioPopup v-model:open="menuOpen" :anchor="menuAnchor" :width="320">
      <CatalogTree
        v-if="menu === 'column' && scope.model"
        :model="scope.model"
        :catalog="draft.catalog.value"
        @pick="(name) => insert(name)"
      />
      <PickList
        v-else-if="menu === 'column'"
        :items="columnItems(scope.columns)"
        empty="The step this one reads has no columns yet"
        @pick="(name) => insert(name)"
      />
      <PickList
        v-else-if="menu === 'param'"
        :items="paramItems(draft.params.value)"
        @pick="(id) => insert(`@${id}`)"
      />
      <PickList
        v-else
        :items="functionItems"
        placeholder="Search functions"
        @pick="insertFunction"
      />
    </StudioPopup>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import CatalogTree from './CatalogTree.vue';
import {
  checkExpr,
  exprType,
  FUNCTIONS,
  functionDoc,
  functionSignature,
  isPlainName,
  type ValueType,
} from './expr';
import PathButton from './PathButton.vue';
import PickButton from './PickButton.vue';
import { columnItems, paramItems, TYPE_ICON, TYPE_WORD, type PickItem } from './pickItems';
import PickList from './PickList.vue';
import { exprScopeOf, scopeType, type NameScope } from './scope';
import StudioIcon from './StudioIcon.vue';
import StudioPopup from './StudioPopup.vue';
import { useReportDraftContext } from './useReportDraft';

/**
 * A value worked out from the row. Where a plain column is the usual answer (`preferColumn`) it
 * starts as a column picker; the formula box checks as it is typed, points at the mistake and
 * says what type it gives, and inserts columns, inputs and functions where the cursor is.
 */
const props = withDefaults(
  defineProps<{
    modelValue: string;
    scope: NameScope;
    /** What it should give: a condition is `boolean`. */
    expect?: ValueType | undefined;
    preferColumn?: boolean | undefined;
    placeholder?: string | undefined;
    invalid?: boolean | undefined;
    fieldId?: string | undefined;
  }>(),
  { expect: 'unknown', preferColumn: false, placeholder: '' },
);
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const draft = useReportDraftContext();
const mode = ref<'column' | 'formula'>(
  props.preferColumn && (!props.modelValue || isPlainName(props.modelValue)) ? 'column' : 'formula',
);
const box = ref<HTMLTextAreaElement | null>(null);
const colButton = ref<HTMLButtonElement | null>(null);
const paramButton = ref<HTMLButtonElement | null>(null);
const fnButton = ref<HTMLButtonElement | null>(null);
const menu = ref<'column' | 'param' | 'function'>('column');
const menuOpen = ref(false);
const menuAnchor = computed(() =>
  menu.value === 'column'
    ? colButton.value
    : menu.value === 'param'
      ? paramButton.value
      : fnButton.value,
);
/** Where the cursor was when a menu opened; the pick goes there. */
let caret: [number, number] | null = null;
const helpFor = ref('');

// A value that stops being a plain name (undo, another editor) shows as a formula.
watch(
  () => props.modelValue,
  (value) => {
    if (mode.value === 'column' && value && !isPlainName(value)) mode.value = 'formula';
  },
);

const rows = computed(() =>
  Math.min(
    6,
    Math.max(
      1,
      Math.ceil((props.modelValue.length || 1) / 60),
      props.modelValue.split('\n').length,
    ),
  ),
);

const check = computed(() => {
  const text = props.modelValue.trim();
  if (!text) return null;
  return checkExpr(
    text,
    exprScopeOf(props.scope, draft.catalog.value, draft.params.value, draft.functions.value),
  );
});

const problem = computed(() => {
  const result = check.value;
  if (!result || result.ok) return null;
  const text = props.modelValue.trim();
  const from = Math.max(0, result.at - 18);
  const to = Math.min(text.length, result.at + result.length + 18);
  const excerpt: [string, string, string] = [
    `${from > 0 ? '…' : ''}${text.slice(from, result.at)}`,
    text.slice(result.at, result.at + result.length),
    `${text.slice(result.at + result.length, to)}${to < text.length ? '…' : ''}`,
  ];
  return { message: result.message, excerpt: text.length > 1 ? excerpt : null };
});

const note = computed((): { text: string; warn: boolean } | null => {
  const result = check.value;
  if (!result?.ok) return null;
  const type = exprType(result.ast, (name) => scopeType(props.scope, draft.catalog.value, name));
  if (props.expect === 'boolean' && type !== 'boolean' && type !== 'unknown')
    return {
      text: `This gives a ${TYPE_WORD[type]}; a condition needs yes or no, such as amount > 0`,
      warn: true,
    };
  if (props.expect === 'boolean') return { text: 'Looks right', warn: false };
  return { text: type === 'unknown' ? 'Looks right' : `Gives a ${TYPE_WORD[type]}`, warn: false };
});

const help = computed(() => {
  const doc = helpFor.value ? functionDoc(helpFor.value) : undefined;
  return doc ? { signature: functionSignature(doc), text: doc.help } : null;
});

const functionItems = computed((): PickItem[] => {
  const offered = draft.functions.value.length ? new Set(draft.functions.value) : null;
  return FUNCTIONS.filter((fn) => !offered || offered.has(fn.name.toLowerCase())).map((fn) => ({
    value: fn.name,
    label: functionSignature(fn),
    sub: fn.help,
    group: fn.group,
    icon: fn.returns === 'arg' ? 'formula' : TYPE_ICON[fn.returns],
    tone: fn.returns === 'arg' ? 'unknown' : fn.returns,
    hint: fn.help,
  }));
});

function onInput(event: Event): void {
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value);
}

/** Enter in a one-line formula moves on instead of adding a line. */
function onEnter(event: KeyboardEvent): void {
  if (!props.modelValue.includes('\n')) event.preventDefault();
}

function toFormula(): void {
  mode.value = 'formula';
  void nextTick(() => {
    box.value?.focus();
    box.value?.setSelectionRange(props.modelValue.length, props.modelValue.length);
  });
}

function openMenu(kind: 'column' | 'param' | 'function'): void {
  const el = box.value;
  caret = el ? [el.selectionStart, el.selectionEnd] : null;
  menu.value = kind;
  menuOpen.value = true;
}

/** Put text at the cursor, with a space on either side where words would run together. */
function insert(token: string, cursorBack = 0): void {
  menuOpen.value = false;
  const value = props.modelValue;
  const [start, end] = caret ?? [value.length, value.length];
  const before = value.slice(0, start);
  const after = value.slice(end);
  const lead = before && !/[\s(,]$/.test(before) ? ' ' : '';
  const trail = after && !/^[\s),]/.test(after) ? ' ' : '';
  const next = `${before}${lead}${token}${trail}${after}`;
  emit('update:modelValue', next);
  const at = before.length + lead.length + token.length - cursorBack;
  void nextTick(() => {
    box.value?.focus();
    box.value?.setSelectionRange(at, at);
  });
}

function insertFunction(name: string): void {
  helpFor.value = name;
  insert(`${name}()`, 1);
}
</script>
