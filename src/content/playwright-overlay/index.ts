import OverlayApp from './OverlayApp.vue';
import { mountShadowOverlay } from '../overlay-shared/shadowMount';
import { clearOverlayState, PW_OVERLAY_STATE_KEY } from '../overlay-shared/persistence';

window.__pw_initOverlay = function (injectedScript: any) {
  if (window.__pw_overlay_loaded) return;
  window.__pw_overlay_loaded = true;

  console.log('playwright-overlay loaded');

  const { destroy } = mountShadowOverlay({
    rootComponent: OverlayApp,
    provides: { injectedScript },
  });

  window.__pw_destroyOverlay = () => {
    clearOverlayState(PW_OVERLAY_STATE_KEY);
    destroy();
    window.__pw_overlay_loaded = false;
  };
};
