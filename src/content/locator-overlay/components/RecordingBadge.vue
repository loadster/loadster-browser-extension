<template>
  <div class="badge">
    <span class="dot" :class="mode" />
    <span>{{ badgeText }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Mode } from '../types.ts';

const props = defineProps<{ mode: Mode }>();

const badgeText = computed(() => {
  const labels: Record<Mode, string> = {
    record: 'Recording',
    pick: 'Pick mode',
  };
  return labels[props.mode];
});
</script>
