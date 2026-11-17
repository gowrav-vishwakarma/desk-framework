<template>
  <DeskDialog name="leave" front :open="deskLeaveAsked" initial-focus="leave-keep" @close="answerDeskLeave(false)">
    <h3>Unsaved changes</h3>
    <p v-if="deskLeaveSave">{{ deskLeaveWhat }} has changes that are not saved. Save them now, keep editing, or lose them.</p>
    <p v-else>{{ deskLeaveWhat }} has changes that are not saved. Keep editing, then save with Ctrl+S or the Save button.</p>
    <button type="button" data-desk-field="leave-keep" @click="answerDeskLeave(false)">Keep editing</button>
    <button v-if="deskLeaveSave" type="button" data-desk-field="leave-save" @click="saveAndLeave">Save</button>
    <button type="button" data-desk-field="leave-lose" @click="answerDeskLeave(true)">Lose changes</button>
  </DeskDialog>
</template>

<script setup lang="ts">
import DeskDialog from './DeskDialog.vue';
import { answerDeskLeave, deskLeaveAsked, deskLeaveSave, deskLeaveWhat, saveAndLeave } from './leaveGuard';

/** The one question every host asks before dirty work is dropped. It saves only when the asker offered a save. */
</script>
