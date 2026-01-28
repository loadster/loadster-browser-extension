import browser from 'webextension-polyfill';
import { PING, PONG, RECORDING_STOP, OPTIONS } from '../constants.js';

function indicateRecording(count) {
  const iconA = String.fromCodePoint(0x25CF);
  const iconB = String.fromCodePoint(0x25CB);

  if (window.loadsterOriginalTitle === undefined) {
    window.loadsterOriginalTitle = window.document.title;
  }

  if (count) {
    window.document.title = `${++count % 2 ? iconA : iconB} ${window.loadsterOriginalTitle}`;
  } else {
    window.document.title = window.loadsterOriginalTitle;
  }
}

function sendMessage(type, data, port) {
  try {
    port.postMessage({ type, data });
  } catch (err) {
    console.warn('sendMessage failed:', err.message);
  }
}

export default class Recorder {
  constructor(port) {
    this.port = port;
    this.tabIds = [];
    this.tick = 0;
    this.recording = false;
    this.recordingOptions = {};
    this.manifest_version = browser.runtime.getManifest().manifest_version;
    this.permissions = {};

    this.checkPermissions().then(permissions => Object.assign(this.permissions, permissions));

    this.port.onMessage.addListener((message) => {
      if (message.type === PING) {
        this.blinkTitle();
        sendMessage(PONG, { enabled: true, permissions: this.permissions }, port);
      } else if (message.type === RECORDING_STOP) {
        this.stopAndCleanup();
        this.port.disconnect();
      } else if (message.type === OPTIONS) {
        Object.assign(this.recordingOptions, message.data.value);
      }
    });

    this.addTabListeners();

    port.onDisconnect.addListener(this.stopAndCleanup.bind(this));
  }

  async checkPermissions() {
    const incognito = await browser.extension.isAllowedIncognitoAccess();

    return {
      incognito: incognito
    };
  }

  async getStatus () {
    return {
      enabled: this.recording,
      options: this.recordingOptions
    };
  }

  onCreatedTab(tab) {
    if (this.tabIds.some(id => (id === tab.openerTabId && id !== tab.id))) {
      this.tabIds.push(tab.id);
    }
  }

  onRemovedTab(tabId) {
    const index = this.tabIds.indexOf(tabId);

    if (index !== -1) {
      this.tabIds.splice(index, 1);
    }

    if (this.tabIds.length === 0) {
      sendMessage(RECORDING_STOP, {}, this.port);
    }
  }

  addTabListeners() {
    browser.tabs.onCreated.addListener(this.onCreatedTab.bind(this));
    browser.tabs.onRemoved.addListener(this.onRemovedTab.bind(this));
  }

  removeTabListeners() {
    browser.tabs.onCreated.removeListener(this.onCreatedTab);
    browser.tabs.onRemoved.removeListener(this.onRemovedTab);
  }

  injectForegroundScripts() {
  }

  stopAndCleanup() {
    this.removeTabListeners();
    this.stopBlinkingTitle();
    this.recording = false;
  }

  async createFirstTab(url) {
    if (this.recordingOptions.incognito) {
      const isAllowed = await browser.extension.isAllowedIncognitoAccess();

      if (isAllowed) {
        const window = await browser.windows.create({ url, incognito: true });
        const tabs = window.tabs || await browser.tabs.query({ windowId: window.id });

        this.tabIds.push(tabs[0].id);
      } else {
        // Extension is not allowed in incognito mode. Starting in normal mode instead.
        const tab = await browser.tabs.create({ url, active: true });
        this.tabIds.push(tab.id);
      }
    } else {
      const tab = await browser.tabs.create({ url, active: true });
      this.tabIds.push(tab.id);
    }
  }

  blinkTitle() {
    this.tabIds.forEach(tabId => this.blinkTabTitle(tabId, this.tick));
    this.tick++;
  }

  stopBlinkingTitle() {
    this.tabIds.forEach(tabId => this.blinkTabTitle(tabId, null));
    this.tick = 0;
  }

  async blinkTabTitle(tabId, count) {
    try {
      if (this.manifest_version === 3) {
        await browser.scripting.executeScript({
          target: { tabId },
          func: indicateRecording,
          args: [count],
        });
      } else {
        await browser.tabs.executeScript(tabId, {
          code: `
            if (!window.indicateLoadsterRecording) {
              window.indicateLoadsterRecording = ${indicateRecording};
            }
          `,
        });
        await browser.tabs.executeScript(tabId, {
          code: `if (window.indicateLoadsterRecording) { window.indicateLoadsterRecording(${count}); }`,
        });
      }
    } catch (err) {
      console.log(err.message);
    }
  }
}
