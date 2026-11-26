<template>
  <div class="gallery" @keydown="onKey">
    <div class="pick-search">
      <StudioIcon name="search" />
      <input
        v-model="query"
        type="search"
        data-autofocus
        placeholder="What should the next step do? (filter, total, running…)"
        spellcheck="false"
        autocomplete="off"
      />
    </div>
    <div class="gallery-groups">
      <section v-for="group in groups" :key="group.name" class="gallery-group">
        <h4>{{ group.name }}</h4>
        <button
          v-for="info in group.kinds"
          :key="info.kind"
          type="button"
          class="gallery-item"
          :class="{
            on: info.kind === activeKind,
            off: needsInput === true && info.kind !== 'source',
          }"
          :disabled="needsInput === true && info.kind !== 'source'"
          :title="needsInput && info.kind !== 'source' ? 'Read some records first' : info.help"
          @mousemove="activeKind = info.kind"
          @click="emit('pick', info.kind)"
        >
          <span class="flow-badge" :class="`tone-${GROUP_TONE[info.group]}`"
            ><StudioIcon :name="info.icon"
          /></span>
          <span class="gallery-text">
            <strong>{{ info.label }}</strong>
            <span>{{ info.help }}</span>
            <em>e.g. {{ info.example }}</em>
          </span>
        </button>
      </section>
      <p v-if="!groups.length" class="pick-empty">No step matches "{{ query }}".</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { GROUP_TONE } from './pickItems';
import { STEP_GROUPS, stepKinds, type StepKind } from './steps';
import StudioIcon from './StudioIcon.vue';

/** Every kind of step, grouped by what it is for, with an example each. `needsInput`: only "Read records" makes sense yet. */
const props = withDefaults(defineProps<{ needsInput?: boolean | undefined }>(), {
  needsInput: false,
});
const emit = defineEmits<{ pick: [kind: StepKind] }>();

const query = ref('');

const matches = computed(() => {
  const q = query.value.trim().toLowerCase();
  return stepKinds().filter(
    (info) =>
      !q || `${info.label} ${info.help} ${info.example} ${info.group}`.toLowerCase().includes(q),
  );
});

const groups = computed(() =>
  STEP_GROUPS.map((name) => ({
    name,
    kinds: matches.value.filter((info) => info.group === name),
  })).filter((group) => group.kinds.length),
);

const usable = computed(() =>
  matches.value.filter((info) => !props.needsInput || info.kind === 'source'),
);
const activeKind = ref<StepKind | null>(null);
watch(usable, (list) => (activeKind.value = list[0]?.kind ?? null), { immediate: true });

function onKey(event: KeyboardEvent): void {
  const list = usable.value;
  const at = list.findIndex((info) => info.kind === activeKind.value);
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    const next = list[(at + (event.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length];
    if (next) activeKind.value = next.kind;
  } else if (event.key === 'Enter' && activeKind.value) {
    emit('pick', activeKind.value);
  } else return;
  event.preventDefault();
  event.stopPropagation();
}
</script>
