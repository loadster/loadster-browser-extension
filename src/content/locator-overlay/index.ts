import { createApp } from 'vue';
import browser from 'webextension-polyfill';
import OverlayApp from './OverlayApp.vue';
import overlayStyles from './styles.css?raw';
import overpassLightUrl from '../../assets/fonts/Overpass-Light.woff2?url';
import overpassRegularUrl from '../../assets/fonts/Overpass-Regular.woff2?url';
import overpassSemiBoldUrl from '../../assets/fonts/Overpass-SemiBold.woff2?url';
import overpassExtraBoldUrl from '../../assets/fonts/Overpass-ExtraBold.woff2?url';
import { RecorderMessageType } from '../../../index';
import { createMessage } from '../../utils/messagingUtils.js';

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
    const fontFaceCSS = `
@font-face { font-family: 'Overpass'; font-weight: 300; src: url('${overpassLightUrl}') format('woff2'); }
@font-face { font-family: 'Overpass'; font-weight: 400; src: url('${overpassRegularUrl}') format('woff2'); }
@font-face { font-family: 'Overpass'; font-weight: 600; src: url('${overpassSemiBoldUrl}') format('woff2'); }
@font-face { font-family: 'Overpass'; font-weight: 800; src: url('${overpassExtraBoldUrl}') format('woff2'); }
`;

    const host = document.createElement('div');
    Object.assign(host.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      pointerEvents: 'none',
      zIndex: '2147483646',
    });

    const shadow = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = fontFaceCSS + overlayStyles;
    shadow.appendChild(style);

    const mountPoint = document.createElement('div');
    shadow.appendChild(mountPoint);

    const app = createApp(OverlayApp);
    app.provide('overlayHost', host);
    app.mount(mountPoint);

    if (document.documentElement) {
      document.documentElement.appendChild(host);
    } else {
      document.addEventListener('DOMContentLoaded', () => document.documentElement.appendChild(host), { once: true });
    }

    // Vue calls onMounted synchronously during app.mount(), so the overlay's
    // RECORDING_STATUS listener is already registered when we replay here.
    replayLastStatus();

    window.__loadster_destroyOverlay = () => {
      app.unmount();
      host.remove();
      window.removeEventListener(USER_ACTION, onUserAction);
      window.removeEventListener('pageshow', onPageShow as EventListener);
      port?.disconnect();
      port = null;
      window.loadsterContentLoaded = false;
    };
  }
}
