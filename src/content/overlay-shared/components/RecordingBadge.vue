<template>
  <div class="badge">
    <span class="dot" :class="mode" />
    <span>{{ label }}</span>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  mode: string;
  label: string;
}>();
</script>
