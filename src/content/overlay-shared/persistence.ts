import type { RecordedEvent } from './types';

export interface PersistedOverlayState {
  mode?: string;
  pos?: { x: number; y: number } | null;
  events?: RecordedEvent[];
}

/**
 * Transport-agnostic store injected into overlays via Vue provide('overlayStore').
 *
 * `initial` is populated by the transport before `enabled` becomes true, so
 * useDraggable and overlay components can read it synchronously when the panel mounts.
 *
 * `patch` pushes a partial update to the background recorder, which merges it into
 * its own copy so the state survives cross-origin navigation.
 */
export interface OverlayStateStore {
  /** Populated before the panel mounts; safe to read synchronously at setup time. */
  initial: PersistedOverlayState;
  /** Push a partial state update to the background. Errors are swallowed. */
  patch(partial: Partial<PersistedOverlayState>): void;
}

export const MAX_OVERLAY_EVENTS = 200;

/** CDP binding name used by the Playwright overlay to push state patches to the background. */
export const OVERLAY_STATE_BINDING = '__pw_overlay_persist__';

/**
 * Merge a partial state update into the current persisted state.
 * Trims the events array to the last MAX_OVERLAY_EVENTS entries.
 * Called by background recorders on every incoming patch.
 */
export function mergeOverlayState(
  current: PersistedOverlayState,
  partial: Partial<PersistedOverlayState>,
): PersistedOverlayState {
  const next: PersistedOverlayState = { ...current, ...partial };
  if (next.events && next.events.length > MAX_OVERLAY_EVENTS) {
    next.events = next.events.slice(-MAX_OVERLAY_EVENTS);
  }
  return next;
}
