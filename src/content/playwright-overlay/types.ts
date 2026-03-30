export type Mode = 'record' | 'assertVisible' | 'assertText' | 'assertValue';

declare global {
  interface Window {
    __pw_initOverlay: (injectedScript: any) => void;
    __pw_destroyOverlay: () => void;
    __pw_overlay_loaded: boolean;
    __pw_overlay_action__: (json: string) => void;
    __pw_injectedScript: any;
    __pw_recorder_loaded: boolean;
  }
}


export interface OverlayState {
  mode: Mode;
  hoveredRect: DOMRect | null;
  hoveredSelector: string | null;
}
