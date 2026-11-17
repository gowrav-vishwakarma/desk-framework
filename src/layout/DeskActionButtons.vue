<template>
  <button
    v-for="action in actions"
    :key="action.name"
    type="button"
    :class="deskActionClass(action)"
    :disabled="action.disabled"
    :data-desk-denied="action.denied ? 'true' : undefined"
    :data-desk-action="action.buttonId"
    v-bind="action.title ? { title: action.title } : {}"
    @click="emit('run', action.name)"
  >
    {{ action.label }}
  </button>
</template>

<script setup lang="ts">
import { deskActionClass } from '../grid/actionClass';
import type { DeskRowAction } from '../grid/types';

/**
 * A page header's action buttons (Add New, Import …): disabled with the reason as tooltip when the action is not
 * available, in the theme's denied colours when the user was not given the right.
 */
defineProps<{ actions: readonly DeskRowAction[] }>();
const emit = defineEmits<{ run: [name: string] }>();
</script>
