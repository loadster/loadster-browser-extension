try {
  importScripts('./browser-polyfill.min.js'); // v3
} catch (err) {
  console.log(err); // v2
}

const BLINK_TITLE = 'loadster_blink_title';
const NAVIGATE_URL = 'Url';
const PING = 'Ping';
const PONG = 'Pong';
const RECORDING = 'loadster_recording';
const RECORDING_EVENTS = 'RecordingEvents';
const RECORDING_STOP = 'RecordingStop';
const USER_ACTION = 'loadster_browser_event';
const OPTIONS = 'loadster_recording_options';

console.log('service-worker!');

async function setEnabled(value) {
  await browser.storage.local.set({ 'loadster.recording.enabled': value });
}

function generateId(prefix) {
  return `${prefix}_${Math.random().toString(36).substring(2, 9)}`;
}

function toBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const length = bytes.byteLength;

  for (let i = 0; i < length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary);
}

class Recorder {
  constructor(port) {
    this.port = port;
    this.tabIds = [];
    this.recordingOptions = {};
    this.tick = 0;

    port.onMessage.addListener(this.onPortMessage);
  }

  onPortMessage = async (msg) => {
    if (msg.type === OPTIONS) {
      Object.assign(this.recordingOptions, msg.value || {});
    } else if (msg.type === PING) {
      this.blinkTitle();
      this.pingRecording();

      this.port.postMessage({ type: PONG, enabled: true });
    } else if (msg.type === NAVIGATE_URL) {
      await this.createFirstTab(msg.value);
      await setEnabled(true);
    } else {
      console.log('got unexpected message: ', msg);
    }
  }

  onCreatedTab = async (tab) => {
    if (this.tabIds.some(id => (id === tab.openerTabId && id !== tab.id))) {
      console.log('onCreatedTab', tab);
      this.tabIds.push(tab.id);
    }
  }

  onUpdatedTab = async (tabId, changeInfo, tab) => {
    const completed = changeInfo.status === 'complete';
    const hasURL = /(http(s?)):\/\//i.test(tab.url);
    const fromPort = this.tabIds.includes(tabId);

    if (completed && hasURL && fromPort) {
      console.log('onUpdatedTab', tab);
      await this.injectForegroundScripts(tabId);
    }
  }

  onRemovedTab = (tabId) => {
    const index = this.tabIds.indexOf(tabId);
    if (index !== -1) {
      this.tabIds.splice(index, 1);
    }
    if (!this.tabIds.length) {
      this.port.postMessage({ type: RECORDING_STOP, data: 'No pages open' });
      console.log('stopping..');
    }
  }

  cleanup() {
    console.log(`removing listeners...`);
    this.tabIds.forEach(id => this.stopBlinkingTitle(id));

    this.port.onMessage.removeListener(this.onPortMessage);

    setEnabled(false);
  }

  async injectForegroundScripts(tabId) {
    console.log(`tab ${tabId} => executing scripts...`);
  }

  async createFirstTab(url) {
    console.log('initial tab url:', url);
    const tab = await browser.tabs.create({
      url,
      active: true,
    });

    this.tabIds.push(tab.id);
  }

  pingRecording() {
    this.tabIds.forEach(id => {
      browser.tabs.sendMessage(id, {
        type: RECORDING,
        options: this.recordingOptions // see windowEventRecorder.js
      }).catch(err => {
        // injectForegroundScripts race condition => "Could not establish connection. Receiving end does not exist."
        console.log(err);
      });
    });
  }

  blinkTitle() {
    this.tabIds.forEach(async id => {
      await browser.tabs.sendMessage(id, {
        type: BLINK_TITLE,
        value: this.tick
      }).catch(err => {
        // injectForegroundScripts race condition => "Could not establish connection. Receiving end does not exist."
        console.log(err);
      });
    });
    this.tick++;
  }

  async stopBlinkingTitle(tabId) {
    try {
      await browser.tabs.sendMessage(tabId, {
        type: BLINK_TITLE,
        value: null
      });
      browser.tabs.sendMessage(tabId, {
        type: RECORDING_STOP
      });
    } catch (err) {
      console.log(err);
    }
  }
}

class HttpRecorder extends Recorder {
  constructor(port) {
    super(port);

    this.requests = {}; // Requests are stored here until they are uploaded

    const filter = {
      urls: ['*://*/*'],
      types: ['main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'object', 'xmlhttprequest', 'other']
    };
    const isFirefox = typeof InstallTrigger !== 'undefined';
    const reqHeaders = [...(isFirefox ? [] : ['extraHeaders']), 'requestHeaders'];

    browser.webRequest.onBeforeRequest.addListener(this.requestUpdated, filter, ['requestBody']);
    browser.webRequest.onBeforeSendHeaders.addListener(this.requestUpdated, filter, reqHeaders);
    browser.webRequest.onSendHeaders.addListener(this.requestUpdated, filter, reqHeaders);
    browser.webRequest.onHeadersReceived.addListener(this.headersReceived, filter, ['responseHeaders']);
    browser.webRequest.onResponseStarted.addListener(this.requestUpdated, filter, ['responseHeaders']);
    browser.webRequest.onCompleted.addListener(this.finishRequest, filter, ['responseHeaders']);

    browser.tabs.onCreated.addListener(this.onCreatedTab);
    browser.tabs.onUpdated.addListener(this.onUpdatedTab);
    browser.tabs.onRemoved.addListener(this.onRemovedTab);

    port.onDisconnect.addListener(this.removeListeners);
  }

  removeListeners = () => {
    super.cleanup();

    browser.tabs.onCreated.removeListener(this.onCreatedTab);
    browser.tabs.onUpdated.removeListener(this.onUpdatedTab);
    browser.tabs.onRemoved.removeListener(this.onRemovedTab);

    browser.webRequest.onBeforeRequest.removeListener(this.requestUpdated);
    browser.webRequest.onBeforeSendHeaders.removeListener(this.requestUpdated);
    browser.webRequest.onSendHeaders.removeListener(this.requestUpdated);
    browser.webRequest.onHeadersReceived.removeListener(this.headersReceived);
    browser.webRequest.onResponseStarted.removeListener(this.requestUpdated);
    browser.webRequest.onCompleted.removeListener(this.finishRequest);

    this.port.onDisconnect.removeListener(this.removeListeners);
  }

  injectForegroundScripts = async (tabId) => {
    await super.injectForegroundScripts(tabId);
    const { manifest_version } = browser.runtime.getManifest();

    console.log({ manifest_version });

    try {
      await browser.tabs.sendMessage(tabId, {
        text: 'loadster-content-scripts'
      });
      console.log('content scripts are already loaded.. tabId:', tabId);
    } catch (err) {
      console.log('content scripts not found. injecting...: ', err);
      try {
        if (manifest_version === 3) {
          await browser.scripting.executeScript({
            target: {
              tabId,
              allFrames: true
            },
            files: [
              'js/browser-polyfill.min.js',
              'js/blinker.js',
            ],
          });
        } else {
          await browser.tabs.executeScript(tabId, { file: 'js/browser-polyfill.min.js' });
          await browser.tabs.executeScript(tabId, { file: 'js/blinker.js' });
        }

        console.log('content scripts are ready', tabId);
      } catch (err) {
        console.log(err);
      }
    }
  }
  //
  // Stores a request if we haven't seen it before; otherwise updates it.
  //
  requestUpdated = async (info) => {
    const IGNORED_PREFIXES = [
      'http://localhost',
      'https://loadster.app',
      'https://speedway.app'
    ];
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
        if (!this.requests[info.requestId]) {
          this.requests[info.requestId] = {
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
          if (Object.prototype.hasOwnProperty.call(info, prop)) {
            this.requests[info.requestId][prop] = info[prop];
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
  headersReceived = async (info) => {
    await this.requestUpdated(info);

    if (info.statusCode === 301 || info.statusCode === 302) {
      await this.requestRedirected(info);
    }
  }
  //
  // Clones a request when it is redirected, marking the redirected one as complete and
  // keeping the original for further updates.
  //
  requestRedirected = async (info) => {
    const request = this.requests[info.requestId];

    if (request) {
      const redirected = {};

      for (let prop in request) {
        if (Object.prototype.hasOwnProperty.call(request, prop)) {
          redirected[prop] = request[prop];
        }
      }

      request.timeStarted = new Date().getTime();

      redirected.requestId = request.requestId + '_' + Math.round(Math.random() * 1000000);
      redirected.completed = true;
      redirected.timeCompleted = new Date().getTime();

      this.requests[redirected.requestId] = redirected;

      await this.uploadRequest(this.requests[redirected.requestId], redirected.requestId);

      delete this.requests[redirected.requestId];
    }
  }
  //
  // Finishes a normal request, marking it completed.
  //
  finishRequest = async (info) => {
    await this.requestUpdated(info);

    if (info.requestId && this.requests[info.requestId]) {
      this.requests[info.requestId].completed = true;
      this.requests[info.requestId].timeCompleted = new Date().getTime();

      await this.uploadRequest(this.requests[info.requestId], info.requestId);

      delete this.requests[info.requestId];
    }
  }

  async uploadRequest(request, id) {
    if (this.tabIds.includes(request.tabId)) {
      try {
        console.log(`uploadRequest to port: ${this.port.name}`, request);
        await this.port.postMessage({
          type: RECORDING_EVENTS,
          data: {
            http: { [id]: request },
            browser: {}
          }
        });
      } catch (err) {
        console.log(err);
      }
    }
  }
}

class BrowserRecorder extends Recorder {
  constructor(port) {
    super(port);

    browser.webNavigation.onCommitted.addListener(this.navigationCommitted);
    browser.runtime.onMessage.addListener(this.onRuntimeMessage);

    browser.tabs.onUpdated.addListener(this.onUpdatedTab);
    browser.tabs.onRemoved.addListener(this.onRemovedTab);

    port.onDisconnect.addListener(this.removeListeners);
  }

  removeListeners = () => {
    super.cleanup();

    browser.tabs.onUpdated.removeListener(this.onUpdatedTab);
    browser.tabs.onRemoved.removeListener(this.onRemovedTab);

    browser.webNavigation.onCommitted.removeListener(this.navigationCommitted);
    browser.runtime.onMessage.removeListener(this.onRuntimeMessage);

    this.port.onDisconnect.removeListener(this.removeListeners);
  }

  async injectForegroundScripts(tabId, frameId = null) {
    await super.injectForegroundScripts(tabId);

    try {
      await browser.tabs.sendMessage(tabId, { text: 'loadster-content-scripts' }, { frameId });

      console.log(`content scripts are already loaded... tabId: ${tabId}, frameId: ${frameId}`);
    } catch (err) {
      console.log(`content scripts not found. injecting into tabId: ${tabId}, frameId: ${frameId}`, err);

      try {
        const { manifest_version } = browser.runtime.getManifest();
        const allFrames = !frameId;

        if (manifest_version === 3) {
          const frameIds = frameId ? [frameId] : null;

          await browser.scripting.executeScript({
            target: {
              tabId,
              frameIds,
              allFrames
            },
            files: [
              'js/browser-polyfill.min.js',
              'js/finder.js',
              'js/blinker.js',
              'js/windowEventRecorder.js'
            ],
          });
        } else {
          await browser.tabs.executeScript(tabId, { file: 'js/browser-polyfill.min.js', frameId, allFrames });
          await browser.tabs.executeScript(tabId, { file: 'js/blinker.js' });
          await browser.tabs.executeScript(tabId, { file: 'js/finder.js', frameId, allFrames });
          await browser.tabs.executeScript(tabId, { file: 'js/windowEventRecorder.js', frameId, allFrames });
        }

        console.log('content scripts are ready', tabId, frameId);
      } catch (err) {
        console.log(err);
      }
    }
  }

  async uploadBrowserEvent(event) {
    if (this.tabIds.includes(event.tabId)) {
      console.log('uploadBrowserEvent', this.tabIds, event);
      try {
        await this.port.postMessage({
          type: RECORDING_EVENTS,
          data: {
            http: {},
            browser: {
              [generateId(event.action)]: event
            }
          }
        });
      } catch (err) {
        console.log(err);
      }
    }
  }

  navigationCommitted = (details) => {
    const { tabId, frameId, ...data } = details;
    const subframeTransitions = ['auto_subframe', 'manual_subframe'];

    if (this.tabIds.includes(tabId)) {
      if (subframeTransitions.includes(data.transitionType)) {
        console.log('navigationCommitted in sub-frame', frameId, details);

        this.injectForegroundScripts(tabId, frameId);
      } else {
        console.log('navigationCommitted', details, this.tabIds);

        const action = 'navigate';

        this.uploadBrowserEvent({action, data, tabId});
      }
    }
  }

  onRuntimeMessage = (msg, sender) => {
    if (msg.type === USER_ACTION) {
      const { action, ...data } = msg.value;
      const tabId = sender.tab.id;

      this.uploadBrowserEvent({ action, data, tabId });
    }
  }
}

browser.runtime.onConnect.addListener((port) => {
  console.log('onConnect:port', port);
  if (port.name === 'loadster-http-recorder') {
    console.log('setupHttpRecorder');
    new HttpRecorder(port);
  } else if (port.name === 'loadster-browser-recorder') {
    console.log('setupBrowserRecorder');
    new BrowserRecorder(port);
  }
});
