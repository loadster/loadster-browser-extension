import browser, { type ContentScripts } from 'webextension-polyfill';
import { BridgeEvent, type LoadsterPortMessage, type LoadsterRecorderStatus, type RecordingOptions, RecorderMessageType } from '../../index';

const { RECORDING_STATUS, RECORDING_STOP, OPTIONS } = RecorderMessageType;
const { PING, PONG } = BridgeEvent;

export interface iLoadsterRecorder {
  manifest_version: number;
  recording: boolean;
  recordingOptions: RecordingOptions;
  tabIds: Set<number>;
  tick: number;
  port: browser.Runtime.Port;
  getStatus: () => LoadsterRecorderStatus;
}

export default class Recorder implements iLoadsterRecorder {
  recording: boolean = false;
  recordingOptions: RecordingOptions = {};
  port: browser.Runtime.Port; // background script
  pagePort: browser.Runtime.Port; // content tab
  registeredScripts: ContentScripts.RegisteredContentScript[] = [];
  tabIds: Set<number> = new Set();
  tick: number = 0;
  manifest_version: number = browser.runtime.getManifest().manifest_version;
  permissions: Record<string, boolean> = {};

  private boundOnCreatedTab = this.onCreatedTab.bind(this);
  private boundOnRemovedTab = this.onRemovedTab.bind(this);
  private boundStopAndCleanup = this.stopAndCleanup.bind(this);

  constructor(port: browser.Runtime.Port) {
    this.port = port;

    this.checkPermissions().then(permissions => Object.assign(this.permissions, permissions));

    this.port.onMessage.addListener((message: LoadsterPortMessage) => {
      if (message.type === PING) {
        this.port.postMessage({ type: PONG, data: { enabled: true, permissions: this.permissions } });
        if (this.tabIds.size > 0) {
          this.blinkTitle();
        }
      } else if (message.type === RECORDING_STOP) {
        this.stopAndCleanup();
        this.port.disconnect();
      } else if (message.type === OPTIONS) {
        Object.assign(this.recordingOptions, message.data.value);
      } else {
        console.log(message.type);
      }
    });

    this.addTabListeners();

    port.onDisconnect.addListener(this.boundStopAndCleanup);

    browser.runtime.onMessage.addListener((message, sender) => {
      if (sender.id !== this.port.sender.id) return;

      if (message.type === RECORDING_STATUS) {
        return this.getStatus();
      }
    });
  }

  async checkPermissions() {
    const incognito = await browser.extension.isAllowedIncognitoAccess();

    return {
      incognito: incognito
    };
  }

  getStatus() {
    return {
      enabled: this.recording,
      options: this.recordingOptions,
      permissions: this.permissions,
    };
  }

  onCreatedTab(tab: browser.Tabs.Tab) {
    if (this.tabIds.has(tab.openerTabId) && tab.openerTabId !== tab.id) {
      this.tabIds.add(tab.id);
    }
  }

  onRemovedTab(tabId: number) {
    this.tabIds.delete(tabId);

    if (this.tabIds.size === 0) {
      this.port.postMessage({ type: RECORDING_STOP });
    }
  }

  addTabListeners() {
    browser.tabs.onCreated.addListener(this.boundOnCreatedTab);
    browser.tabs.onRemoved.addListener(this.boundOnRemovedTab);
  }

  removeTabListeners() {
    browser.tabs.onCreated.removeListener(this.boundOnCreatedTab);
    browser.tabs.onRemoved.removeListener(this.boundOnRemovedTab);
  }

  stopAndCleanup() {
    this.removeTabListeners();
    this.stopBlinkingTitle();
    this.recording = false;
  }

  async createFirstTab(url: string) {
    const { incognito, newWindow } = this.recordingOptions;
    const incognitoAllowed = incognito ? await browser.extension.isAllowedIncognitoAccess() : false;

    let tab: browser.Tabs.Tab;

    if (incognitoAllowed || newWindow) {
      const window = await browser.windows.create({ url, incognito: incognitoAllowed });
      tab = (window.tabs ?? await browser.tabs.query({ windowId: window.id }))[0];
    } else {
      tab = await browser.tabs.create({ url, active: true });
    }

    this.tabIds.add(tab.id);

    return tab;
  }

  blinkTitle() {
    this.tabIds.forEach(tabId => this.blinkTabTitle(tabId, this.tick));
    this.tick++;
  }

  stopBlinkingTitle() {
    this.tabIds.forEach(tabId => this.blinkTabTitle(tabId, null));
    this.tick = 0;
  }

  async blinkTabTitle(tabId: number, count: number) {
    try {
      if (this.manifest_version === 3) {
        await browser.scripting.executeScript({
          target: { tabId },
          func: indicateRecording,
          args: [count]
        });
      } else {
        await browser.tabs.executeScript(tabId, {
          code: `
            if (!window.indicateLoadsterRecording) {
              window.indicateLoadsterRecording = ${indicateRecording};
            }
          `
        });
        await browser.tabs.executeScript(tabId, {
          code: `if (window.indicateLoadsterRecording) { window.indicateLoadsterRecording(${count}); }`
        });
      }
    } catch (err) {
      console.log(err.message);
    }
  }
}

function indicateRecording(count: number) {
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
