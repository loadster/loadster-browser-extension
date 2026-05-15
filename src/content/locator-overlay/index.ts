import { createApp } from 'vue';
import OverlayApp from './OverlayApp.vue';
import overlayStyles from './styles.css?raw';
import overpassLightUrl from '../../assets/fonts/Overpass-Light.woff2?url';
import overpassRegularUrl from '../../assets/fonts/Overpass-Regular.woff2?url';
import overpassSemiBoldUrl from '../../assets/fonts/Overpass-SemiBold.woff2?url';
import overpassExtraBoldUrl from '../../assets/fonts/Overpass-ExtraBold.woff2?url';

if (window === window.top && !window.loadsterLocatorOverlayLoaded) {
  window.loadsterLocatorOverlayLoaded = true;

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

  window.__loadster_destroyOverlay = () => {
    app.unmount();
    host.remove();
    window.loadsterLocatorOverlayLoaded = false;
  };

  // Trigger contentTab.js to replay the last known recording status.
  // onMounted in OverlayApp has already registered its RECORDING_STATUS listener
  // because Vue 3 calls onMounted synchronously within app.mount() above.
  window.dispatchEvent(new CustomEvent('loadster-locator-overlay-ready'));
}
