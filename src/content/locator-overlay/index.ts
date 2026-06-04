import browser from 'webextension-polyfill';
import OverlayApp from './OverlayApp.vue';
import { mountShadowOverlay } from '../overlay-shared/shadowMount';
import { RecorderMessageType } from '../../../index';
import { createMessage } from '../../utils/messagingUtils.js';
import { clearOverlayState, LOCATOR_OVERLAY_STATE_KEY } from '../overlay-shared/persistence';

const { RECORDING_STATUS, USER_ACTION, ENDPOINT_PAGE_CONNECT } = RecorderMessageType;

if (window.loadsterContentLoaded !== true) {
  window.loadsterContentLoaded = true;

  let port: browser.Runtime.Port | null = null;
  let lastStatusMessage: { type: string; data: unknown } | null = null;

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

    port.onMessage.addListener((message: { type: string; data: unknown }) => {
      if (message.type === RECORDING_STATUS) {
        lastStatusMessage = message;
        window.dispatchEvent(new CustomEvent(RECORDING_STATUS, {
          detail: createMessage(message.data),
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
    const { destroy } = mountShadowOverlay({ rootComponent: OverlayApp });

    // Vue calls onMounted synchronously during app.mount(), so the overlay's
    // RECORDING_STATUS listener is already registered when we replay here.
    replayLastStatus();

    window.__loadster_destroyOverlay = () => {
      clearOverlayState(LOCATOR_OVERLAY_STATE_KEY);
      destroy();
      window.removeEventListener(USER_ACTION, onUserAction);
      window.removeEventListener('pageshow', onPageShow as EventListener);
      port?.disconnect();
      port = null;
      window.loadsterContentLoaded = false;
    };
  }
}
