export type Mode = 'record' | 'pick';

declare global {
  interface Window {
    loadsterLocatorOverlayLoaded: boolean;
    __loadster_destroyOverlay: () => void;
  }
}

export interface OverlayState {
  mode: Mode;
  hoveredRect: DOMRect | null;
  hoveredSelector: string | null;
}
