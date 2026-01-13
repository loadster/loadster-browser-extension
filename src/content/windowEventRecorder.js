import { finder } from '@medv/finder';
import { RECORDING_STATUS, USER_ACTION } from '../constants.js';
import { overrideEventListeners, setupCSSHoverEventListener, createMessage } from '../utils/windowUtils.js';

if (!window.loadsterRecorderScriptsLoaded) {
  window.loadsterRecorderScriptsLoaded = true;

  let enabled = false;
  let initialized = false;
  let getElementWithCSSHoverRule = () => null;
  let elementHasCSSHoverRule = () => false;

  const events = ['click', 'dbclick', 'change', 'select', 'submit', 'mouseenter', 'mouseover'];

  window.addEventListener(RECORDING_STATUS, (event) => {
    enabled = event.detail.enabled;

    // Defer heavy setup until recording is actually active for this tab.
    // This avoids performance impact on pages that aren't being recorded.
    if (enabled && !initialized) {
      const hoverHelpers = setupCSSHoverEventListener(false);

      getElementWithCSSHoverRule = hoverHelpers.getElementWithCSSHoverRule;
      elementHasCSSHoverRule = hoverHelpers.elementHasCSSHoverRule;

      overrideEventListeners();

      events.forEach((type) => {
        window.addEventListener(type, recordEvent);
      });

      initialized = true;
    }

    updateFilters(event.detail.options);
  });

  const recordingOptions = {
    recordHoverEvents: 'none', // 'none' | 'auto' | 'all'
    recordClickEvents: 'exact' // 'exact' | 'closest'
  };
  const filters = {
    idName: [], className: [], tagName: [], attr: [],
  };

  function isValidRegex(str) {
    let isValid = true;

    try {
      new RegExp(str);
    } catch (e) {
      isValid = false;
    }

    return isValid;
  }

  function updateFilters(options = {}) {
    const { selectorFilters } = options;

    Object.assign(recordingOptions, options);

    if (selectorFilters && selectorFilters.length) {
      selectorFilters.forEach(f => {
        if (filters.hasOwnProperty(f.key) && f.value && f.value.trim() && isValidRegex(f.value)) {
          const regexp = new RegExp(f.value);

          if (!filters[f.key].find(r => String(r) === String(regexp))) {
            filters[f.key].push(regexp);
          }
        }
      });
    }
  }

  const emitMessage = (msg) => {
    window.top.dispatchEvent(new CustomEvent(USER_ACTION, {
      'detail': createMessage({
        action: msg.action,
        data: msg
      })
    }));
  };

  const recordEvent = (e) => {
    if (!enabled) return;
    if (!['auto', 'all'].includes(recordingOptions.recordHoverEvents) && ['mouseover', 'mouseenter'].includes(e.type)) return;

    /*
     * We explicitly catch any errors and swallow them, as none node-type events are also ingested.
     * for these events we cannot generate selectors, which is OK
     */
    try {
      const attrs = {
        frameSelector: ''
      };

      if (window.parent !== window) {
        addFrameAttributes(attrs);
      }

      let element = e.target;

      if (e.type === 'click') {
        if (recordingOptions.recordClickEvents === 'closest') {
          element = getElementWithEventListeners(e.target, e.type, (el) => {
            return el.getAttribute('href') || el.onclick;
          });
        }
      } else if (['mouseenter', 'mouseover'].includes(e.type)) {
        if (recordingOptions.recordHoverEvents === 'all') {
          // use the element
        } else if (recordingOptions.recordHoverEvents === 'auto' && e.type === 'mouseover') {
          if (elementHasCSSHoverRule(e.target)) {
            // use the exact element
          } else {
            element = getElementWithCSSHoverRule(e.target);

            if (element) {
              if (e.relatedTarget && element.contains(e.relatedTarget)) {
                // console.log(`ignoring hover because it was already hovering a relative`, e.target, e.relatedTarget);

                return;
              } else {
                // use the element's closest ancestor with a hover rule
              }
            } else {
              if (getElementListener(e.target, e.type)) {
                element = e.target;
                // js listener found, use the original element
              }
            }
          }
        } else if (recordingOptions.recordHoverEvents === 'auto' && getElementListener(e.target, e.type)) {
          // use the element
        } else {
          return;
        }
      }

      if (!element) return;

      // console.log(e.type);

      addTargetAttributes(element, attrs);

      const msg = {
        'timestamp': Date.now(),
        selectors: {
          ...getCssSelectors(element, attrs.frameSelector),
          textSelector: getTextSelector(element, attrs.frameSelector)
        },
        'value': element.value,
        'tagName': element.tagName,
        'action': ['mouseenter', 'mouseover'].includes(e.type) ? 'hover' : e.type,
        attrs,
        'keyboard': {
          'alt': e.altKey, 'shift': e.shiftKey, 'ctrl': e.ctrlKey, 'meta': e.metaKey
        },
        'textContent': element.textContent,
        'href': element.href ? element.href : null
      };

      emitMessage(msg);
    } catch (e) {
      // console.log(e.message);
    }
  };

  function getCssSelectors(element, frameSelector) {
    const idFilter = (value) => !filters.idName.some(p => p.test(value));
    const classFilter = (value) => !filters.className.some(p => p.test(value));
    const tagFilter = (name) => !filters.tagName.some(p => p.test(name));
    const attrFilter = (name, value) => !['class', 'id', 'style'].includes(name) && !filters.attr.some(p => p.test(name)) && !filters.attr.some(p => p.test(value));

    // https://github.com/antonmedv/finder?tab=readme-ov-file#configuration
    const uniqueSelectors = new Set();

    /**
     * ID selectors should be of the standard #id format. There will only be one if the element
     * has a unique ID and the ID filter doesn't forbid it.
     */
    const idSelectors = [
      tryFindSelector(element, {
        'idName': idFilter,
        'className': () => false,
        'tagName': () => false,
        'attr': () => false,
        seedMinLength: 1,
        optimizedMinLength: 1
      })
    ]
      .filter(sel => sel && sel.trim().startsWith('#'))
      .map(sel => sel ? `${frameSelector} ${sel}`.trim() : null)
      .filter((selector) => {
        if (uniqueSelectors.has(selector)) {
          return false;
        } else {
          uniqueSelectors.add(selector);
          return true;
        }
      });

    /**
     * Class selectors should start with a dot. We prefer one as short
     * as possible to uniquely identify the element, but fall back on a longer one
     * with multiple parts if required.
     */
    const classSelectors = [
      tryFindSelector(element, {
        'idName': () => false,
        'className': classFilter,
        'tagName': () => false,
        'attr': () => false,
        seedMinLength: 1,
        optimizedMinLength: 1
      }),
      tryFindSelector(element, {
        'idName': () => false,
        'className': classFilter,
        'tagName': () => false,
        'attr': () => false,
        seedMinLength: 4,
        optimizedMinLength: 2
      })
    ]
      .filter(sel => sel && /^\.\w+.*$/.test(sel.trim()))
      .map(sel => sel ? `${frameSelector} ${sel}`.trim() : null)
      .filter((selector) => {
        if (uniqueSelectors.has(selector)) {
          return false;
        } else {
          uniqueSelectors.add(selector);
          return true;
        }
      });

    /**
     * Other selectors are preferably attribute selectors, but may fall back on nested
     * tag name selectors or even nth-child wildcards, etc.
     */
    const otherSelectors = [
      tryFindSelector(element, {
        'idName': () => false,
        'className': () => false,
        'tagName': tagFilter,
        'attr': attrFilter,
        seedMinLength: 1,
        optimizedMinLength: 1
      }),
      tryFindSelector(element, {
        'idName': () => false,
        'className': () => false,
        'tagName': tagFilter,
        'attr': attrFilter,
        seedMinLength: 4,
        optimizedMinLength: 2
      })
    ]
      .map(sel => sel ? `${frameSelector} ${sel}`.trim() : null)
      .filter((selector) => {
        if (uniqueSelectors.has(selector)) {
          return false;
        } else {
          uniqueSelectors.add(selector);
          return true;
        }
      });

    return {
      idSelectors,
      classSelectors,
      otherSelectors
    };
  }

  function tryFindSelector(element, options) {
    try {
      return finder(element, options);
    } catch (e) {
      // Mute Error: Selector was not found.
      // console.log(e);
    }
  }

  function getTextSelector(el, frameSelector) {
    const textContent = el.textContent.trim();
    let textSelector = '';

    // Check uniqueness, stopping as soon as we find a second match
    if (!el.children.length && textContent) {
      const allElements = document.body.getElementsByTagName('*');
      let matchCount = 0;

      for (let i = 0; i < allElements.length && matchCount < 2; i++) {
        const element = allElements[i];

        if (!element.children.length && element.textContent.trim() === textContent) {
          matchCount++;
        }
      }

      if (matchCount === 1) {
        textSelector = `${frameSelector} text=${textContent}`.trim();
      }
    }

    return textSelector;
  }

  function addFrameAttributes(attrs) {
    let frame = window;
    const frameTag = window.frameElement ? window.frameElement.tagName.toLowerCase() : 'iframe';

    attrs.frameSelector = '';

    if (frame.name) {
      attrs.frameName = frame.name;
      attrs.frameSelector = `${frameTag}[name="${frame.name}"] ${attrs.frameSelector}`;
    } else {
      while (frame.parent !== frame) {
        for (let i = 0; i < frame.parent.frames.length; i++) {
          if (frame.parent.frames[i] === frame) {
            attrs.frameIndex = i;

            attrs.frameSelector = `${frameTag}[${i}] ${attrs.frameSelector}`.trim();
          }
        }

        frame = frame.parent;
      }
    }
  }

  function addTargetAttributes(element, attrs) {
    for (let i = 0, x = element.attributes, n = x.length; i < n; i++) {
      attrs[x[i].name] = x[i].value;
    }
  }

  function getElementListener(el, listenerType) {
    if (typeof el.getLoadsterCapturedEventListeners === 'function') {
      const listeners = el.getLoadsterCapturedEventListeners();

      return listeners[listenerType];
    }
  }

  function getElementWithEventListeners(originalElement, listenerType, pull) {
    let currentElement = originalElement;
    let level = 0;
    const maxLevel = 100;

    if (typeof originalElement.getLoadsterCapturedEventListeners !== 'function') {
      return originalElement;
    }

    while (currentElement && level <= maxLevel) {
      // The script reached <html> and found no listeners => return the original element
      if (originalElement !== currentElement && currentElement.tagName === 'HTML') {
        return originalElement;
      }

      // Return the current element if it matches the filter condition
      if (currentElement && typeof pull === 'function' && pull(currentElement)) {
        return currentElement;
      }

      const listener = getElementListener(currentElement, listenerType);

      if (listener) {
        if (['mouseover', 'mouseenter'].includes(listenerType)) {
          return originalElement; // For the hovers only, return the original element
        } else {
          return currentElement; // Found element with matching listener
        }
      }

      currentElement = currentElement.parentElement;
      level++;
    }

    // Fallback to the original element after {maxLevel} attempts
    return originalElement;
  }

}
