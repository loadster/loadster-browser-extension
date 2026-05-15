<template>
  <div class="toolbar">
    <button
      v-for="m in MODES"
      :key="m.id"
      class="btn"
      :class="{ active: modelValue === m.id, [m.id]: true }"
      @click.stop.prevent="$emit('update:modelValue', m.id)"
    >
      {{ m.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
import type { Mode } from '../types.ts';

defineProps<{ modelValue: Mode }>();
defineEmits<{ 'update:modelValue': [mode: Mode] }>();

const MODES: { id: Mode; label: string }[] = [
  { id: 'record', label: 'Record' },
  { id: 'pick', label: 'Pick' },
];
</script>
