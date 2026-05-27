<template>
  <div
    v-if="rect"
    class="highlight-box"
    :class="mode"
    :style="{ width: `${rect.width}px`, height: `${rect.height}px`, transform: `translate(${rect.left}px, ${rect.top}px)` }"
  >
    <div v-if="selector" class="highlight-label">{{ selector }}</div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  rect: DOMRect | null;
  selector: string | null;
  mode: string;
}>();
</script>
