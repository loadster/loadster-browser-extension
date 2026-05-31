import type { BridgeMessage } from '../../index';

declare function cloneInto<T>(obj: T, scope: Window, options?: { cloneFunctions?: boolean }): T;

export function parseRecorderConfig(json: string): { recorderType?: string; endpointName?: string } | null {
  try {
    return JSON.parse(json);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (err) {
    return null;
  }
}

export function createMessage<T>(msg: T): T {
  // Firefox's security issue
  // eslint-disable-next-line no-undef
  if (__BROWSER__ === 'firefox' && typeof cloneInto === 'function') {

    return cloneInto(msg, window, { 'cloneFunctions': true });
  } else {
    return msg;
  }
}

export type { BridgeMessage };
