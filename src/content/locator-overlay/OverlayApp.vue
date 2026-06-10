<template>
  <template v-if="enabled">
    <HighlightBox
      v-if="hoveredRect && mode === 'pick'"
      :rect="hoveredRect"
      :selector="hoveredSelector"
      :mode="mode"
    />
    <OverlayPanel :mode="mode" :modes="MODES" :badge-label="badgeLabel" @update:mode="mode = $event as Mode">
      <template #log>
        <EventLog :events="recordedEvents" />
      </template>
    </OverlayPanel>
  </template>
</template>

<script setup lang="ts">
import { inject, onMounted, ref, computed, watch } from 'vue';
import type { Mode } from './types.ts';
import HighlightBox from '../overlay-shared/components/HighlightBox.vue';
import OverlayPanel from '../overlay-shared/components/OverlayPanel.vue';
import EventLog from '../overlay-shared/components/EventLog.vue';
import type { ModeDef, RecordedEvent } from '../overlay-shared/types';
import { createSelectorGenerator } from '../locator-shared/injectedScriptFactory';
import { RecorderMessageType } from '../../../index';
import { TEST_ID_ATTRIBUTE_NAME, dispatchUserAction, type GenerateSelector } from '../locator-shared/userAction';
import { stripInternalSelector } from '../overlay-shared/selector';
import type { OverlayStateStore } from '../overlay-shared/persistence';

const MODES: ModeDef[] = [
  { id: 'record', label: 'Record', hint: 'Hold Alt (Option ⌥) and click an element to record a hover' },
  { id: 'pick', label: 'Hover', hint: 'Click an element to record a hover · Esc to exit' },
];

const BADGE_LABELS: Record<Mode, string> = {
  record: 'Recording',
  pick: 'Hover mode',
};

const { RECORDING_STATUS, USER_ACTION } = RecorderMessageType;

const host = inject<HTMLElement>('overlayHost')!;
const store = inject<OverlayStateStore>('overlayStore')!;

const enabled = ref(false);
const mode = ref<Mode>('record');
const hoveredRect = ref<DOMRect | null>(null);
const hoveredSelector = ref<string | null>(null);

const badgeLabel = computed(() => BADGE_LABELS[mode.value]);

const recordedEvents = ref<RecordedEvent[]>([]);
let eventId = 0;

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
  store.patch({ mode: newMode });
});

watch(enabled, (val) => {
  if (!val) {
    mode.value = 'record';
    clearHover();
    recordedEvents.value = [];
    eventId = 0;
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
    console.log(detail, store.initial);
    if (detail.enabled && !initialized) {
      // Read from store.initial (raw port data) rather than detail.overlayState
      // (cloneInto'd). Firefox's X-ray wrappers strip nested objects from the
      // cloned CustomEvent detail, so primitives like detail.enabled survive but
      // nested objects like detail.overlayState.events arrive opaque/empty.
      // store.initial is set from the raw message before the CustomEvent is
      // dispatched, so it bypasses cloneInto entirely.
      const saved = store.initial;
      mode.value = (saved.mode as Mode) ?? 'record';
      const savedEvents = saved.events ?? [];
      recordedEvents.value = savedEvents;
      eventId = savedEvents.length > 0 ? Math.max(...savedEvents.map((e) => e.id)) : 0;
      generateSelector = createSelectorGenerator(window, { testIdAttributeName: TEST_ID_ATTRIBUTE_NAME });
      initialized = true;
    }
    enabled.value = detail.enabled;
  });

  window.addEventListener(USER_ACTION, (event: Event) => {
    if (!enabled.value) return;
    const data = (event as CustomEvent).detail?.data;
    if (!data) return;
    const entry: RecordedEvent = {
      id: ++eventId,
      action: data.action ?? '?',
      selector: stripInternalSelector(data.rawSelector) || data.tagName?.toLowerCase() || '?',
    };
    recordedEvents.value.push(entry);
    store.patch({ events: recordedEvents.value });
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
