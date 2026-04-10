/// <reference types="vite/client" />

declare global {
  const __BROWSER__: string;

  interface Window {
    loadsterOriginalTitle?: string;
  }
}

export {};
