<template>
  <div class="toolbar">
    <button
      v-for="m in modes"
      :key="m.id"
      class="btn"
      :class="{ active: modelValue === m.id, [m.id]: true }"
      :title="m.hint"
      @click.stop.prevent="$emit('update:modelValue', m.id)"
    >
      {{ m.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
import type { ModeDef } from '../types.ts';

defineProps<{ modelValue: string; modes: ModeDef[] }>();
defineEmits<{ 'update:modelValue': [mode: string] }>();
</script>
