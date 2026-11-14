<template>
  <DeskConfirmDialog
    v-if="request"
    v-model:open="shown"
    :title="request.title"
    :message="request.message"
    :details="request.details"
    :yes-label="request.okLabel"
    :no-label="request.cancelLabel"
    v-bind="request.tone ? { tone: request.tone } : {}"
    @yes="finish(true)"
    @no="finish(false)"
  />
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import DeskConfirmDialog from './DeskConfirmDialog.vue';
import { answerDeskConfirm, deskConfirmAsked } from './confirm';

/** The one confirm every host shows. Mount it once, next to `DeskLeaveDialog`. */
const request = deskConfirmAsked;
const shown = ref(false);

watch(
  request,
  (next) => {
    shown.value = next !== null;
  },
  { immediate: true },
);

watch(shown, (open) => {
  if (!open && request.value) answerDeskConfirm(false);
});

function finish(ok: boolean): void {
  answerDeskConfirm(ok);
}
</script>
