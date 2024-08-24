import browser from 'webextension-polyfill';
import { onMessage, sendMessage } from 'webext-bridge/background';
import Recorder from './Recorder.js';
import { NAVIGATE_URL, RECORDING_EVENTS } from '../constants.js';
import { toBase64 } from './utils.js';

// eslint-disable-next-line no-undef
console.log('content.js', __BROWSER__);

export default class HttpRecorder extends Recorder {
  constructor(port, channel) {
    super(port, channel);

    this.requests = {}; // Requests are stored here until they are uploaded

    onMessage(NAVIGATE_URL, async message => {
      this.recording = true;

      const tab = await this.createFirstTab(message.data.value);
      console.log('first tab', tab);
    });

    this.addWebRequestListeners();
  }

  addWebRequestListeners() {
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
  }

  removeWebRequestListeners = () => {
    browser.webRequest.onBeforeRequest.removeListener(this.requestUpdated);
    browser.webRequest.onBeforeSendHeaders.removeListener(this.requestUpdated);
    browser.webRequest.onSendHeaders.removeListener(this.requestUpdated);
    browser.webRequest.onHeadersReceived.removeListener(this.headersReceived);
    browser.webRequest.onResponseStarted.removeListener(this.requestUpdated);
    browser.webRequest.onCompleted.removeListener(this.finishRequest);
  };

  stopAndCleanup() {
    super.stopAndCleanup();

    this.removeWebRequestListeners();
    console.log('disconnected');
  }

  /**
   * Stores a request if we haven't seen it before; otherwise updates it.
   */
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
        console.warn(err);
      }
    }
  };
  //
  // Updates a request and checks if it's being redirected.
  //
  headersReceived = async (info) => {
    await this.requestUpdated(info);

    if (info.statusCode === 301 || info.statusCode === 302) {
      await this.requestRedirected(info);
    }
  };
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
  };
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
  };

  async uploadRequest(request, id) {
    if (this.tabIds.includes(request.tabId)) {
      console.log(`uploadRequest`, request);
      sendMessage(RECORDING_EVENTS, {
        http: { [id]: request },
        browser: {}
      }, this.channel);
    }
  }
}
