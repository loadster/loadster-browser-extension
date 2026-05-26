import { createSelectorGenerator } from '@mizchi/selector-generator';
import { RecorderMessageType } from '../../index.ts';
import {
  TEST_ID_ATTRIBUTE_NAME,
  buildFramePath,
  dispatchUserAction,
} from './locator-shared/userAction.ts';

const { RECORDING_STATUS } = RecorderMessageType;
const EVENTS = ['click', 'dblclick', 'change', 'select', 'submit'];

if (!window.loadsterLocatorRecorderLoaded) {
  window.loadsterLocatorRecorderLoaded = true;

  let enabled = false;
  let initialized = false;
  let generateSelector = null;

  window.dispatchEvent(new CustomEvent('loadster-locator-recorder-ready'));

  window.addEventListener(RECORDING_STATUS, (event) => {
    enabled = event.detail.enabled;

    if (enabled && !initialized) {
      generateSelector = createSelectorGenerator(window, false, 'javascript', TEST_ID_ATTRIBUTE_NAME);

      window.__loadster_generateLocator = (el) => {
        try {
          return generateSelector(el, { testIdAttributeName: TEST_ID_ATTRIBUTE_NAME }).selector;
        } catch {
          return null;
        }
      };

      EVENTS.forEach(type => window.addEventListener(type, recordEvent));
      initialized = true;
    }
  });

  function recordEvent(e) {
    if (!enabled || !generateSelector || !(e.target instanceof Element)) return;

    try {
      dispatchUserAction({
        element: e.target,
        action: e.type,
        generateSelector,
        framePath: window !== window.top ? buildFramePath() : [],
        keyboard: {
          alt: !!e.altKey,
          shift: !!e.shiftKey,
          ctrl: !!e.ctrlKey,
          meta: !!e.metaKey,
        },
      });
    } catch {
      // silently swallow
    }
  }
}
