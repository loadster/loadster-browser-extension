import { createApp } from 'vue';
import OverlayApp from './OverlayApp.vue';
import overlayStyles from './styles.css?raw';
import overpassLightUrl from '../../assets/fonts/Overpass-Light.woff2?url';
import overpassRegularUrl from '../../assets/fonts/Overpass-Regular.woff2?url';
import overpassSemiBoldUrl from '../../assets/fonts/Overpass-SemiBold.woff2?url';
import overpassExtraBoldUrl from '../../assets/fonts/Overpass-ExtraBold.woff2?url';

const fontFaceCSS = `
@font-face { font-family: 'Overpass'; font-weight: 300; src: url('${overpassLightUrl}') format('woff2'); }
@font-face { font-family: 'Overpass'; font-weight: 400; src: url('${overpassRegularUrl}') format('woff2'); }
@font-face { font-family: 'Overpass'; font-weight: 600; src: url('${overpassSemiBoldUrl}') format('woff2'); }
@font-face { font-family: 'Overpass'; font-weight: 800; src: url('${overpassExtraBoldUrl}') format('woff2'); }
`;


window.__pw_initOverlay = function (injectedScript: any) {
  if (window.__pw_overlay_loaded) return;
  window.__pw_overlay_loaded = true;

  console.log('playwright-overlay loaded');

  // Shadow host — 0x0, pointer-events:none so it doesn't block page interaction
  const host = document.createElement('div');
  Object.assign(host.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    pointerEvents: 'none',
    zIndex: '2147483646',
  });

  // Closed shadow root for style isolation
  const shadow = host.attachShadow({ mode: 'closed' });

  // Inject styles into shadow root (Vue <style> blocks go to document.head and don't pierce shadow DOM)
  const style = document.createElement('style');
  style.textContent = fontFaceCSS + overlayStyles;
  shadow.appendChild(style);

  // Vue mount point inside shadow
  const mountPoint = document.createElement('div');
  shadow.appendChild(mountPoint);

  const app = createApp(OverlayApp);
  app.provide('injectedScript', injectedScript);
  app.provide('overlayHost', host);
  app.mount(mountPoint);

  if (document.documentElement) {
    document.documentElement.appendChild(host);
  } else {
    document.addEventListener('DOMContentLoaded', () => document.documentElement.appendChild(host), { once: true });
  }

  window.__pw_destroyOverlay = () => {
    app.unmount();
    host.remove();
    window.__pw_overlay_loaded = false;
  };
};
