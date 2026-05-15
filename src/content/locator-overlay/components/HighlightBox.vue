<template>
  <div
    v-if="rect"
    class="highlight-box"
    :class="mode"
    :style="{ top: `${rect.top}px`, left: `${rect.left}px`, width: `${rect.width}px`, height: `${rect.height}px` }"
  >
    <div v-if="selector" class="highlight-label">{{ selector }}</div>
  </div>
</template>

<script setup lang="ts">
import type { Mode } from '../types.ts';

defineProps<{
  rect: DOMRect | null;
  selector: string | null;
  mode: Mode;
}>();
</script>
