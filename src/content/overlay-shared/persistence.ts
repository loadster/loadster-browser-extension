import type { RecordedEvent } from './types';

export interface PersistedOverlayState {
  mode?: string;
  pos?: { x: number; y: number } | null;
  events?: RecordedEvent[];
}

export const PW_OVERLAY_STATE_KEY = '__loadster_pw_overlay_state__';
export const LOCATOR_OVERLAY_STATE_KEY = '__loadster_locator_overlay_state__';

export const MAX_OVERLAY_EVENTS = 200;

export function loadOverlayState(key: string): PersistedOverlayState {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return {};
    return JSON.parse(raw) as PersistedOverlayState;
  } catch {
    return {};
  }
}

export function patchOverlayState(key: string, partial: Partial<PersistedOverlayState>): void {
  try {
    const current = loadOverlayState(key);
    const next: PersistedOverlayState = { ...current, ...partial };
    if (next.events && next.events.length > MAX_OVERLAY_EVENTS) {
      next.events = next.events.slice(-MAX_OVERLAY_EVENTS);
    }
    sessionStorage.setItem(key, JSON.stringify(next));
  } catch {
    // sessionStorage unavailable (sandboxed iframe, quota exceeded, etc.) — degrade gracefully
  }
}

export function clearOverlayState(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}
