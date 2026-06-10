import OverlayApp from './OverlayApp.vue';
import { mountShadowOverlay } from '../overlay-shared/shadowMount';
import type { OverlayStateStore } from '../overlay-shared/persistence';

window.__pw_initOverlay = function (injectedScript: any) {
  if (window.__pw_overlay_loaded) return;
  window.__pw_overlay_loaded = true;

  console.log('playwright-overlay loaded');

  // The background embeds window.__pw_overlay_state just before calling __pw_initOverlay,
  // so the persisted pos/mode/events are available synchronously at mount time.
  const store: OverlayStateStore = {
    initial: window.__pw_overlay_state ?? {},
    patch(partial) {
      try {
        // window.__pw_overlay_persist__ is the CDP binding registered by RecorderController.
        window.__pw_overlay_persist__?.(JSON.stringify(partial));
      } catch {
        // CDP binding not yet available or overlay is being torn down — ignore.
      }
    },
  };

  const { destroy } = mountShadowOverlay({
    rootComponent: OverlayApp,
    provides: { injectedScript, overlayStore: store },
  });

  window.__pw_destroyOverlay = () => {
    destroy();
    window.__pw_overlay_loaded = false;
  };
};
