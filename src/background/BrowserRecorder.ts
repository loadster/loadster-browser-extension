import browser from 'webextension-polyfill';
import Recorder from './Recorder';
import { generateId } from './utils.js';
import { type BrowserEvent, type LoadsterPortMessage, RecorderMessageType, type RecordingTrackingData } from '../../index';
import { parseRecorderConfig } from '../utils/messagingUtils';

const { ENDPOINT_PAGE_CONNECT, NAVIGATE_URL, RECORDING_STATUS, RECORDING_EVENTS, USER_ACTION, RECORDING_TRACKING } = RecorderMessageType;

// eslint-disable-next-line no-undef
const isFirefox = __BROWSER__ === 'firefox';

const SCRIPT_IDS = {
  recorder: 'loadster-locator-recorder',
};

export default class BrowserRecorder extends Recorder {
  pageContentScriptId = SCRIPT_IDS.recorder;

  static async cleanupStaleScripts() {
    if (browser.runtime.getManifest().manifest_version === 3) {
      try {
        await browser.scripting.unregisterContentScripts();
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (e: any) {
        // Scripts weren't registered, that's fine
      }
    }
  }

  constructor(port: browser.Runtime.Port) {
    super(port);

    port.onMessage.addListener(async (message: LoadsterPortMessage) => {
      if (message.type === NAVIGATE_URL) {
        this.recording = true;

        await this.createFirstTab(message.data.value);
        this.uploadBrowserEvent({
          action: 'navigate',
          tabId: this.tabIds.values().next().value,
          data: {
            url: message.data.value
          }
        });
      }
    });

    browser.webNavigation.onCommitted.addListener(this.navigationCommitted.bind(this));
    this.registerPageContentScripts().then(() => {});

    browser.runtime.onConnect.addListener(async (port) => {
      const config = parseRecorderConfig(port.name);

      if (config.endpointName === ENDPOINT_PAGE_CONNECT) {
        this.setupPageContentPort(port);
      }
    });
  }

  onCreatedTab(tab: browser.Tabs.Tab) {
    if (this.tabIds.has(tab.openerTabId) && tab.openerTabId !== tab.id) {
      this.stopBlinkingTitle();
      this.tabIds.clear();
      this.tabIds.add(tab.id);
    }
  }

  setupPageContentPort(pagePort: browser.Runtime.Port) {
    this.pagePort = pagePort;

    pagePort.onMessage.addListener((msg: LoadsterPortMessage) => {
      if (msg.type === USER_ACTION) {
        this.uploadBrowserEvent(msg.data as unknown as BrowserEvent);
      }
    });

    // Ensure the page script receives recording status after the port is ready.
    this.updateWindowsRecordingStatus();
  }

  sendMessageToLoadster(type: string, data: unknown) {
    try {
      this.port.postMessage({ type, data });
    } catch (err) {
      console.warn(err);
    }
  }

  sendMessageToPage(type: string, data: unknown) {
    try {
      this.pagePort?.postMessage({ type, data });
    } catch (err) {
      // Attempting to use a disconnected port object
      console.warn(err);
    }
  }

  async registerPageContentScripts() {
    const { manifest_version } = browser.runtime.getManifest();

    const excludeMatches = ['*://localhost/*', 'https://loadster.com/*', 'https://loadster.app/*'];

    if (manifest_version === 3) {
      await BrowserRecorder.cleanupStaleScripts();

      await browser.scripting.registerContentScripts([
        {
          matches: ['*://*/*'],
          excludeMatches,
          js: ['src/content/locatorRecorder.js'],
          id: SCRIPT_IDS.recorder,
          allFrames: true,
          matchOriginAsFallback: true,
          runAt: 'document_end',
          world: 'MAIN',
        },
      ]);
    } else {
      const recorderScript = await browser.contentScripts.register({
        matches: ['*://*/*'],
        excludeMatches,
        js: [{
          file: 'src/content/locatorRecorder.js'
        }],
        allFrames: true,
        matchAboutBlank: true,
        runAt: 'document_end',
        world: 'MAIN',
      });

      // @ts-ignore
      this.registeredScripts.push(recorderScript);
    }
  }

  stopAndCleanup() {
    super.stopAndCleanup();

    browser.webNavigation.onCommitted.removeListener(this.navigationCommitted);

    this.tabIds.forEach(() => this.updateWindowsRecordingStatus());

    this.unregisterAllDynamicContentScripts().then();
  }

  async unregisterAllDynamicContentScripts() {
    const { manifest_version } = browser.runtime.getManifest();

    if (manifest_version === 3) {
      await browser.scripting.unregisterContentScripts({ ids: Object.values(SCRIPT_IDS) });
    } else {
      this.registeredScripts.forEach(script => script.unregister());
    }
  }

  async injectForegroundScripts(tabId: number) {
    try {
      const { manifest_version } = browser.runtime.getManifest();

      if (manifest_version === 3) {
        await browser.scripting.executeScript({
          target: { tabId, allFrames: true },
          files: ['src/content/locator-overlay/index.js']
        });
      } else {
        await browser.tabs.executeScript(tabId, {
          file: 'src/content/locator-overlay/index.js',
          allFrames: true,
          runAt: 'document_start'
        });
      }

      this.recording = true;
      this.updateWindowsRecordingStatus();
      this.sendMessageToLoadster(RECORDING_TRACKING, { tabId, type: 'inject-content-script' } as RecordingTrackingData);
    } catch (err) {
      console.error(err);
    }
  }

  async injectSubFrameScript(tabId: number, frameId: number) {
    try {
      const { manifest_version } = browser.runtime.getManifest();

      if (manifest_version === 3) {
        await browser.scripting.executeScript({
          target: { tabId, frameIds: [frameId] },
          files: ['src/content/locator-overlay/index.js']
        });
      } else {
        await browser.tabs.executeScript(tabId, {
          file: 'src/content/locator-overlay/index.js',
          frameId,
          runAt: 'document_start'
        });
      }
    } catch (err) {
      console.error(err);
    }
  }

  uploadBrowserEvent(event: BrowserEvent) {
    this.sendMessageToLoadster(RECORDING_EVENTS, {
      browser: {
        [generateId(event.action)]: event
      }
    });
  }

  async navigationCommitted(details: browser.WebNavigation.OnCommittedDetailsType & { frameType?: string }) {
    const { tabId, frameId, frameType, transitionType, transitionQualifiers, ...data } = details;

    if (this.tabIds.has(tabId)) {
      if (isFirefox || frameType === 'outermost_frame') {
        this.sendMessageToLoadster(RECORDING_TRACKING, { tabId, frameId, frameType, transitionType, type: 'navigation' } as RecordingTrackingData);
        await this.injectForegroundScripts(tabId);
      } else if (frameType === 'sub_frame') {
        await this.injectSubFrameScript(tabId, frameId);
      }
      if (['typed'].includes(transitionType)) {
        this.uploadBrowserEvent({ action: 'navigate', data });
      } else if (['link'].includes(transitionType) && transitionQualifiers.includes('forward_back')) {
        this.uploadBrowserEvent({ action: 'navigate', data });
      }
    }
  }

  updateWindowsRecordingStatus() {
    this.sendMessageToPage(RECORDING_STATUS, {
      enabled: this.recording,
      options: this.recordingOptions
    });
  }
}
