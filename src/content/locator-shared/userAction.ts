import { createMessage } from '../../utils/messagingUtils';
import { BrowserElementActionEventData, BrowserEvent, RecorderMessageType } from '../../../index';
import { adaptSelector, includeElementAttributes, type ElementLocatorSpec } from './selectorAdapter';

export const TEST_ID_ATTRIBUTE_NAME = 'data-testid';

export type FramePath = ElementLocatorSpec[][];

export type Keyboard = { alt: boolean; shift: boolean; ctrl: boolean; meta: boolean };

const NO_KEYBOARD: Keyboard = { alt: false, shift: false, ctrl: false, meta: false };

export type GenerateSelector = (
  el: Element,
  opts: { testIdAttributeName: string }
) => { selector: string; selectors: string[] };

export interface DispatchUserActionOptions {
  element: Element;
  action: string;
  generateSelector: GenerateSelector;
  framePath?: FramePath;
  keyboard?: Keyboard;
}

export function dispatchUserAction({
  element,
  action,
  generateSelector,
  framePath = [],
  keyboard = NO_KEYBOARD,
}: DispatchUserActionOptions): void {
  const raw = generateSelector(element, { testIdAttributeName: TEST_ID_ATTRIBUTE_NAME });
  const locators = [...framePath.flat(), ...adaptSelector(raw.selector)];

  const msg: BrowserElementActionEventData = {
    timestamp: Date.now(),
    action,
    locators,
    value: (element as HTMLInputElement).value, // for <select/> options
    tagName: element.tagName,
    rawSelector: raw.selector,
    rawSelectors: raw.selectors,

    element: raw.selector,
    selectors: raw.selectors,
    attrs: includeElementAttributes(element),
    keyboard,
  };

  window.top!.dispatchEvent(new CustomEvent(RecorderMessageType.USER_ACTION, {
    detail: createMessage({ action: msg.action, data: msg }),
  }));
}

export function buildFramePath(): FramePath {
  const path: FramePath = [];
  let cur: Window = window;

  while (cur !== cur.top) {
    const frameEl = cur.frameElement;
    const parent = cur.parent as Window & { __loadster_generateLocator?: (el: Element) => string | null };

    if (!frameEl || typeof parent.__loadster_generateLocator !== 'function') break;

    const sel = parent.__loadster_generateLocator(frameEl);

    if (!sel) break;

    path.push([{ method: 'frameLocator', selector: sel }]);
    cur = parent;
  }

  return path.reverse();
}
