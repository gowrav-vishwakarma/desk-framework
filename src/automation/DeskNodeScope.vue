<template>
  <slot />
</template>

<script setup lang="ts">
import type { DeskNodeKind, DeskOpDef } from './types';
import { useDeskAutomationNode } from './registry';

/**
 * Registers a node around a slot that has no element of its own, such as the active pane of a
 * tab strip. Children inside the slot become children of this node.
 */
const props = defineProps<{
  kind: DeskNodeKind;
  name: string;
  read?: () => Record<string, unknown>;
  ops?: Record<string, DeskOpDef>;
}>();

useDeskAutomationNode({
  kind: props.kind,
  name: () => props.name,
  ...(props.read ? { read: props.read } : {}),
  ...(props.ops ? { ops: props.ops } : {}),
});
</script>
