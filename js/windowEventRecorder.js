(function (finder) {
  if (!window.loadster_event_recorder) {
    const RECORDING = 'loadster_recording';
    const RECORDING_STOP = 'RecordingStop';
    const USER_ACTION = 'loadster_browser_event';

    const windowEventsToRecord = {
      'CLICK': 'click',
      'DBLCLICK': 'dblclick',
      'CHANGE': 'change',
      'SELECT': 'select',
      'SUBMIT': 'submit'
    };
    const filters = {
      idName: [],
      className: [],
      tagName: [],
      attr: [],
    }
    let enabled = false;

    function isValidRegex(str) {
      let isValid = true;

      try {
        new RegExp(str);
      } catch(e) {
        isValid = false;
      }

      return isValid
    }

    function updateFilters(options = {}) {
      const { attrRegExp, idRegExp, customPatterns } = options

      if (attrRegExp && isValidRegex(attrRegExp)) {
        filters.attr.push(new RegExp(attrRegExp))
      }
      if (idRegExp && isValidRegex(idRegExp)) {
        filters.idName.push(new RegExp(idRegExp))
      }
      if (customPatterns && customPatterns.length) {
        customPatterns.forEach(f => {
          if (filters.hasOwnProperty(f.key) && f.value && f.value.trim() && isValidRegex(f.value)) {
            filters[f.key].push(new RegExp(f.value))
          }
        })
      }
    }

    const sendMessage = (msg) => {
      try {
        browser.runtime.sendMessage({
          'type': USER_ACTION,
          'value': msg
        });
      } catch (err) {
        // console.log(err);
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
            return !filters.idName.some(p => p.test(value))
          },
          'className': (value) => {
            return !filters.className.some(p => p.test(value))
          },
          'tagName': (name) => {
            return !filters.tagName.some(p => p.test(name))
          },
          'attr': (name, value) => {
            return !['class', 'id', 'style'].includes(name) && !filters.attr.some(p => p.test(name)) && !filters.idName.some(p => p.test(value))
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

        sendMessage(msg);
      } catch (e) {
        // console.log(e.message);
      }
    };

    const events = Object.values(windowEventsToRecord);

    events.forEach((type) => {
      window.addEventListener(type, recordEvent, true);
    });

    browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.type === RECORDING && !enabled) {
        enabled = true;
        if (msg.options) {
          updateFilters(msg.options)
        }
      } else if (msg.type === RECORDING_STOP) {
        enabled = false;
      }
    });

    window.loadster_event_recorder = true;
  }

  return true;
}(window.loadster_recording_finder));


