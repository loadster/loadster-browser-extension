/// <reference types="vite/client" />

declare const __BROWSER__: string;

declare global {
  interface Window {
    loadsterOriginalTitle?: string;
  }
}
