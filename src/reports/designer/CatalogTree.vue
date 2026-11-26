<template>
  <div class="catalog-tree">
    <div class="catalog-search">
      <StudioIcon name="search" />
      <input
        v-model="query"
        type="search"
        :placeholder="`Search ${root?.label ?? ''} fields and linked records`"
        spellcheck="false"
        autocomplete="off"
        data-autofocus
        @keydown.enter.prevent="pickFirst"
      />
    </div>
    <div class="catalog-scroll">
      <p v-if="!root" class="desk-muted catalog-note">Choose what to read first.</p>
      <ul v-else-if="query.trim()" class="catalog-branch">
        <li v-for="hit in hits" :key="hit.path">
          <button
            type="button"
            class="catalog-node is-field"
            :class="{ on: checkedPaths.has(hit.path) }"
            :title="hit.path"
            @click="emit('pick', hit.path)"
          >
            <span v-if="multiple" class="catalog-check"
              ><StudioIcon v-if="checkedPaths.has(hit.path)" name="ok"
            /></span>
            <span class="catalog-type" :class="`tone-${hit.type}`"
              ><StudioIcon :name="TYPE_ICON[hit.type]"
            /></span>
            <span class="catalog-label">
              <span v-if="hit.via" class="catalog-via">{{ hit.via }} › </span>{{ hit.label }}
            </span>
          </button>
        </li>
        <li v-if="!hits.length" class="desk-muted catalog-note">
          No field matches "{{ query }}". Links are searched two levels deep; open a link below to
          go further.
        </li>
      </ul>
      <CatalogBranch
        v-else
        :model="root"
        :catalog="catalog"
        prefix=""
        :depth="0"
        :checked="checkedPaths"
        :multi="multiple"
        @pick="(path) => emit('pick', path)"
        @read="(name) => emit('read', name)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ValueType } from './expr';
import CatalogBranch from './CatalogBranch.vue';
import { TYPE_ICON } from './pickItems';
import { valueTypeOf, type Catalog } from './schema';
import StudioIcon from './StudioIcon.vue';

/**
 * The fields of a model and of the records it links to, to tick (`multi`) or pick one. Search
 * finds fields two links deep, so "city" finds Party › City › Name without opening anything.
 */
const props = defineProps<{
  model: string;
  catalog: Catalog;
  checked?: ReadonlySet<string> | undefined;
  multi?: boolean | undefined;
}>();
const emit = defineEmits<{ pick: [path: string]; read: [model: string] }>();

const NONE: ReadonlySet<string> = new Set();
const checkedPaths = computed(() => props.checked ?? NONE);
const multiple = computed(() => props.multi === true);
const query = ref('');
const root = computed(() => props.catalog.get(props.model) ?? null);

interface Hit {
  path: string;
  label: string;
  via: string;
  type: ValueType;
  depth: number;
}

const SEARCH_DEPTH = 2;
const MAX_HITS = 80;

const hits = computed((): Hit[] => {
  const q = query.value.trim().toLowerCase();
  if (!q || !root.value) return [];
  const out: Hit[] = [];
  const walk = (
    modelName: string,
    prefix: string,
    via: string[],
    depth: number,
    seen: Set<string>,
  ): void => {
    const model = props.catalog.get(modelName);
    if (!model || out.length >= MAX_HITS) return;
    for (const field of model.fields) {
      const viaText = via.join(' › ');
      if (`${field.label} ${field.name} ${viaText}`.toLowerCase().includes(q)) {
        out.push({
          path: `${prefix}${field.name}`,
          label: field.label,
          via: viaText,
          type: valueTypeOf(field.type),
          depth,
        });
      }
    }
    if (depth >= SEARCH_DEPTH) return;
    for (const relation of model.relations) {
      // A model already on the way would only repeat its fields.
      if (relation.type !== 'one' || seen.has(relation.target)) continue;
      walk(
        relation.target,
        `${prefix}${relation.name}.`,
        [...via, relation.label],
        depth + 1,
        new Set([...seen, relation.target]),
      );
    }
  };
  walk(root.value.name, '', [], 0, new Set([root.value.name]));
  // Nearer fields first, then the order found.
  return out.sort((a, b) => a.depth - b.depth).slice(0, MAX_HITS);
});

function pickFirst(): void {
  const first = hits.value[0];
  if (first) emit('pick', first.path);
}
</script>

<style>
.catalog-tree {
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-height: inherit;
}
.catalog-search {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--desk-grid-line);
  color: var(--desk-muted);
}
.catalog-search input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--desk-text);
  font: inherit;
}
.catalog-scroll {
  overflow: auto;
  min-height: 0;
  padding: 4px;
}
.catalog-note {
  margin: 8px;
  font-size: 0.9em;
}
.catalog-branch {
  list-style: none;
  margin: 0;
  padding: 0;
}
.catalog-branch.nested {
  margin-left: 11px;
  padding-left: 8px;
  border-left: 1px dashed var(--desk-grid-line);
}
.catalog-node {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 2px 6px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--desk-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.catalog-node:hover,
.catalog-node:focus-visible {
  background: var(--desk-hover-bg);
  outline: none;
}
.catalog-node.on .catalog-label {
  font-weight: 600;
}
.catalog-node.is-link .catalog-label {
  color: var(--desk-link);
}
.catalog-node.is-many {
  cursor: default;
  color: var(--desk-muted);
}
.catalog-node.is-many:hover {
  background: transparent;
}
.catalog-caret {
  color: var(--desk-muted);
  margin-left: -2px;
}
.catalog-check {
  width: 14px;
  height: 14px;
  flex: none;
  border: 1px solid var(--desk-grid-line);
  border-radius: 3px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8em;
  color: var(--desk-cursor);
  background: var(--desk-row-bg);
}
.catalog-node.on .catalog-check {
  border-color: var(--desk-cursor);
}
.catalog-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.catalog-via {
  color: var(--desk-muted);
}
.catalog-tag {
  font-size: 0.75em;
  padding: 0 5px;
  border-radius: 8px;
  border: 1px solid var(--desk-grid-line);
  color: var(--desk-muted);
}
.catalog-tag.on {
  border-color: var(--desk-cursor);
  color: var(--desk-cursor);
}
.catalog-many-head {
  margin: 8px 6px 2px;
  font-size: 0.75em;
  color: var(--desk-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.catalog-read {
  border: 1px solid var(--desk-grid-line);
  border-radius: 4px;
  background: var(--desk-row-bg);
  color: var(--desk-text);
  font: inherit;
  font-size: 0.85em;
  padding: 0 6px;
  cursor: pointer;
}
.catalog-read:hover {
  border-color: var(--desk-cursor);
}
</style>
