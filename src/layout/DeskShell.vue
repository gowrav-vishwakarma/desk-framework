<template>
  <q-layout view="hHh lpR fFf" class="desk-shell">
    <q-header class="desk-top" elevated>
      <slot name="header" />
    </q-header>
    <q-page-container>
      <slot name="bar" />
      <div class="desk-body">
        <slot />
      </div>
      <slot name="status" />
    </q-page-container>
    <slot name="overlay" />
  </q-layout>
</template>

<script setup lang="ts">
import '../theme/desk-tokens.css';
import '../theme/desk-grid.css';
import '../theme/desk-form-layout.css';
import '../theme/themes';
import '../theme/deskFontSize';
import { useDeskShellLayer } from './useDeskShellLayer';

// The shell owns the field-move and section-jump keys, so any host that mounts it gets them.
useDeskShellLayer();
</script>

<style scoped>
.desk-shell {
  background: var(--desk-row-bg, #fff);
  color: var(--desk-text, #212529);
  /* Stay one viewport tall. The header is fixed, so the page container's padding
     already clears it. A fixed subtraction (header 32, bar 33, status 25) was
     short of the real chrome and left a window scrollbar on an empty page. */
  height: 100vh;
  max-height: 100vh;
  overflow: hidden;
}
.desk-top {
  background: var(--desk-header-bg, #e9ecef);
  color: var(--desk-text, #212529);
  overflow: visible;
  backdrop-filter: blur(var(--desk-chrome-blur, 0px));
}
.desk-shell :deep(.q-page-container) {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
}
.desk-body {
  flex: 1 1 0;
  min-height: 0;
  overflow: auto;
}
</style>
