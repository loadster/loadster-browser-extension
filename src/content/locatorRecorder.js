import { createSelectorGenerator } from '@mizchi/selector-generator';
import { RecorderMessageType } from '../../index.ts';
import { createMessage } from '../utils/messagingUtils.js';
import { adaptSelector, includeElementAttributes } from './locator-shared/selectorAdapter.ts';

const { RECORDING_STATUS, USER_ACTION } = RecorderMessageType;

if (!window.loadsterLocatorRecorderLoaded) {
  window.loadsterLocatorRecorderLoaded = true;

  let enabled = false;
  let initialized = false;
  let generateSelector = null;

  const EVENTS = ['click', 'dblclick', 'change', 'select', 'submit'];
  const testIdAttributeName = 'data-testid'; // Default is data-testid. Replace it with user-preference

  window.dispatchEvent(new CustomEvent('loadster-locator-recorder-ready'));

  window.addEventListener(RECORDING_STATUS, (event) => {
    enabled = event.detail.enabled;

    if (enabled && !initialized) {
      generateSelector = createSelectorGenerator(window, false, 'javascript', testIdAttributeName);

      // Expose per-frame selector function so child frames can build their framePath.
      window.__loadster_generateLocator = (el) => {
        try {
          return generateSelector(el, { testIdAttributeName }).selector;
        } catch {
          return null;
        }
      };

      EVENTS.forEach(type => window.addEventListener(type, recordEvent));
      initialized = true;
    }
  });

  function buildFramePath() {
    const path = [];
    let cur = window;

    while (cur !== cur.top) {
      const frameEl = cur.frameElement;

      if (!frameEl || typeof cur.parent.__loadster_generateLocator !== 'function') break;

      const sel = cur.parent.__loadster_generateLocator(frameEl);

      if (!sel) break;

      path.push([{ method: 'frameLocator', selector: sel }]);
      cur = cur.parent;
    }

    return path.reverse();
  }

  function recordEvent(e) {
    if (!enabled || !generateSelector) return;

    try {
      const element = e.target;
      if (!(element instanceof Element)) return;

      const raw = generateSelector(element, { testIdAttributeName });
      const framePath = window !== window.top ? buildFramePath() : [];
      const locators = [...framePath.flat(), ...adaptSelector(raw.selector)];

      console.log(e.type, locators, raw.selectors);
      const msg = {
        // Required data
        timestamp: Date.now(),
        action: e.type,
        locators, // complete chain: frameLocator steps (if any) + element locators
        value: element.value, // used in recording dialog?
        tagName: element.tagName, // used in recording dialog

        // Playwright API
        rawSelector: raw.selector, // best selector (locator chain as string)
        rawSelectors: raw.selectors, // all selectors, including the best

        // Backwards compatibility
        element: raw.selector,
        selectors: raw.selectors,


        // Additional data (not used anywhere AFAIK)
        attrs: includeElementAttributes(element),
        keyboard: { alt: e.altKey, shift: e.shiftKey, ctrl: e.ctrlKey, meta: e.metaKey },
        textContent: element.textContent,
        href: element.href || null,
      };

      window.top.dispatchEvent(new CustomEvent(USER_ACTION, {
        detail: createMessage({ action: msg.action, data: msg })
      }));
    } catch {
      // silently swallow — same pattern as windowEventRecorder.js
    }
  }
}
