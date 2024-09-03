import { onMessage, sendMessage, setNamespace } from 'webext-bridge/window';
import { finder } from '@medv/finder';
import { RECORDER_NAMESPACE, RECORDING_STATUS, USER_ACTION } from '../constants.js';
import { overrideEventListeners } from '../utils/windowUtils.js';
console.log('windowEventRecorder.js');

if (!window.loadsterRecorderScriptsLoaded) {
  window.loadsterRecorderScriptsLoaded = true;

  setNamespace(RECORDER_NAMESPACE);

  overrideEventListeners();

  console.log('initialize window event recorder');

  const filters = {
    idName: [],
    className: [],
    tagName: [],
    attr: [],
  };
  let enabled = true;

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
    try {
      console.log('try send message ', msg);
      sendMessage(USER_ACTION, {
        action: msg.action,
        data: msg
      }, 'background');
    } catch (err) {
      console.log(err);
    }
  };

  const recordEvent = (e) => {
    if (!enabled) {
      return;
    }

    /*
     * We explicitly catch any errors and swallow them, as none node-type events are also ingested.
     * for these events we cannot generate selectors, which is OK
     */
    try {
      let frameSelector = '';

      if (window.parent !== window) {
        let frame = window;
        const frameTag = window.frameElement ? window.frameElement.tagName.toLowerCase() : 'iframe';

        if (frame.name) {
          attrs.frameName = frame.name;

          frameSelector = `${frameTag}[name="${frame.name}"] ${frameSelector}`;
        } else {
          while (frame.parent !== frame) {
            for (let i = 0; i < frame.parent.frames.length; i++) {
              if (frame.parent.frames[i] === frame) {
                attrs.frameIndex = i;

                frameSelector = `${frameTag}[${i}] ${frameSelector}`.trim();
              }
            }

            frame = frame.parent;
          }
        }
      }

      const selectors = finder(e.target, {
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
      }).filter(sel => !!sel).map(sel => `${frameSelector} ${sel}`.trim());

      const attrs = {};

      for (let i = 0, x = e.target.attributes, n = x.length; i < n; i++) {
        attrs[x[i].name] = x[i].value;
      }

      const textContent = e.target.textContent.trim();
      let textSelector = '';
      if (!e.target.children.length && textContent) {
        const isUnique = Array.from(document.body.querySelectorAll('*')).filter(el => el.textContent.trim() === textContent).length === 1;

        if (isUnique) {
          textSelector = `${frameSelector} text=${textContent}`.trim();
        }
      }

      const msg = {
        'timestamp': Date.now(),
        selector: selectors[0], // bwd
        selectors,
        'value': e.target.value,
        'tagName': e.target.tagName,
        'action': e.type,
        attrs,
        'keyboard': {
          'alt': e.altKey,
          'shift': e.shiftKey,
          'ctrl': e.ctrlKey,
          'meta': e.metaKey
        },
        'textContent': e.target.textContent,
        'textSelector': textSelector,
        'href': e.target.href ? e.target.href : null
      };

      getElementWithEventListeners(e.target);

      emitMessage(msg);
    } catch (e) {
      // console.log(e.message);
    }
  };

  function getElementWithEventListeners(el) {
    let element = el;

    while (element.parentElement) {
      if (typeof element.getLoadsterCapturedEventListeners === 'function') {
        const listeners = element.getLoadsterCapturedEventListeners();

        if (Object.keys(listeners).length) {
          console.log(listeners, element);
          break;
        } else {
          console.log('listeners not found');
        }

        element = element.parentElement;
      } else {
        console.log('no override');
        break;
      }
    }
  }

  events.forEach((type) => {
    window.addEventListener(type, recordEvent, true);
  });

  onMessage(RECORDING_STATUS, (message) => {
    console.log('recording event receiver', message.data);
    enabled = message.data.enabled;
    updateFilters(message.data.options);
  });
} else {
  console.log('already loaded');
}

