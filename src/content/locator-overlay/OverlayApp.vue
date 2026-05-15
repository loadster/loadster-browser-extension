<template>
  <template v-if="enabled">
    <HighlightBox
      v-if="hoveredRect && mode === 'pick'"
      :rect="hoveredRect"
      :selector="hoveredSelector"
      :mode="mode"
    />
    <RecordingBadge :mode="mode" />
    <ModeToolbar v-model="mode" />
  </template>
</template>

<script setup lang="ts">
import { inject, onMounted, ref, watch } from 'vue';
import type { Mode } from './types.ts';
import HighlightBox from './components/HighlightBox.vue';
import RecordingBadge from './components/RecordingBadge.vue';
import ModeToolbar from './components/ModeToolbar.vue';
import { createSelectorGenerator } from '@mizchi/selector-generator';
import { createMessage } from '../../utils/messagingUtils.js';
import { RecorderMessageType } from '../../../index';
import { adaptSelector, includeElementAttributes } from '../locator-shared/selectorAdapter';

const { RECORDING_STATUS, USER_ACTION } = RecorderMessageType;

const host = inject<HTMLElement>('overlayHost')!;

const enabled = ref(false);
const mode = ref<Mode>('record');
const hoveredRect = ref<DOMRect | null>(null);
const hoveredSelector = ref<string | null>(null);

let lastHoveredEl: Element | null = null;
let rafPending = false;
let pendingEl: Element | null = null;
let generateSelector: ((el: Element, opts: any) => any) | null = null;
let initialized = false;

const testIdAttributeName = 'data-testid';

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
    return generateSelector(el, { testIdAttributeName }).selector;
  } catch {
    return null;
  }
}

function emitHoverAction(el: Element) {
  if (!generateSelector) return;
  try {
    const raw = generateSelector(el, { testIdAttributeName });
    const locators = adaptSelector(raw.selector);
    const msg = {
      timestamp: Date.now(),
      action: 'hover',
      locators,
      value: (el as HTMLInputElement).value,
      tagName: el.tagName,
      rawSelector: raw.selector,
      rawSelectors: raw.selectors,
      element: raw.selector,
      selectors: raw.selectors,
      attrs: includeElementAttributes(el),
      keyboard: { alt: false, shift: false, ctrl: false, meta: false },
      textContent: el.textContent,
      href: (el as HTMLAnchorElement).href || null,
    };
    window.top!.dispatchEvent(new CustomEvent(USER_ACTION, {
      detail: createMessage({ action: msg.action, data: msg })
    }));
  } catch {}
}

onMounted(() => {
  window.addEventListener(RECORDING_STATUS, (event: Event) => {
    const detail = (event as CustomEvent).detail;
    enabled.value = detail.enabled;
    if (detail.enabled && !initialized) {
      generateSelector = createSelectorGenerator(window, false, 'javascript', testIdAttributeName);
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
    }
  }, { capture: true });
});
</script>
