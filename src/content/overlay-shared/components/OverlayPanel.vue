<template>
  <div
    ref="panelRef"
    class="panel"
    :style="pos ? { left: pos.x + 'px', top: pos.y + 'px', right: 'auto', bottom: 'auto' } : {}"
  >
    <div class="grip" @pointerdown="onGripDown">⠿</div>
    <RecordingBadge :mode="mode" :label="badgeLabel" />
    <div class="separator" />
    <ModeToolbar :model-value="mode" :modes="modes" @update:model-value="$emit('update:mode', $event)" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { ModeDef } from '../types.ts';
import RecordingBadge from './RecordingBadge.vue';
import ModeToolbar from './ModeToolbar.vue';
import { useDraggable } from '../composables/useDraggable';

defineProps<{
  mode: string;
  modes: ModeDef[];
  badgeLabel: string;
}>();

defineEmits<{ 'update:mode': [mode: string] }>();

const panelRef = ref<HTMLElement | null>(null);
const { pos, onGripDown } = useDraggable(panelRef);
</script>
