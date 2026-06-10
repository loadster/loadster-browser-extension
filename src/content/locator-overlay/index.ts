import browser from 'webextension-polyfill';
import OverlayApp from './OverlayApp.vue';
import { mountShadowOverlay } from '../overlay-shared/shadowMount';
import { RecorderMessageType } from '../../../index';
import { createMessage } from '../../utils/messagingUtils.js';
import type { OverlayStateStore, PersistedOverlayState } from '../overlay-shared/persistence';

const { RECORDING_STATUS, USER_ACTION, ENDPOINT_PAGE_CONNECT, OVERLAY_STATE } = RecorderMessageType;

if (window.loadsterContentLoaded !== true) {
  window.loadsterContentLoaded = true;

  let port: browser.Runtime.Port | null = null;
  let lastStatusMessage: { type: string; data: unknown } | null = null;

  // The store is provided to the Vue app. `initial` is populated with the
  // background's persisted state before the panel mounts (before enabled=true),
  // so useDraggable and the overlay app can read it synchronously at setup time.
  // `patch` uses the current port via closure, so reconnects are transparent.
  const store: OverlayStateStore = {
    initial: {},
    patch(partial: Partial<PersistedOverlayState>) {
      try {
        // Strip Vue reactive Proxies before crossing the port: Firefox's structured-clone
        // throws DataCloneError on a Proxy (Chrome reads through it), which would otherwise
        // be swallowed here and silently drop the patch. JSON is safe — overlay state is
        // pure data.
        port?.postMessage({ type: OVERLAY_STATE, data: JSON.parse(JSON.stringify(partial)) });
      } catch {
        // ignore disconnected port
      }
    },
  };

  function onUserAction(event: Event) {
    port?.postMessage({ type: USER_ACTION, data: (event as CustomEvent).detail });
  }

  function replayLastStatus() {
    if (lastStatusMessage) {
      window.dispatchEvent(new CustomEvent(RECORDING_STATUS, {
        detail: createMessage(lastStatusMessage.data),
      }));
    }
  }

  function onPageShow(event: PageTransitionEvent) {
    if (event.persisted) {
      connect();
    }
  }

  function connect() {
    if (port) {
      window.removeEventListener(USER_ACTION, onUserAction);
      window.removeEventListener('pageshow', onPageShow as EventListener);
      port.disconnect();
    }

    port = browser.runtime.connect({
      name: JSON.stringify({ endpointName: ENDPOINT_PAGE_CONNECT }),
    });

    port.onMessage.addListener((message: { type: string; data: any }) => {
      if (message.type === RECORDING_STATUS) {
        lastStatusMessage = message;
        // Stash overlay state in store.initial BEFORE dispatching the CustomEvent.
        // OverlayPanel (and useDraggable) mounts when enabled becomes true, so
        // pos/mode/events are already available when they read store.initial.
        //
        // overlayState is intentionally NOT forwarded in the CustomEvent detail:
        // Firefox's cloneInto()/X-ray strips nested objects, so events/mode would
        // arrive opaque. OverlayApp reads from store.initial instead.
        if (message.data?.overlayState) {
          store.initial = message.data.overlayState as PersistedOverlayState;
        }
        const { overlayState: _drop, ...statusData } = message.data ?? {};
        window.dispatchEvent(new CustomEvent(RECORDING_STATUS, {
          detail: createMessage(statusData),
        }));
      }
    });

    window.addEventListener(USER_ACTION, onUserAction);
    window.addEventListener('pageshow', onPageShow as EventListener);
  }

  // When the MAIN-world recorder initialises it fires this event; replay the
  // last status so recorders that loaded after the first status still activate.
  window.addEventListener('loadster-locator-recorder-ready', replayLastStatus);

  connect();

  // Mount the recording overlay only on the top frame.
  if (window === window.top) {
    const { destroy } = mountShadowOverlay({
      rootComponent: OverlayApp,
      provides: { overlayStore: store },
    });

    // Vue calls onMounted synchronously during app.mount(), so the overlay's
    // RECORDING_STATUS listener is already registered when we replay here.
    replayLastStatus();

    window.__loadster_destroyOverlay = () => {
      destroy();
      window.removeEventListener(USER_ACTION, onUserAction);
      window.removeEventListener('pageshow', onPageShow as EventListener);
      port?.disconnect();
      port = null;
      window.loadsterContentLoaded = false;
    };
  }
}
