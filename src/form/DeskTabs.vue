<template>
  <div v-if="tabs.length > 0" ref="bar" class="desk-tabs" role="tablist" :aria-label="label || 'Sections'">
    <button
      v-for="item in tabs"
      :key="item.id"
      type="button"
      role="tab"
      tabindex="-1"
      :aria-selected="item.id === modelValue"
      :disabled="item.disabled === true"
      :title="item.title ?? ''"
      :class="{ active: item.id === modelValue }"
      :data-desk-tab="item.id"
      :data-desk-action="`${tabsSlug(label ?? '')}-tab-${item.id}`"
      @click="onPick(item.id)"
    >
      {{ item.label }}<slot name="tab-end" :item="item" />
    </button>
    <span v-if="hint" class="desk-tabs-hint">{{ hint }}</span>
  </div>
  <section v-if="paned" ref="pane" class="desk-tab-pane" :class="{ 'is-fill': fill }" data-desk-section="tab" :data-desk-pane="modelValue ?? ''">
    <DeskNodeScope kind="pane" :name="modelValue ?? 'none'"><slot /></DeskNodeScope>
  </section>
</template>

<script setup lang="ts">
import { computed, inject, nextTick, onActivated, onDeactivated, onMounted, onUnmounted, ref, useSlots, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { focusFirstWhenReady } from '../focus/useDeskFocus';
import { addDeskHandlers, deskLayers, type DeskLayer } from '../keys/layers';
import { DESK_PAGE_FRAME } from '../page/pageContext';
import { deskTabGroups, type DeskTabItem, type TabGroup } from './deskTabGroup';
import { isPendingPrefix, joinTabPath, splitTabPath, TAB_QUERY_KEY } from './deskTabRoute';
import { DESK_FORM_DIRTY } from './formDirty';
import { DESK_FORM_ISSUES } from './issues';
import DeskNodeScope from '../automation/DeskNodeScope.vue';
import { useDeskAutomationNode } from '../automation/registry';

export type { DeskTabItem };

const props = withDefaults(
  defineProps<{
    tabs: readonly DeskTabItem[];
    modelValue: string | null;
    label?: string;
    hint?: string;
    /** The pane fills the space under the bar and scrolls inside its grid. */
    fill?: boolean;
    /** When true, the strip reads and writes `?tab=` on routed pages. Off in dialogs and wizards that own the URL. */
    inUrl?: boolean;
    /**
     * Tabs with no pane of their own: after a switch, focus the first field or grid that follows the
     * bar in its parent, the way a pane's first field gets focus. Grid layout tabs use it.
     */
    focusAfter?: boolean;
  }>(),
  { label: 'Sections', hint: '', fill: false, inUrl: true },
);
const emit = defineEmits<{ 'update:modelValue': [string] }>();

const route = useRoute();
const router = useRouter();
/** Read once in setup; `inject` is not valid inside later sync callbacks. */
const inPageDialog = inject(DESK_PAGE_FRAME, null) !== null;

const slots = useSlots();
/** Present inside a DeskForm with a tracker. A swap asks first when it would drop a dirty sub-form. */
const formDirty = inject(DESK_FORM_DIRTY, null);
// Inside a form, the strip tells it which tab holds a field (`fields`), so a server issue opens that tab.
const formIssues = inject(DESK_FORM_ISSUES, null);
if (formIssues) {
  const stop = formIssues.tabs({
    tabOf: (fieldId) => props.tabs.find((tab) => tab.fields?.includes(fieldId))?.id ?? null,
    open: (tabId) => select(tabId),
  });
  onUnmounted(stop);
}
const paned = computed(() => Boolean(slots.default));
const bar = ref<HTMLElement | null>(null);
const pane = ref<HTMLElement | null>(null);

const group: TabGroup = {
  host: null,
  paneEl: null,
  layer: null,
  parent: null,
  child: null,
  entry: null,
  stop: null,
  inUrl: true,
  restore: null,
  syncUrl: () => {
    syncUrlFromRoot();
  },
  openTabs: () => props.tabs.filter((tab) => tab.disabled !== true),
  value: () => props.modelValue,
  select,
  selectEdge,
};

let wanted: string | null = null;
let removeKeys: (() => void) | null = null;
let stopRestoreWatch: (() => void) | null = null;

function rootOf(start: TabGroup): TabGroup {
  let at = start;
  while (at.parent) at = at.parent;
  return at;
}

function deepest(start: TabGroup): TabGroup {
  let at = start;
  while (at.child) at = at.child;
  return at;
}

function tabDepth(start: TabGroup): number {
  let depth = 0;
  let at: TabGroup | null = start;
  while (at?.parent) {
    depth += 1;
    at = at.parent;
  }
  return depth;
}

function chainIds(start: TabGroup): string[] {
  const ids: string[] = [];
  let at: TabGroup | null = start;
  while (at) {
    const value = at.value();
    if (!value) break;
    ids.push(value);
    at = at.child;
  }
  return ids;
}

function urlSyncEnabled(): boolean {
  return props.inUrl && !inPageDialog && group.layer?.modal !== true;
}

function clearEntry(start: TabGroup): void {
  start.entry = null;
  if (start.child) clearEntry(start.child);
}

function cancelRestoreWatch(): void {
  stopRestoreWatch?.();
  stopRestoreWatch = null;
}

function cancelUrlRestore(): void {
  const root = rootOf(group);
  root.restore = null;
  cancelRestoreWatch();
}

function syncUrlFromRoot(): void {
  if (!urlSyncEnabled()) return;
  const root = rootOf(group);
  if (root !== group) return;
  const next = joinTabPath(chainIds(root));
  const current = joinTabPath(splitTabPath(route.query[TAB_QUERY_KEY]));
  const pending = root.restore ? joinTabPath(root.restore) : '';
  if (pending && isPendingPrefix(next, pending)) return;
  if (next === current) return;
  const query = { ...route.query };
  if (next) query[TAB_QUERY_KEY] = next;
  else delete query[TAB_QUERY_KEY];
  void router.replace({ query });
}

function scheduleUrlSync(): void {
  if (!urlSyncEnabled()) return;
  const root = rootOf(group);
  void nextTick(() => root.syncUrl());
}

function finishRestoreIfDone(): void {
  const root = rootOf(group);
  const segments = root.restore;
  if (!segments?.length) return;
  const depth = tabDepth(group);
  if (props.modelValue !== segments[depth]) return;
  if (group.child) return;
  if (depth !== segments.length - 1) return;
  root.restore = null;
  scheduleUrlSync();
}

function beginRestoreFromUrl(): void {
  if (!urlSyncEnabled()) return;
  const root = rootOf(group);
  const segments = root.restore;
  if (!segments?.length) return;
  const depth = tabDepth(group);
  const id = segments[depth];
  if (!id) {
    finishRestoreIfDone();
    return;
  }
  if (props.modelValue === id) {
    finishRestoreIfDone();
    return;
  }
  const trySelect = (): boolean => {
    if (!group.openTabs().some((tab) => tab.id === id)) return false;
    cancelRestoreWatch();
    select(id);
    return true;
  };
  if (trySelect()) return;
  cancelRestoreWatch();
  stopRestoreWatch = watch(
    () => props.tabs,
    () => {
      if (trySelect()) cancelRestoreWatch();
    },
    { deep: true },
  );
}

function seedRestoreFromRoute(): void {
  if (!urlSyncEnabled()) return;
  const root = rootOf(group);
  if (root !== group) return;
  const segments = splitTabPath(route.query[TAB_QUERY_KEY]);
  root.restore = segments.length > 0 ? [...segments] : null;
}

/** Ctrl+Shift+Left/Right. Inner tabs move first. The last one steps the parent. */
function step(current: TabGroup, dir: 1 | -1): void {
  const open = current.openTabs();
  if (open.length === 0) {
    if (!current.parent) return;
    current.parent.entry = dir > 0 ? 'first' : 'last';
    step(current.parent, dir);
    return;
  }
  const at = open.findIndex((tab) => tab.id === current.value());
  const next = at < 0 ? open[dir > 0 ? 0 : open.length - 1] : open[at + dir];
  if (next) {
    current.select(next.id);
    return;
  }
  if (current.parent) {
    current.parent.entry = dir > 0 ? 'first' : 'last';
    step(current.parent, dir);
    return;
  }
  const wrap = open[dir > 0 ? 0 : open.length - 1];
  if (!wrap) return;
  current.entry = dir > 0 ? 'first' : 'last';
  if (wrap.id !== current.value()) {
    current.select(wrap.id);
    return;
  }
  const edge = current.entry;
  current.entry = null;
  if (edge && current.child) current.child.selectEdge(edge);
  else current.select(wrap.id);
}

function scheduleFocus(): void {
  const root = rootOf(group);
  root.stop?.();
  const after = !paned.value && props.focusAfter ? bar.value : null;
  const container = pane.value ?? after?.parentElement ?? null;
  const owner = group.layer;
  if (!container || !owner) {
    root.stop = null;
    return;
  }
  root.stop = focusFirstWhenReady(owner, container, after ?? undefined);
}

function select(id: string): void {
  const item = props.tabs.find((tab) => tab.id === id);
  if (!item || item.disabled === true) return;
  const asked = formDirty && props.modelValue !== id ? formDirty.beforeSwap(pane.value) : true;
  if (asked === true) swapTo(id);
  else
    void asked.then((go) => {
      if (go) swapTo(id);
    });
}

function swapTo(id: string): void {
  wanted = id;
  if (props.modelValue !== id) emit('update:modelValue', id);
  else {
    wanted = null;
    scheduleFocus();
  }
}

function selectEdge(edge: 'first' | 'last'): void {
  const open = group.openTabs();
  const tab = open[edge === 'first' ? 0 : open.length - 1];
  if (tab) select(tab.id);
}

function onPick(id: string): void {
  cancelUrlRestore();
  clearEntry(rootOf(group));
  select(id);
}

watch(
  () => props.modelValue,
  (value) => {
    if (wanted === null || value !== wanted) {
      finishRestoreIfDone();
      scheduleUrlSync();
      return;
    }
    wanted = null;
    void nextTick(() => {
      if (!group.child) group.entry = null;
      scheduleFocus();
      finishRestoreIfDone();
      scheduleUrlSync();
    });
  },
);

function nearestParent(barEl: HTMLElement | null): TabGroup | null {
  if (!barEl) return null;
  let best: TabGroup | null = null;
  for (const other of deskTabGroups) {
    const paneEl = other.paneEl;
    if (other === group || !paneEl?.contains(barEl)) continue;
    if (!best || best.paneEl?.contains(paneEl)) best = other;
  }
  return best;
}

function layerOwning(host: HTMLElement): DeskLayer | null {
  const layers = deskLayers();
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    const candidate = layers[index];
    if (candidate?.root && (candidate.root === host || candidate.root.contains(host))) return candidate;
  }
  return null;
}

function releaseKeys(): void {
  removeKeys?.();
  removeKeys = null;
}

function unlink(): void {
  deskTabGroups.delete(group);
  if (group.parent?.child === group) group.parent.child = null;
  group.parent = null;
  releaseKeys();
}

function attach(attempt: number): void {
  const host = bar.value?.closest<HTMLElement>('[data-desk-layer]') ?? pane.value?.closest<HTMLElement>('[data-desk-layer]') ?? null;
  group.host = host;
  group.paneEl = pane.value;
  group.inUrl = props.inUrl;
  deskTabGroups.add(group);
  const owner = host ? layerOwning(host) : null;
  const parent = nearestParent(bar.value);
  // The page layer assigns its root one tick after the groups mount.
  if (!owner && attempt < 2) {
    void nextTick(() => attach(attempt + 1));
    return;
  }
  group.layer = owner;
  if (group.parent?.child === group) group.parent.child = null;
  releaseKeys();
  if (parent && parent.host === host) {
    group.parent = parent;
    parent.child = group;
    const entry = parent.entry;
    parent.entry = null;
    if (entry) selectEdge(entry);
    else beginRestoreFromUrl();
    scheduleUrlSync();
    return;
  }
  group.parent = null;
  seedRestoreFromRoute();
  beginRestoreFromUrl();
  if (!owner) return;
  removeKeys = addDeskHandlers(owner, {
    'desk-tab-prev': () => step(deepest(rootOf(group)), -1),
    'desk-tab-next': () => step(deepest(rootOf(group)), 1),
  });
}

function leave(): void {
  const root = rootOf(group);
  const isRoot = root === group;
  const parent = group.parent;
  unlink();
  if (!isRoot) {
    if (parent) void nextTick(() => rootOf(parent).syncUrl());
    return;
  }
  cancelRestoreWatch();
  root.stop?.();
  root.stop = null;
  scheduleUrlSync();
}

onMounted(() => attach(0));
onActivated(() => attach(0));
onDeactivated(leave);
onUnmounted(leave);

function tabsSlug(text: string): string {
  return text.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'sections';
}

function chainOf(start: TabGroup | null): string[] {
  return start ? chainIds(start) : [];
}

useDeskAutomationNode({
  kind: 'tabs',
  name: () => tabsSlug(props.label),
  el: () => bar.value,
  read: () => ({
    label: props.label,
    active: props.modelValue,
    depth: tabDepth(group),
    chain: chainOf(rootOf(group)),
    tabs: props.tabs.map((tab) => ({
      id: tab.id,
      label: tab.label,
      active: tab.id === props.modelValue,
      disabled: tab.disabled === true,
      ...(tab.disabled === true && tab.title ? { reason: tab.title } : {}),
    })),
    childActive: group.child?.value() ?? null,
  }),
  brief: () => ({ active: props.modelValue, child: group.child?.value() ?? null }),
  ops: () => ({
    select: {
      description: 'Switch to a tab by id or label. A dirty-form guard may open a question first.',
      args: { id: { type: 'string' } },
      run: (args) => {
        const wantedId = String(args.id);
        const item = props.tabs.find((tab) => tab.id === wantedId || tab.label.trim().toLowerCase() === wantedId.trim().toLowerCase());
        if (!item) return { ok: false, error: `no tab ${wantedId}`, reason: `tabs: ${props.tabs.map((tab) => tab.id).join(', ')}` };
        if (item.disabled === true) return { ok: false, error: `${item.id} is disabled`, reason: item.title ?? '' };
        onPick(item.id);
        return { ok: true, id: item.id };
      },
    },
    next: { description: 'Ctrl+Shift+Right: next tab, inner tabs first', run: () => step(deepest(rootOf(group)), 1) },
    prev: { description: 'Ctrl+Shift+Left: previous tab, inner tabs first', run: () => step(deepest(rootOf(group)), -1) },
  }),
});
</script>