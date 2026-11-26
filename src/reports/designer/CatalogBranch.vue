<template>
  <ul class="catalog-branch" :class="{ nested: depth > 0 }">
    <li v-for="field in model.fields" :key="`f-${field.name}`">
      <button :data-desk-field="`catalog-field-${prefix}${field.name}`"
        type="button"
        class="catalog-node is-field"
        :class="{ on: checked.has(`${prefix}${field.name}`) }"
        :title="`${prefix}${field.name} · ${TYPE_WORD[valueTypeOf(field.type)]}`"
        @click="emit('pick', `${prefix}${field.name}`)"
      >
        <span v-if="multi" class="catalog-check"
          ><StudioIcon v-if="checked.has(`${prefix}${field.name}`)" name="ok"
        /></span>
        <span class="catalog-type" :class="`tone-${valueTypeOf(field.type)}`"
          ><StudioIcon :name="TYPE_ICON[valueTypeOf(field.type)]"
        /></span>
        <span class="catalog-label">{{ field.label }}</span>
        <span v-if="field.primaryKey" class="catalog-tag">key</span>
      </button>
    </li>
    <li v-for="relation in ones" :key="`r-${relation.name}`">
      <button
        type="button"
        class="catalog-node is-link"
        :class="{ open: open.has(relation.name) }"
        :title="`${prefix}${relation.name} → ${relation.target}`"
        @click="toggle(relation.name)"
      >
        <StudioIcon :name="open.has(relation.name) ? 'open' : 'right'" class="catalog-caret" />
        <span class="catalog-type tone-link"><StudioIcon name="link" /></span>
        <span class="catalog-label">{{ relation.label }}</span>
        <span v-if="usedUnder(relation.name)" class="catalog-tag on">{{
          usedUnder(relation.name)
        }}</span>
      </button>
      <CatalogBranch
        v-if="open.has(relation.name) && catalog.get(relation.target)"
        :model="catalog.get(relation.target)!"
        :catalog="catalog"
        :prefix="`${prefix}${relation.name}.`"
        :depth="depth + 1"
        :checked="checked"
        :multi="multi"
        @pick="(path) => emit('pick', path)"
        @read="(name) => emit('read', name)"
      />
    </li>
    <li v-if="manys.length && depth === 0" class="catalog-many-head">
      Lists — read them in their own step and total them
    </li>
    <li v-for="relation in depth === 0 ? manys : []" :key="`m-${relation.name}`">
      <div class="catalog-node is-many" :title="`Many ${relation.target} rows for each row`">
        <span class="catalog-type tone-link"><StudioIcon name="source" /></span>
        <span class="catalog-label">{{ relation.label }}</span>
        <button type="button" class="catalog-read" @click="emit('read', relation.target)">
          Read as a step
        </button>
      </div>
    </li>
  </ul>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { CatalogModel } from '../studioApi';
import { TYPE_ICON, TYPE_WORD } from './pickItems';
import { valueTypeOf, type Catalog } from './schema';
import StudioIcon from './StudioIcon.vue';

defineOptions({ name: 'CatalogBranch' });

/** One model's fields and the records it links to, under a path such as `billToParty.city.`. */
const props = defineProps<{
  model: CatalogModel;
  catalog: Catalog;
  prefix: string;
  depth: number;
  checked: ReadonlySet<string>;
  multi: boolean;
}>();
const emit = defineEmits<{ pick: [path: string]; read: [model: string] }>();

/** Links followed this deep; deeper paths are rare and slow to read. */
const MAX_DEPTH = 3;
const ones = computed(() =>
  props.depth < MAX_DEPTH
    ? props.model.relations.filter((r) => r.type === 'one' && props.catalog.has(r.target))
    : [],
);
const manys = computed(() =>
  props.model.relations.filter((r) => r.type === 'many' && props.catalog.has(r.target)),
);

// Open the links that already have ticked fields, so what is read is in view.
const open = ref(new Set(ones.value.filter((r) => usedUnder(r.name)).map((r) => r.name)));

function usedUnder(relation: string): number {
  const start = `${props.prefix}${relation}.`;
  let n = 0;
  for (const path of props.checked) if (path.startsWith(start)) n += 1;
  return n;
}

function toggle(name: string): void {
  const next = new Set(open.value);
  if (next.has(name)) next.delete(name);
  else next.add(name);
  open.value = next;
}
</script>
