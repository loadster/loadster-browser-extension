<template>
  <div
    ref="panelRef"
    class="panel"
    @mousedown.prevent.stop
    @pointerdown.stop
    :style="pos ? { left: pos.x + 'px', top: pos.y + 'px', right: 'auto', bottom: 'auto' } : {}"
  >
    <div class="grip" @pointerdown="onGripDown">⠿</div>
    <RecordingBadge :mode="mode" :label="badgeLabel" />
    <div class="separator" />
    <ModeToolbar :model-value="mode" :modes="modes" @update:model-value="$emit('update:mode', $event)" />
    <div v-if="activeHint" class="help" tabindex="0" aria-label="Help">
      ?
      <div class="help-popover">{{ activeHint }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { ModeDef } from '../types.ts';
import RecordingBadge from './RecordingBadge.vue';
import ModeToolbar from './ModeToolbar.vue';
import { useDraggable } from '../composables/useDraggable';

const props = defineProps<{
  mode: string;
  modes: ModeDef[];
  badgeLabel: string;
}>();

defineEmits<{ 'update:mode': [mode: string] }>();

const panelRef = ref<HTMLElement | null>(null);
const { pos, onGripDown } = useDraggable(panelRef);

const activeHint = computed(() => props.modes.find((m) => m.id === props.mode)?.hint ?? null);
</script>
