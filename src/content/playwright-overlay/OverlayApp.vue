<template>
  <HighlightBox v-if="state.hoveredRect" :rect="state.hoveredRect" :selector="state.hoveredSelector" :mode="state.mode" />
  <RecordingBadge v-if="isTopFrame" :mode="state.mode" />
  <ModeToolbar v-if="isTopFrame" v-model="state.mode" />
</template>

<script setup lang="ts">
import { inject, onMounted, reactive, watch } from 'vue';
import type { Mode, OverlayState } from './types';
import HighlightBox from './components/HighlightBox.vue';
import RecordingBadge from './components/RecordingBadge.vue';
import ModeToolbar from './components/ModeToolbar.vue';

const isTopFrame = window === window.top;

const state = reactive<OverlayState>({ mode: 'record', hoveredRect: null, hoveredSelector: null });
const injectedScript = inject<any>('injectedScript')!;
const host = inject<HTMLElement>('overlayHost')!;

// Top frame broadcasts mode changes; iframes listen and sync their local mode.
if (isTopFrame) {
  watch(
    () => state.mode,
    (newMode) => broadcastMode(window, newMode),
  );
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
}

// Events from inside a closed shadow DOM are retargeted to the host element,
// so checking host.contains(el) || el === host catches all overlay interactions.
function isSelf(el: EventTarget | null): boolean {
  return el instanceof Node && (el === host || host.contains(el));
}

onMounted(() => {
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
