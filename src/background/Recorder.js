import browser from 'webextension-polyfill';
import { onMessage, sendMessage } from 'webext-bridge/background';
import { PING, PONG, RECORDING_STOP } from '../constants.js';

function indicateRecording(count) {
  const iconA = String.fromCodePoint(0x25CF);
  const iconB = String.fromCodePoint(0x25CB);

  if (!window.loadsterOriginalTitle) {
    window.loadsterOriginalTitle = window.document.title;
  }

  if (count) {
    window.document.title = `${++count % 2 ? iconA : iconB} ${window.loadsterOriginalTitle}`;
  } else {
    window.document.title = window.loadsterOriginalTitle;
  }
}

export default class Recorder {
  constructor(port, channel) {
    this.port = port;
    this.tabIds = [];
    this.tick = 0;
    this.channel = channel; // content-script@port.sender.tab.id (content.js tab id)
    this.recording = false;
    this.manifest_version = browser.runtime.getManifest().manifest_version;

    onMessage(PING, () => {
      this.blinkTitle();

      sendMessage(PONG, { enabled: true }, channel);
    });

    onMessage(RECORDING_STOP, () => {
      this.stopAndCleanup();
      this.port.disconnect();
    });

    this.addTabListeners();

    port.onDisconnect.addListener(this.stopAndCleanup.bind(this));
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
      console.log('Stop recording from the background', this.channel);
      sendMessage(RECORDING_STOP, {}, this.channel);
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
    const tab = await browser.tabs.create({ url, active: true });

    this.tabIds.push(tab.id);
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
