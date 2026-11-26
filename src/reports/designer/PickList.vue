<template>
  <div class="pick-list" @keydown="onKey">
    <div v-if="searchable" class="pick-search">
      <StudioIcon name="search" />
      <input
        ref="search"
        v-model="query"
        type="search"
        data-autofocus
        :placeholder="placeholder ?? ''"
        spellcheck="false"
        autocomplete="off"
      />
    </div>
    <ul ref="list" class="pick-items" role="listbox" :aria-multiselectable="multi === true">
      <template
        v-for="(entry, index) in shown"
        :key="entry.kind === 'head' ? `h-${entry.label}` : `i-${entry.item.value}`"
      >
        <li v-if="entry.kind === 'head'" class="pick-head">{{ entry.label }}</li>
        <li v-else>
          <button
            type="button"
            tabindex="-1"
            class="pick-item"
            role="option"
            :class="{ on: index === active, picked: isPicked(entry.item.value) }"
            :aria-selected="isPicked(entry.item.value)"
            :disabled="entry.item.disabled === true"
            :title="entry.item.hint ?? entry.item.sub ?? ''"
            @mousemove="active = index"
            @click="pick(entry.item)"
          >
            <span v-if="multi" class="pick-check"
              ><StudioIcon v-if="isPicked(entry.item.value)" name="ok"
            /></span>
            <span
              v-if="entry.item.icon"
              class="pick-icon"
              :class="entry.item.tone ? `tone-${entry.item.tone}` : ''"
              ><StudioIcon :name="entry.item.icon"
            /></span>
            <span class="pick-label">{{ entry.item.label }}</span>
            <span v-if="entry.item.sub" class="pick-sub">{{ entry.item.sub }}</span>
          </button>
        </li>
      </template>
      <li v-if="!items.length || !shown.length" class="pick-empty">
        {{ query ? `Nothing matches "${query}"` : empty }}
      </li>
    </ul>
    <slot name="footer" />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { PickItem } from './pickItems';
import StudioIcon from './StudioIcon.vue';

/**
 * A list to pick from by mouse or keys: type to filter, arrows to move, Enter to pick. With
 * `multi` each pick toggles and the list stays open.
 */
const props = withDefaults(
  defineProps<{
    items: readonly PickItem[];
    selected?: readonly string[] | undefined;
    multi?: boolean | undefined;
    placeholder?: string | undefined;
    empty?: string | undefined;
    searchable?: boolean | undefined;
  }>(),
  {
    selected: () => [],
    multi: false,
    placeholder: 'Search',
    empty: 'Nothing to choose yet',
    searchable: true,
  },
);
const emit = defineEmits<{ pick: [value: string] }>();

const query = ref('');
const active = ref(0);
const list = ref<HTMLElement | null>(null);

type Entry = { kind: 'head'; label: string } | { kind: 'item'; item: PickItem };

const shown = computed((): Entry[] => {
  const q = query.value.trim().toLowerCase();
  const hits = q
    ? props.items.filter((item) =>
        `${item.label} ${item.value} ${item.sub ?? ''}`.toLowerCase().includes(q),
      )
    : props.items;
  const out: Entry[] = [];
  let group: string | undefined;
  for (const item of hits) {
    if (item.group && item.group !== group) out.push({ kind: 'head', label: item.group });
    group = item.group;
    out.push({ kind: 'item', item });
  }
  return out;
});

function firstItem(from: number, step: 1 | -1): number {
  const entries = shown.value;
  for (let i = from; i >= 0 && i < entries.length; i += step) {
    const entry = entries[i];
    if (entry?.kind === 'item' && !entry.item.disabled) return i;
  }
  return -1;
}

watch(
  shown,
  () => {
    active.value = Math.max(0, firstItem(0, 1));
  },
  { immediate: true },
);

function isPicked(value: string): boolean {
  return props.selected.includes(value);
}

function pick(item: PickItem): void {
  if (!item.disabled) emit('pick', item.value);
}

function move(step: 1 | -1): void {
  const next = firstItem(active.value + step, step);
  if (next < 0) return;
  active.value = next;
  void nextTick(() =>
    list.value?.querySelector('.pick-item.on')?.scrollIntoView({ block: 'nearest' }),
  );
}

function onKey(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown') move(1);
  else if (event.key === 'ArrowUp') move(-1);
  else if (event.key === 'Enter') {
    const entry = shown.value[active.value];
    if (entry?.kind === 'item') pick(entry.item);
  } else return;
  event.preventDefault();
  event.stopPropagation();
}
</script>

<style scoped>
.pick-list {
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-height: inherit;
}
.pick-items {
  list-style: none;
  margin: 0;
  padding: 4px;
  overflow: auto;
  max-height: 320px;
}
.pick-head {
  padding: 6px 6px 2px;
  font-size: 0.72em;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--desk-muted);
}
.pick-item {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 4px 6px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--desk-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.pick-item.on {
  background: var(--desk-hover-bg);
}
.pick-item.picked .pick-label {
  font-weight: 600;
}
.pick-item:disabled {
  opacity: 0.5;
  cursor: default;
}
.pick-check {
  width: 14px;
  height: 14px;
  border: 1px solid var(--desk-grid-line);
  border-radius: 3px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8em;
  color: var(--desk-cursor);
}
.pick-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pick-sub {
  max-width: 45%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--desk-muted);
  font-size: 0.85em;
}
</style>
