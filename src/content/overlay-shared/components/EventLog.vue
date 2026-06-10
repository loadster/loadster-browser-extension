<template>
  <div v-if="events.length" class="event-log-wrap">
    <button
      class="event-log-toggle"
      :title="collapsed ? 'Expand' : 'Collapse'"
      @click.stop="collapsed = !collapsed"
      @mousedown.stop
      @pointerdown.stop
    >
      <span :style="collapsed ? 'transform: rotate(180deg)' : ''">▾</span>
<!--      {{ collapsed ?  '▾' }}-->
    </button>
    <div v-show="!collapsed" ref="logEl" class="event-log">
      <div v-for="ev in events" :key="ev.id" class="event-row">
        <span class="event-chip" :class="ev.action">{{ ev.action }}</span>
        <span class="event-selector">{{ ev.selector }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import type { RecordedEvent } from '../types.ts';

const props = defineProps<{ events: RecordedEvent[] }>();

const collapsed = ref(false);
const logEl = ref<HTMLElement | null>(null);

watch(
  () => props.events.length,
  () => {
    if (collapsed.value) return;
    nextTick(() => {
      const el = logEl.value;
      if (el) el.scrollTop = el.scrollHeight;
    });
  },
);
</script>
