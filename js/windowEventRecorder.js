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
    const options = {};
    let enabled = false;

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

      const attrFilter = [
        'class',
        'id',
        'style'
      ];
      const attrRegexFilter = options.attrRegExp ? new RegExp(options.attrRegExp) : null;
      const idRegexFilter = options.idRegExp ? new RegExp(options.idRegExp) : null;

      /*
       * We explicitly catch any errors and swallow them, as none node-type events are also ingested.
       * for these events we cannot generate selectors, which is OK
       */
      try {
        let selector = finder(e.target, {
          'idName': (name) => {
            if (idRegexFilter && idRegexFilter.test(name)) return false;
            return true;
          },
          'className': (name) => true, // !name.startsWith('is-') etc.
          'tagName': (name) => true,
          'attr': (name, value) => {
            if (attrRegexFilter && attrRegexFilter.test(name)) return false;
            if (attrFilter.includes(name)) return false;
            return true;
          },
          'seedMinLength': 1, // Min 1
          'optimizedMinLength': 2 // Min 2
        });
        const attrs = {};

        for (let i = 0, x = e.target.attributes, n = x.length; i < n; i++) {
          attrs[x[i].name] = x[i].value;
        }

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

        selector = `${frameSelector} ${selector}`.trim();

        const textContent = e.target.textContent.trim();
        let textSelector = '';
        if (!e.target.children.length && textContent) {
          const isUnique = Array.from(document.querySelectorAll(e.target.tagName)).filter(el => el.textContent.trim() === textContent).length === 1;

          if (isUnique) {
            textSelector = `${frameSelector} text=${textContent}`.trim();
          }
        }

        const msg = {
          'timestamp': Date.now(),
          selector,
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
          Object.assign(options, msg.options);
        }
      } else if (msg.type === RECORDING_STOP) {
        enabled = false;
      }
    });

    window.loadster_event_recorder = true;
  }

  return true;
}(window.loadster_recording_finder));


