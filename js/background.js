const INTERVAL = 1000;

const IGNORED_PREFIXES = [
  'https://loadster.app',
  'https://speedway.app'
];
const manifest = browser.runtime.getManifest();
const defaultRecordingOptions = {};
let requests = {}; // Requests are stored here until they are uploaded
let browserEvents = {};
let ports = []; // Listeners from the Loadster website that want to receive recording events

function generateId(prefix) {
  return `${prefix}_${Math.random().toString(36).substr(2, 9)}`;
}

function handleFirstRun(details) {
  if (details.reason === 'install') {
    localStorage['loadster.recording.enabled'] = 'true';
  }
}

//
// Stores a request if we haven't seen it before; otherwise updates it.
//
async function requestUpdated(info) {
  if (Math.sign(info.tabId) >= 0) {
    try {
      const tab = await browser.tabs.get(info.tabId);
      if (tab.url) {
        for (let i = 0; i < IGNORED_PREFIXES.length; i++) {
          if (tab.url.indexOf(IGNORED_PREFIXES[i]) === 0) {
            return;
          }
        }
      }

      // Track the request start time if it's a new request
      if (!requests[info.requestId]) {
        requests[info.requestId] = {
          timeStarted: new Date().getTime()
        };
      }

      // Base64 encode the body parts if necessary
      // TODO recording file uploads. consider to use FileReader here
      if (info.requestBody && info.requestBody.raw) {
        for (let i = 0; i < info.requestBody.raw.length; i++) {
          const part = info.requestBody.raw[i];

          if (part.bytes) {
            part.base64 = toBase64(part.bytes);
          }
        }
      }

      // Copy properties
      for (let prop in info) {
        if (info.hasOwnProperty(prop)) {
          requests[info.requestId][prop] = info[prop];
        }
      }
    } catch (err) {
      console.error(err);
    }
  }
}

//
// Updates a request and checks if it's being redirected.
//
async function headersReceived(info) {
  await requestUpdated(info);

  if (info.statusCode === 301 || info.statusCode === 302) {
    requestRedirected(info);
  }
}

//
// Clones a request when it is redirected, marking the redirected one as complete and
// keeping the original for further updates.
//
function requestRedirected(info) {
  const request = requests[info.requestId];

  if (request) {
    const redirected = {};

    for (let prop in request) {
      if (request.hasOwnProperty(prop)) {
        redirected[prop] = request[prop];
      }
    }

    request.timeStarted = new Date().getTime();

    redirected.requestId = request.requestId + '_' + Math.round(Math.random() * 1000000);
    redirected.completed = true;
    redirected.timeCompleted = new Date().getTime();

    requests[redirected.requestId] = redirected;
  }
}

//
// Finishes a normal request, marking it completed.
//
async function finishRequest(info) {
  await requestUpdated(info);

  if (info.requestId && requests[info.requestId]) {
    requests[info.requestId].completed = true;
    requests[info.requestId].timeCompleted = new Date().getTime();
  }
}

//
// Checks if recording is enabled
//
function isEnabled() {
  return localStorage['loadster.recording.enabled'] == 'true';
}

//
// Reads an array buffer into a Base64 string
//
function toBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const length = bytes.byteLength;

  for (let i = 0; i < length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return window.btoa(binary);
}

function blinkTitle(tick, port) {
  port.tabIds.forEach(id => {
    browser.tabs.sendMessage(id, {
      type: BLINK_TITLE,
      value: tick
    }).catch(err => { });
    browser.tabs.sendMessage(id, {
      type: RECORDING,
      options: defaultRecordingOptions
    }).catch(err => { });
  });
}

function stopBlinkingTitle(tabId) {
  browser.tabs.sendMessage(tabId, {
    type: BLINK_TITLE,
    value: null
  }).catch(err => { });
  browser.tabs.sendMessage(tabId, {
    type: RECORDING_STOP
  }).catch(err => { });
}

function handleCreatedTab(created, port) {
  if (port.tabIds.some(id => (id === created.openerTabId && id !== created.id))) {
    port.tabIds.push(created.id);
  }
}

function handleRemovedTab(tabId, port) {
  const index = port.tabIds.indexOf(tabId);
  if (index !== -1) {
    port.tabIds.splice(index, 1);
  }
  if (!port.tabIds.length) {
    port.postMessage({ type: RECORDING_STOP, data: 'No pages open' });
  }
}

function handleCreatedRootTab(tab, port) {
  port.tabIds.push(tab.id);

  browser.tabs.onCreated.addListener((created) => handleCreatedTab(created, port));
  browser.tabs.onRemoved.addListener((tabId, info) => handleRemovedTab(tabId, port));
}

function navigationCommitted(details) {
  details.timestamp = Date.now();
  const { tabId, ...data } = details;
  const ignoredTransitions = ['auto_subframe', 'manual_subframe', 'link', 'form_submit'];

  if (!ignoredTransitions.includes(data.transitionType) && ports.some(p => p.tabIds.includes(tabId))) {
    const action = 'navigate';
    browserEvents[generateId(action)] = { action, data, tabId };
  }
}

//
// Create a catch-all filter so we see all types of content
//
const filter = {
  urls: ['*://*/*'],
  types: ['main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'object', 'xmlhttprequest', 'other']
};
const isFirefox = typeof InstallTrigger !== 'undefined';
const reqHeaders = [...(isFirefox ? [] : ['extraHeaders']), 'requestHeaders'];

browser.webRequest.onBeforeRequest.addListener(requestUpdated, filter, ['blocking', 'requestBody']);
browser.webRequest.onBeforeSendHeaders.addListener(requestUpdated, filter, reqHeaders);
browser.webRequest.onSendHeaders.addListener(requestUpdated, filter, reqHeaders);
browser.webRequest.onHeadersReceived.addListener(headersReceived, filter, ['blocking', 'responseHeaders']);
browser.webRequest.onResponseStarted.addListener(requestUpdated, filter, ['responseHeaders']);
browser.webRequest.onCompleted.addListener(finishRequest, filter, ['responseHeaders']);

browser.runtime.onInstalled.addListener(handleFirstRun);
browser.webNavigation.onCommitted.addListener(navigationCommitted);
//
// Listen for messages from the Loadster dashboard
//
browser.runtime.onConnect.addListener(function (port) {
  console.assert(port.name === 'loadster-recorder', 'Only accepting incoming messages from loadster-recorder');

  console.log('Adding port ', port);
  port.tabIds = [];
  ports.push(port);
  let tick = 0;

  port.onMessage.addListener(async function (msg) {
    if (msg.type === OPTIONS) {
      Object.assign(defaultRecordingOptions, msg.value || {});
    } else if (msg.type === PING) {
      blinkTitle(tick, port);
      port.postMessage({ type: PONG, enabled: isEnabled() });
      tick++;
    } else if (msg.type === NAVIGATE_URL) {
      const action = 'navigate';
      const url = msg.value;
      const tab = await browser.tabs.create({
        url,
        active: true,
      });

      handleCreatedRootTab(tab, port);

      browserEvents[generateId(action)] = { action, data: { url, timestamp: Date.now() }, tabId: tab.id };
    } else {
      console.log('got unexpected message: ', msg);
    }
  });

  port.onDisconnect.addListener(function () {
    console.log('Removing port ', port);

    port.tabIds.forEach(id => {
      stopBlinkingTitle(id);
    });
    ports.splice(ports.indexOf(port), 1);

    tick = 0;
  });
});

browser.runtime.onMessage.addListener(function (msg, sender) {
  if (msg.type === USER_ACTION) {
    const { action, ...data } = msg.value;

    browserEvents[generateId(action)] = {
      action,
      data,
      tabId: sender.tab.id
    };
  }
});

browser.tabs.onActivated.addListener(async function (activeInfo) {
  const tabId = activeInfo.tabId;
  const tabInfo = await browser.tabs.get(tabId);

  if (tabInfo.status === 'complete' && tabInfo.url && tabInfo.url.match(/localhost|loadster.app|speedway.app/g)) {
    // check if content_script loaded
    try {
      await browser.tabs.sendMessage(tabId, {
        text: CONTENT_SCRIPT_LOADED
      });
    } catch (err) {
      console.log(err.message); // Could not establish connection. Receiving end does not exist.

      manifest.content_scripts.forEach(data => {
        data.js.forEach(script => {
          browser.tabs.executeScript(tabId, { file: script });
        });
      });
    }
  }
});

//
// Upload events to Loadster at set intervals
//
setInterval(function () {
  const upload = {
    http: {},
    browser: {}
  };

  for (let requestId in requests) {
    if (requests.hasOwnProperty(requestId) && requests[requestId].completed) {
      upload.http[requestId] = requests[requestId];

      delete requests[requestId];
    }
  }
  for (let eventId in browserEvents) {
    if (browserEvents.hasOwnProperty(eventId)) {
      upload.browser[eventId] = browserEvents[eventId];

      delete browserEvents[eventId];
    }
  }

  if (Object.keys(upload.http).length || Object.keys(upload.browser).length && isEnabled()) {
    console.log('Sending recording events to ' + ports.length + ' port(s)');

    ports.forEach(function (port) {
      const filteredHttpEvents = Object.keys(upload.http)
        .filter(key => port.tabIds.includes(upload.http[key].tabId))
        .reduce((obj, key) => ({
          ...obj,
          [key]: upload.http[key]
        }), {});

      const filteredBrowserEvents = Object.keys(upload.browser)
        .filter(key => port.tabIds.includes(upload.browser[key].tabId))
        .reduce((obj, key) => ({
          ...obj,
          [key]: upload.browser[key]
        }), {});


      port.postMessage({
        type: RECORDING_EVENTS,
        data: {
          http: filteredHttpEvents,
          browser: filteredBrowserEvents
        }
      });
    });
  }
}, INTERVAL);

