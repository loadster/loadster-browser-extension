import { createApp, type Component } from 'vue';
import { fontFaceCSS } from './fonts';
import overlayStyles from './styles.css?raw';

export interface ShadowMountOptions {
  rootComponent: Component;
  provides?: Record<string, unknown>;
}

export function mountShadowOverlay({ rootComponent, provides = {} }: ShadowMountOptions): { destroy: () => void } {
  const host = document.createElement('div');
  host.setAttribute('data-loadster-overlay', '');
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

  const app = createApp(rootComponent);
  app.provide('overlayHost', host);
  for (const [key, value] of Object.entries(provides)) {
    app.provide(key, value);
  }
  app.mount(mountPoint);

  if (document.documentElement) {
    document.documentElement.appendChild(host);
  } else {
    document.addEventListener('DOMContentLoaded', () => document.documentElement.appendChild(host), { once: true });
  }

  return {
    destroy: () => {
      app.unmount();
      host.remove();
    },
  };
}
