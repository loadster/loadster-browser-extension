<template>
  <template v-if="enabled">
    <HighlightBox
      v-if="hoveredRect && mode === 'pick'"
      :rect="hoveredRect"
      :selector="hoveredSelector"
      :mode="mode"
    />
    <OverlayPanel :mode="mode" :modes="MODES" :badge-label="badgeLabel" @update:mode="mode = $event as Mode" />
  </template>
</template>

<script setup lang="ts">
import { inject, onMounted, ref, computed, watch } from 'vue';
import type { Mode } from './types.ts';
import HighlightBox from '../overlay-shared/components/HighlightBox.vue';
import OverlayPanel from '../overlay-shared/components/OverlayPanel.vue';
import type { ModeDef } from '../overlay-shared/types';
import { createSelectorGenerator } from '../locator-shared/injectedScriptFactory';
import { RecorderMessageType } from '../../../index';
import { TEST_ID_ATTRIBUTE_NAME, dispatchUserAction, type GenerateSelector } from '../locator-shared/userAction';

const MODES: ModeDef[] = [
  { id: 'record', label: 'Record', hint: 'Hold Alt (Option ⌥) and click an element to record a hover' },
  { id: 'pick', label: 'Hover', hint: 'Click an element to record a hover · Esc to exit' },
];

const BADGE_LABELS: Record<Mode, string> = {
  record: 'Recording',
  pick: 'Hover mode',
};

const { RECORDING_STATUS } = RecorderMessageType;

const host = inject<HTMLElement>('overlayHost')!;

const enabled = ref(false);
const mode = ref<Mode>('record');
const hoveredRect = ref<DOMRect | null>(null);
const hoveredSelector = ref<string | null>(null);

const badgeLabel = computed(() => BADGE_LABELS[mode.value]);

let lastHoveredEl: Element | null = null;
let rafPending = false;
let pendingEl: Element | null = null;
let generateSelector: GenerateSelector | null = null;
let initialized = false;
let momentaryHover = false;

function clearHover() {
  hoveredRect.value = null;
  hoveredSelector.value = null;
  lastHoveredEl = null;
  pendingEl = null;
}

watch(mode, (newMode) => {
  if (newMode !== 'pick') clearHover();
});

watch(enabled, (val) => {
  if (!val) {
    mode.value = 'record';
    clearHover();
  }
});

function isSelf(el: EventTarget | null): boolean {
  return el instanceof Node && (el === host || host.contains(el));
}

function computeSelector(el: Element): string | null {
  if (!generateSelector) return null;
  try {
    return generateSelector(el, { testIdAttributeName: TEST_ID_ATTRIBUTE_NAME }).selector;
  } catch {
    return null;
  }
}

function emitHoverAction(el: Element) {
  if (!generateSelector) return;
  try {
    dispatchUserAction({ element: el, action: 'hover', generateSelector });
  } catch {}
}

onMounted(() => {
  window.addEventListener(RECORDING_STATUS, (event: Event) => {
    const detail = (event as CustomEvent).detail;
    enabled.value = detail.enabled;
    if (detail.enabled && !initialized) {
      generateSelector = createSelectorGenerator(window, { testIdAttributeName: TEST_ID_ATTRIBUTE_NAME });
      initialized = true;
    }
  });

  document.addEventListener('mousemove', (e: MouseEvent) => {
    if (!enabled.value || mode.value !== 'pick') return;
    const el = e.target as Element;
    if (!el || isSelf(el) || !(el instanceof Element)) return;
    pendingEl = el;
    if (!rafPending) {
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        const target = pendingEl;
        if (!target || target === lastHoveredEl) return;
        lastHoveredEl = target;
        const rect = target.getBoundingClientRect();
        hoveredRect.value = rect.width === 0 && rect.height === 0 ? null : rect;
        hoveredSelector.value = computeSelector(target);
      });
    }
  }, { capture: true, passive: true });

  document.addEventListener('mouseleave', () => {
    if (mode.value === 'pick') clearHover();
  }, { capture: true, passive: true });

  document.addEventListener('click', (e: MouseEvent) => {
    if (!enabled.value || mode.value !== 'pick') return;
    const el = e.target as Element;
    if (!el || isSelf(el) || !(el instanceof Element)) return;
    e.stopPropagation();
    e.preventDefault();
    emitHoverAction(el);
  }, { capture: true });

  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape' && mode.value === 'pick') {
      mode.value = 'record';
      momentaryHover = false;
      return;
    }
    // Spring-loaded Alt: hold to temporarily enter Hover mode; release to return to Record.
    if (e.key === 'Alt' && !e.repeat && enabled.value && mode.value === 'record') {
      mode.value = 'pick';
      momentaryHover = true;
    }
  }, { capture: true });

  document.addEventListener('keyup', (e: KeyboardEvent) => {
    if (e.key === 'Alt' && momentaryHover) {
      mode.value = 'record';
      momentaryHover = false;
    }
  }, { capture: true });

  // Safety reset: if Alt is released while focus leaves the window (e.g. Alt-Tab), snap back.
  window.addEventListener('blur', () => {
    if (momentaryHover) {
      mode.value = 'record';
      momentaryHover = false;
    }
  });
});
</script>
