<template>
  <div ref="root" class="desk-page-layer" data-desk-layer>
    <slot />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRoute } from 'vue-router';
import { deskHost } from '../host';
import { childrenOf, liveDeskNodes, opsOf, useDeskAutomationNode } from '../automation/registry';
import type { DeskNode } from '../automation/types';
import { readNode } from '../automation/snapshot';
import { pendingDeskWork } from '../automation/busy';
import { deskKeyLabel } from '../keys/deskKeymap';
import { deskLayers, runDeskAction } from '../keys/layers';
import { provideDeskLayer } from '../keys/useDeskLayer';

/** Every routed desk page gets its own key and focus layer, and initial focus on open. */
const props = defineProps<{ name?: string }>();
const root = ref<HTMLElement | null>(null);
const layer = provideDeskLayer({ root });
const route = useRoute();

function pageName(): string {
  if (props.name) return props.name;
  const parts = route.path.split('/').filter(Boolean);
  return parts.filter((part) => !/^\d+$/.test(part)).slice(-2).join('-') || 'page';
}

function actions(): { id: string; label: string; keys: string }[] {
  const seen = new Set<string>();
  const out: { id: string; label: string; keys: string }[] = [];
  for (const item of [...deskLayers()].reverse()) {
    for (const id of item.handlers.keys()) {
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ id, label: deskHost().label(id), keys: deskKeyLabel(id) });
    }
    if (item.modal) break;
  }
  return out;
}

interface ToolbarButton {
  id: string;
  label?: string;
  disabled?: boolean;
  visible?: boolean;
}

function descendants(node: DeskNode): DeskNode[] {
  return childrenOf(node).flatMap((child) => [child, ...descendants(child)]);
}

/** Toolbars on this page (its header, panels) and the desk-wide function-key bar. */
function toolbars(): DeskNode[] {
  const own = page.node ? descendants(page.node).filter((node) => node.kind === 'toolbar') : [];
  const global = liveDeskNodes().filter((node) => node.kind === 'toolbar' && node.parent === null);
  return [...own, ...global];
}

function buttons(): { toolbar: string; id: string; label: string }[] {
  return toolbars().flatMap((bar) =>
    ((readNode(bar).buttons ?? []) as ToolbarButton[])
      .filter((button) => button.visible !== false && button.disabled !== true)
      .map((button) => ({ toolbar: bar.path(), id: button.id, label: button.label ?? button.id })),
  );
}

/** What every component on the page can do. Fields are left out: `fields` lists them with their paths. */
function componentOps(): { path: string; kind: string; ops: { name: string; description: string }[] }[] {
  if (!page.node) return [];
  return descendants(page.node)
    .filter((node) => node.kind !== 'field' && node.kind !== 'toolbar')
    .map((node) => ({ path: node.path(), kind: node.kind, ops: Object.entries(opsOf(node)).map(([name, def]) => ({ name, description: def.description })) }))
    .filter((entry) => entry.ops.length > 0);
}

const MESSAGE_SELECTOR = '.desk-error, .desk-note, [role="alert"], [class*="-empty"], [class*="-message"]';

/** What a person reads on the page besides its nodes: the title and any error, note or empty-state text. */
function pageText(): { title: string | null; messages: string[] } {
  const el = root.value;
  if (!el) return { title: null, messages: [] };
  const title = el.querySelector('h1, .desk-page-header__title')?.textContent?.trim() ?? null;
  const messages = [...el.querySelectorAll<HTMLElement>(MESSAGE_SELECTOR)]
    .filter((item) => item.getClientRects().length > 0)
    .map((item) => (item.textContent ?? '').replace(/\s+/g, ' ').trim())
    .filter((text, index, all) => text !== '' && all.indexOf(text) === index)
    .slice(0, 10);
  return { title, messages };
}

function everything() {
  return { buttons: buttons(), keys: actions(), components: componentOps() };
}

function press(target: string): unknown {
  const wanted = target.trim().toLowerCase();
  for (const bar of toolbars()) {
    const list = (readNode(bar).buttons ?? []) as ToolbarButton[];
    const hit = list.find((button) => button.id.toLowerCase() === wanted || (button.label ?? '').toLowerCase() === wanted);
    if (hit) return opsOf(bar).press?.run({ id: hit.id });
  }
  const key = actions().find((item) => item.id.toLowerCase() === wanted || item.label.toLowerCase() === wanted);
  if (key && runDeskAction(key.id)) return { ok: true, pressed: key.id };
  const all = buttons().map((button) => `${button.id} (${button.label})`);
  return { ok: false, error: `nothing on this page is called ${target}`, reason: `buttons: ${all.join(' | ') || 'none'}; keys: ${actions().map((item) => item.id).join(', ')}; component ops: call op actions` };
}

const page = useDeskAutomationNode({
  kind: 'page',
  name: pageName,
  el: () => (root.value?.firstElementChild instanceof HTMLElement ? root.value.firstElementChild : null),
  read: () => ({ route: route.fullPath, ...pageText(), loading: pendingDeskWork().count > 0, buttons: buttons(), actions: actions(), layerHandlers: [...layer.handlers.keys()] }),
  brief: () => ({ route: route.fullPath, ...pageText() }),
  ops: () => ({
    actions: {
      description: "Everything this page offers: its buttons (header and toolbars), its key actions, and each component's ops by path",
      run: () => everything(),
    },
    press: {
      description: 'Press a page button or key action by id or label, the same as a click or the key',
      args: { id: { type: 'string', description: 'button or action id, or its label' } },
      run: (args) => press(String(args.id)),
    },
    run: {
      description: 'Run a layer action by id, through the same stack a key press uses',
      args: { action: { type: 'string' } },
      run: (args) => (runDeskAction(String(args.action)) ? { ok: true } : { ok: false, error: `no layer handles ${String(args.action)} right now`, reason: `actions: ${actions().map((item) => item.id).join(', ')}` }),
    },
  }),
});
</script>

<style scoped>
.desk-page-layer {
  display: contents;
}
</style>
