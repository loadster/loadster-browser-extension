const windowEventsToRecord = {
  'CLICK': 'click',
  'DBLCLICK': 'dblclick',
  'CHANGE': 'change',
  'SELECT': 'select',
  'SUBMIT': 'submit'
};

let enabled = false;

const sendMessage = (msg) => {
  try {
    browser.runtime.sendMessage({
      'type': USER_ACTION,
      'value': msg
    });
  } catch (err) {
    console.debug(
      'caught error', err
    );
  }
};

const recordEvent = (e) => {
  if (!enabled) {
    return;
  }

  const attrFilter = [
    'class',
    'id'
  ];

  /*
   * We explicitly catch any errors and swallow them, as none node-type events are also ingested.
   * for these events we cannot generate selectors, which is OK
   */
  try {
    let selector = finder(e.target, {
      'idName': (name) => true,
      'className': (name) => true, // !name.startsWith('is-') etc.
      'tagName': (name) => true,
      'attr': (name, value) => !attrFilter.includes(name),
      'seedMinLength': 1, // Min 1
      'optimizedMinLength': 2 // Min 2
    });
    const attrs = {};

    for (let i = 0, x = e.target.attributes, n = x.length; i < n; i++) {
      attrs[x[i].name] = x[i].value;
    }

    if (window.parent !== window) {
      let frame = window;
      const frameTag = window.frameElement ? window.frameElement.tagName.toLowerCase() : 'iframe';

      if (frame.name) {
        attrs.frameName = frame.name;

        selector = `${frameTag}[name="${frame.name}"] ${selector}`;
      } else {
        while (frame.parent !== frame) {
          for (let i = 0; i < frame.parent.frames.length; i++) {
            if (frame.parent.frames[i] === frame) {
              attrs.frameIndex = i;

              selector = `${frameTag}[${i}] ${selector}`;
            }
          }

          frame = frame.parent;
        }
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
      'href': e.target.href ? e.target.href : null
    };

    sendMessage(msg);
  } catch (e) {
    console.log(e.message);
  }
};



const events = Object.values(windowEventsToRecord);
events.forEach((type) => {
  window.addEventListener(
    type, recordEvent, true
  );
});

browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === RECORDING && !enabled) {
    enabled = true;
  } else if (msg.type === RECORDING_STOP) {
    enabled = false;
  }
});

