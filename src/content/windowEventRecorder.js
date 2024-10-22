import { finder } from '@medv/finder';
import { RECORDING_STATUS, USER_ACTION } from '../constants.js';
import { overrideEventListeners, createMessage } from '../utils/windowUtils.js';

if (!window.loadsterRecorderScriptsLoaded) {
  window.loadsterRecorderScriptsLoaded = true;

  let enabled = true;

  window.addEventListener(RECORDING_STATUS, (event) => {
    enabled = event.detail.enabled;
    updateFilters(event.detail.options);
  });

  overrideEventListeners();

  const recordingOptions = {
    recordHoverEvents: 'none', // 'none' | 'js' | 'all'
    recordClickEvents: 'exact' // 'exact' | 'js'
  };
  const filters = {
    idName: [], className: [], tagName: [], attr: [],
  };

  const events = ['click', 'dbclick', 'change', 'select', 'submit', 'mouseenter', 'mouseover'];

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
    const { customPatterns } = options;

    /**
     * @deprecated use customPatterns from v26
     */
    const attrRegExp = options.attrRegExp;
    /**
     * @deprecated use customPatterns from v26
     */
    const idRegExp = options.idRegExp;

    Object.assign(recordingOptions, options);

    console.log(recordingOptions);

    if (attrRegExp && isValidRegex(attrRegExp)) {
      filters.attr.push(new RegExp(attrRegExp));
    }
    if (idRegExp && isValidRegex(idRegExp)) {
      filters.idName.push(new RegExp(idRegExp));
    }

    if (customPatterns && customPatterns.length) {
      customPatterns.forEach(f => {
        if (filters.hasOwnProperty(f.key) && f.value && f.value.trim() && isValidRegex(f.value)) {
          filters[f.key].push(new RegExp(f.value));
        }
      });
    }
  }

  const emitMessage = (msg) => {
    window.top.dispatchEvent(new CustomEvent(USER_ACTION, {
      'detail': createMessage({
        action: msg.action, data: msg
      })
    }));
  };

  const recordEvent = (e) => {
    if (!enabled) return;
    if (!['js', 'all'].includes(recordingOptions.recordHoverEvents) && ['mouseover', 'mouseenter'].includes(e.type)) return;

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

      if (recordingOptions.recordClickEvents === 'js' && ['click', 'mouseenter', 'mouseover'].includes(e.type)) {
        if (e.type === 'click' && e.target.getAttribute('href')) {
          console.log('use exact link', recordingOptions);
          // use original element
        } else {
          console.log('look for event listener', recordingOptions);
          element = getElementWithEventListeners(e.target, e.type);
        }
      }

      if (!element) return;

      addTargetAttributes(element, attrs);

      const selectors = getCssSelectors(element, attrs.frameSelector);
      const textSelector = getTextSelector(element, attrs.frameSelector);

      const msg = {
        'timestamp': Date.now(),
        selectors: selectors,
        'value': element.value,
        'tagName': element.tagName,
        'action': ['mouseenter', 'mouseover'].includes(e.type) ? 'hover' : e.type,
        attrs,
        'keyboard': {
          'alt': e.altKey, 'shift': e.shiftKey, 'ctrl': e.ctrlKey, 'meta': e.metaKey
        },
        'textContent': element.textContent,
        'textSelector': textSelector,
        'href': element.href ? element.href : null
      };

      emitMessage(msg);
    } catch (e) {
      // console.log(e.message);
    }
  };

  function getCssSelectors (element, frameSelector) {
    const idFilter = (value) => !filters.idName.some(p => p.test(value));
    const classFilter = (value) => !filters.idName.some(p => p.test(value));
    const tagFilter = (name) => !filters.tagName.some(p => p.test(name));
    const attrFilter = (name, value) => !['class', 'id', 'style'].includes(name) && !filters.attr.some(p => p.test(name)) && !filters.idName.some(p => p.test(value));

    // https://github.com/antonmedv/finder?tab=readme-ov-file#configuration
    return [
      tryFindSelector(element,{
        'idName': idFilter,
        'className': classFilter,
        'tagName': tagFilter,
        'attr': attrFilter,
      }),
      tryFindSelector(element, {
        'idName':() => false,
        'className': classFilter,
        'tagName': () => false,
        'attr': () => false,
      }),
      tryFindSelector(element, {
        'idName':() => false,
        'className': () => false,
        'tagName': tagFilter,
        'attr': () => false,
      }),
      tryFindSelector(element, {
        'idName':() => false,
        'className': () => false,
        'tagName': () => false,
        'attr': attrFilter,
      })
    ]
      .filter((sel, index, arr) => !!sel && arr.indexOf(sel) === index)
      .map(sel => `${frameSelector} ${sel}`.trim());
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

    if (!el.children.length && textContent) {
      const isUnique = Array.from(document.body.querySelectorAll('*')).filter(el => el.textContent.trim() === textContent).length === 1;

      if (isUnique) {
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

  function getElementWithEventListeners(el, listenerType) {
    let currentElement = el;
    let level = 0;
    const maxLevel = 100;

    if (typeof el.getLoadsterCapturedEventListeners !== 'function') {
      return; // no override function
    }

    while (currentElement && level <= maxLevel) {
      if (el !== currentElement && currentElement.tagName === 'HTML') {
        return;  // The script reached <html> and found no listeners => return the original element
      }

      let listener = null;

      if (listenerType === 'click') {
        listener = currentElement.onclick || getElementListener(currentElement, listenerType);
      } else if (['mouseover', 'mouseenter'].includes(listenerType)) {
        listener = getElementListener(currentElement, listenerType);

        // For the hovers only, return the original element
        if (listener) {
          return el;
        }
      } else {
        listener = getElementListener(currentElement, listenerType);
      }

      if (listener) {
        return currentElement; // Found element with matching listener
      }

      currentElement = currentElement.parentElement;
      level++;
    }
  }

  events.forEach((type) => {
    window.addEventListener(type, recordEvent, true);
  });
}
