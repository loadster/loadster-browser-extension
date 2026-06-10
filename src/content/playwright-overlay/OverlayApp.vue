<template>
  <HighlightBox v-if="state.hoveredRect" :rect="state.hoveredRect" :selector="state.hoveredSelector" :mode="state.mode" />
  <OverlayPanel v-if="isTopFrame" :mode="state.mode" :modes="MODES" :badge-label="badgeLabel" @update:mode="state.mode = $event as Mode">
    <template #log>
      <EventLog :events="recordedEvents" />
    </template>
  </OverlayPanel>
</template>

<script setup lang="ts">
import { inject, onMounted, reactive, computed, ref, watch } from 'vue';
import type { Mode, OverlayState } from './types';
import HighlightBox from '../overlay-shared/components/HighlightBox.vue';
import OverlayPanel from '../overlay-shared/components/OverlayPanel.vue';
import EventLog from '../overlay-shared/components/EventLog.vue';
import type { ModeDef, RecordedEvent } from '../overlay-shared/types';
import { stripInternalSelector } from '../overlay-shared/selector';
import type { OverlayStateStore } from '../overlay-shared/persistence';

const MODES: ModeDef[] = [
  { id: 'record', label: 'Record' },
  { id: 'assertVisible', label: 'Visible', hint: "Click an element to assert it's visible" },
  { id: 'assertText', label: 'Text', hint: 'Click an element to assert its text' },
  { id: 'assertValue', label: 'Value', hint: 'Click an input to assert its value' },
];

const BADGE_LABELS: Record<Mode, string> = {
  record: 'Recording',
  assertVisible: 'Assert Visible',
  assertText: 'Assert Text',
  assertValue: 'Assert Value',
};

const isTopFrame = window === window.top;

const injectedScript = inject<any>('injectedScript')!;
const host = inject<HTMLElement>('overlayHost')!;
const store = inject<OverlayStateStore>('overlayStore')!;

const _saved = isTopFrame ? store.initial : {};
const state = reactive<OverlayState>({
  mode: ((_saved.mode as Mode) ?? 'record'),
  hoveredRect: null,
  hoveredSelector: null,
});

const badgeLabel = computed(() => BADGE_LABELS[state.mode]);

const recordedEvents = ref<RecordedEvent[]>(isTopFrame ? (_saved.events ?? []) : []);
let eventId = recordedEvents.value.length > 0
  ? Math.max(...recordedEvents.value.map((e) => e.id))
  : 0;

function pushEvent(action: string, selector: string): void {
  if (isTopFrame) {
    recordedEvents.value.push({ id: ++eventId, action, selector: stripInternalSelector(selector) });
    store.patch({ events: recordedEvents.value });
  } else {
    window.top?.postMessage({ __pw_recorder_event: { action, selector } }, '*');
  }
}

// Top frame broadcasts mode changes; iframes listen and sync their local mode.
// Top frame also receives recorded-event messages forwarded from iframes.
if (isTopFrame) {
  watch(
    () => state.mode,
    (newMode) => {
      broadcastMode(window, newMode);
      store.patch({ mode: newMode });
    },
  );
  window.addEventListener('message', (e) => {
    const ev = e.data?.__pw_recorder_event;
    if (ev && typeof ev.action === 'string' && typeof ev.selector === 'string') {
      recordedEvents.value.push({ id: ++eventId, action: ev.action, selector: stripInternalSelector(ev.selector) });
    }
  });
} else {
  window.addEventListener('message', (e) => {
    if (e.data && typeof e.data.__pw_recorder_mode === 'string') {
      state.mode = e.data.__pw_recorder_mode as Mode;
    }
  });
}

function broadcastMode(win: Window, mode: Mode): void {
  for (let i = 0; i < win.frames.length; i++) {
    try {
      win.frames[i].postMessage({ __pw_recorder_mode: mode }, '*');
      broadcastMode(win.frames[i], mode);
    } catch {
      // sandboxed or cross-origin frame that disallows postMessage
    }
  }
}

// Walk from the current frame up to the top, collecting selectors for each <iframe> element.
// Same-origin only — cross-origin frames have frameElement === null.
function computeFramePath(): string[] {
  const path: string[] = [];
  let current: Window = window;
  while (current !== current.top) {
    try {
      const frameEl = current.frameElement;
      if (!frameEl) break;
      const parentInjected = (current.parent as any).__pw_injectedScript;
      if (!parentInjected) break;
      const selector = parentInjected.generateSelector(frameEl, { testIdAttributeName: 'data-testid', multiple: false }).selector;
      path.push(selector);
    } catch {
      break;
    }
    current = current.parent;
  }
  path.reverse();
  return path;
}

function getSelector(el: Element): string | null {
  try {
    return injectedScript.generateSelector(el, { testIdAttributeName: 'data-testid', multiple: false }).selector;
  } catch {
    return null;
  }
}

function sendAction(action: object) {
  try {
    const framePath = computeFramePath();
    window.__pw_overlay_action__(JSON.stringify({ ...action, framePath }));
  } catch {}
  const { name, selector } = action as { name?: string; selector?: string };
  if (name && selector) pushEvent(name, selector);
}

// Events from inside a closed shadow DOM are retargeted to the host element,
// so checking host.contains(el) || el === host catches all overlay interactions.
function isSelf(el: EventTarget | null): boolean {
  return el instanceof Node && (el === host || host.contains(el));
}

onMounted(() => {
  // Broadcast the restored mode to any already-loaded same-origin iframes.
  if (isTopFrame && state.mode !== 'record') {
    broadcastMode(window, state.mode);
  }

  document.addEventListener(
    'mousemove',
    (e) => {
      const el = e.target as Element;
      if (isSelf(el)) return;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        state.hoveredRect = null;
        return;
      }
      state.hoveredRect = rect;
      state.hoveredSelector = getSelector(el);
    },
    { capture: true, passive: true },
  );

  document.addEventListener(
    'mouseleave',
    () => {
      state.hoveredRect = null;
    },
    { capture: true, passive: true },
  );

  document.addEventListener(
    'click',
    (e) => {
      if (isSelf(e.target)) return;
      const el = e.target as HTMLElement;
      const selector = getSelector(el);
      if (!selector) return;

      if (state.mode === 'record') {
        sendAction({ name: 'click', selector, signals: [] });
        return;
      }

      // In assert modes, prevent default navigation/action
      e.preventDefault();
      e.stopPropagation();

      if (state.mode === 'assertVisible') {
        sendAction({ name: 'assertVisible', selector, signals: [] });
      } else if (state.mode === 'assertText') {
        const text = (el.innerText || el.textContent || '').trim().substring(0, 1000);
        sendAction(text ? { name: 'assertText', selector, text, signals: [] } : { name: 'assertVisible', selector, signals: [] });
      } else if (state.mode === 'assertValue') {
        const inputEl = el as HTMLInputElement;
        const inputType = (inputEl.type || '').toLowerCase();
        if (inputType === 'checkbox' || inputType === 'radio') {
          sendAction({ name: 'assertChecked', selector, checked: !!inputEl.checked, signals: [] });
        } else if ('value' in el) {
          sendAction({ name: 'assertValue', selector, value: inputEl.value || '', signals: [] });
        } else {
          sendAction({ name: 'assertVisible', selector, signals: [] });
        }
      }
    },
    { capture: true },
  );

  document.addEventListener(
    'change',
    (e) => {
      if (state.mode !== 'record') return;
      const el = e.target as HTMLInputElement;
      if (!el || isSelf(el)) return;
      const selector = getSelector(el);
      if (!selector) return;
      const type = (el.type || '').toLowerCase();
      const tag = el.tagName;
      if (type === 'checkbox') {
        sendAction({ name: el.checked ? 'check' : 'uncheck', selector, signals: [] });
      } else if (type === 'radio') {
        if (el.checked) sendAction({ name: 'check', selector, signals: [] });
      } else if (tag === 'SELECT') {
        const selectEl = el as unknown as HTMLSelectElement;
        const opts = Array.from(selectEl.selectedOptions || []);
        sendAction({ name: 'selectOption', selector, options: opts.map((o) => ({ value: o.value })), signals: [] });
      } else {
        sendAction({ name: 'fill', selector, text: el.value || '', signals: [] });
      }
    },
    { capture: true },
  );
});
</script>
