export type Mode = 'record' | 'pick';

declare global {
  interface Window {
    loadsterContentLoaded: boolean;
    __loadster_destroyOverlay: () => void;
  }
}
