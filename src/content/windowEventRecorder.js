import { finder } from '@medv/finder';
import { RECORDING_STATUS, USER_ACTION } from '../constants.js';
import { overrideEventListeners, createMessage } from '../utils/windowUtils.js';

if (!window.loadsterRecorderScriptsLoaded) {
  window.loadsterRecorderScriptsLoaded = true;

  let enabled = true;

  window.addEventListener(RECORDING_STATUS, (event) => {
    console.log('window RECORDING_STATUS', event.detail);
    enabled = event.detail.enabled;
    updateFilters(event.detail.options);
  });

  overrideEventListeners();

  console.log('initialize window event recorder');

  const filters = {
    idName: [],
    className: [],
    tagName: [],
    attr: [],
  };

  const events = ['click', 'dbclick', 'change', 'select', 'submit'];

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
    const { attrRegExp, idRegExp, customPatterns } = options;

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
    window.top.dispatchEvent(
      new CustomEvent(USER_ACTION, {
        'detail': createMessage({
          action: msg.action,
          data: msg
        })
      }, { bubbles: true })
    );
  };

  const recordEvent = (e) => {
    if (!enabled) return;

    /*
     * We explicitly catch any errors and swallow them, as none node-type events are also ingested.
     * for these events we cannot generate selectors, which is OK
     */
    try {
      const attrs = {};

      if (window.parent !== window) {
        addFrameAttributes(attrs);
      }

      let element = e.target;

      const overrideListeners = ['click'];
      if (overrideListeners.includes(e.type)) {

        element = getElementWithEventListeners(e.target, overrideListeners);
        console.log('found', element.tagName, e.target.tagName, { ancestor: element !== e.target });
      }

      addTargetAttributes(element, attrs);

      const selector = finder(element, {
        'idName': (value) => {
          return !filters.idName.some(p => p.test(value));
        },
        'className': (value) => {
          return !filters.className.some(p => p.test(value));
        },
        'tagName': (name) => {
          return !filters.tagName.some(p => p.test(name));
        },
        'attr': (name, value) => {
          return !['class', 'id', 'style'].includes(name) && !filters.attr.some(p => p.test(name)) && !filters.idName.some(p => p.test(value));
        },
        'seedMinLength': 1, // Min 1
        'optimizedMinLength': 2 // Min 2
      });
      const textSelector = getTextSelector(element, attrs.frameSelector);

      console.log({ selector, textSelector });


      const msg = {
        'timestamp': Date.now(),
        selector: selector, // bwd
        selectors: [selector],
        'value': element.value,
        'tagName': element.tagName,
        'action': e.type,
        attrs,
        'keyboard': {
          'alt': e.altKey,
          'shift': e.shiftKey,
          'ctrl': e.ctrlKey,
          'meta': e.metaKey
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

  function getElementWithEventListeners(el, listenerTypes) {
    let currentElement = el;

    if (typeof el.getLoadsterCapturedEventListeners !== 'function') {
      console.log('no override');
      return el; // no override function
    }

    while (currentElement) {
      if (el !== currentElement && currentElement.tagName === 'HTML') {
        return el;  // The script reached <html> and found no listeners => return the original element
      }

      for (let i = 0, l = listenerTypes.length; i < l; ++i) {
        const listenerType = listenerTypes[i];

        if (listenerType === 'click') {
          const clickListener = currentElement.onclick || getElementListener(currentElement, 'click');

          if (clickListener) {
            return currentElement;
          }
        } else {
          const otherListener = getElementListener(currentElement, listenerType);

          if (otherListener) {
            return currentElement;
          }
        }
      }

      // continue while loop
      currentElement = currentElement.parentElement;
    }

    return el;  // nothing found => return original element
  }

  events.forEach((type) => {
    window.addEventListener(type, recordEvent, true);
  });
}

