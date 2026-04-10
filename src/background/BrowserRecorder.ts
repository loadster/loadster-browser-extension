import browser from 'webextension-polyfill';
import Recorder from './Recorder';
import { generateId } from './utils.js';
import { type LoadsterPortMessage, RecorderMessageType, RecordingTrackingData } from '../../index';
import { parseRecorderConfig } from '../utils/messagingUtils';

const { ENDPOINT_PAGE_CONNECT, NAVIGATE_URL, RECORDING_STATUS, RECORDING_EVENTS, USER_ACTION, RECORDING_TRACKING } = RecorderMessageType;

// eslint-disable-next-line no-undef
const isFirefox = __BROWSER__ === 'firefox';

export default class BrowserRecorder extends Recorder {
  pageContentScriptId = 'loadster-page-content-scripts';

  static async cleanupStaleScripts() {
    if (browser.runtime.getManifest().manifest_version === 3) {
      try {
        await browser.scripting.unregisterContentScripts({ ids: ['loadster-page-content-scripts'] });
      } catch (e) {
        // Script wasn't registered, that's fine
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
    this.registerPageContentScripts().then(() => {
    });

    browser.runtime.onConnect.addListener(async (port) => {
      const config = parseRecorderConfig(port.name);

      if (config.endpointName === ENDPOINT_PAGE_CONNECT) {
        this.setupPageContentPort(port);
      }
    });
  }

  onCreatedTab(tab) {
    if (this.tabIds.has(tab.openerTabId) && tab.openerTabId !== tab.id) {
      this.stopBlinkingTitle();
      this.tabIds.clear();
      this.tabIds.add(tab.id);
    }
  }

  setupPageContentPort(pagePort) {
    this.pagePort = pagePort;

    pagePort.onMessage.addListener(msg => {
      if (msg.type === USER_ACTION) {
        this.uploadBrowserEvent(msg.data);
      }
    });

    // Ensure the page script receives recording status after the port is ready.
    this.updateWindowsRecordingStatus();
  }

  sendMessageToLoadster(type, data) {
    try {
      this.port.postMessage({ type, data });
    } catch (err) {
      console.warn(err);
    }
  }

  sendMessageToPage(type, data) {
    try {
      this.pagePort?.postMessage({ type, data });
    } catch (err) {
      // Attempting to use a disconnected port object
      console.warn(err);
    }
  }

  async registerPageContentScripts() {
    const { manifest_version } = browser.runtime.getManifest();

    if (manifest_version === 3) {
      // Unregister first to avoid "Duplicate script ID" error
      try {
        await browser.scripting.unregisterContentScripts({
          ids: [this.pageContentScriptId]
        });
      } catch (e) {
        // Script wasn't registered, that's fine
      }

      await browser.scripting.registerContentScripts([{
        matches: ['*://*/*'],
        excludeMatches: ['*://localhost/*', 'https://loadster.com/*', 'https://loadster.app/*'],
        js: ['src/content/windowEventRecorder.js'],
        id: this.pageContentScriptId,
        allFrames: true,
        runAt: 'document_start',
        world: 'MAIN'
      }]);
    } else {
      const script = await browser.contentScripts.register({
        matches: ['*://*/*'],
        excludeMatches: ['*://localhost/*', 'https://loadster.com/*', 'https://loadster.app/*'],
        js: [{
          file: 'src/content/windowEventRecorder.js'
        }],
        allFrames: true,
        runAt: 'document_start',
        world: 'MAIN'
      });

      // @ts-ignore
      this.registeredScripts.push(script);
    }
  }

  stopAndCleanup() {
    super.stopAndCleanup();

    browser.webNavigation.onCommitted.removeListener(this.navigationCommitted);

    this.tabIds.forEach(tabId => this.updateWindowsRecordingStatus());

    this.unregisterAllDynamicContentScripts().then();
  }

  async unregisterAllDynamicContentScripts() {
    const { manifest_version } = browser.runtime.getManifest();

    console.log('unregisterAllDynamicContentScripts', this.registeredScripts);

    if (manifest_version === 3) {
      await browser.scripting.unregisterContentScripts({ ids: [this.pageContentScriptId] });
    } else {
      this.registeredScripts.forEach(script => script.unregister());
    }
  }

  async injectForegroundScripts(tabId) {
    try {
      const { manifest_version } = browser.runtime.getManifest();

      // console.log('injectForegroundScripts', { tabId });

      if (manifest_version === 3) {
        await browser.scripting.executeScript({
          target: { tabId, allFrames: true },
          files: ['src/content/contentTab.js']
        });
      } else {
        await browser.tabs.executeScript(tabId, {
          file: 'src/content/contentTab.js',
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

  uploadBrowserEvent(event) {
    this.sendMessageToLoadster(RECORDING_EVENTS, {
      http: {},
      browser: {
        [generateId(event.action)]: event
      }
    });
  }

  async navigationCommitted(details) {
    const { tabId, frameId, frameType, transitionType, transitionQualifiers, ...data } = details;

    if (this.tabIds.has(tabId)) {
      if (isFirefox || frameType === 'outermost_frame') {
        this.sendMessageToLoadster(RECORDING_TRACKING, { tabId, frameId, frameType, transitionType, type: 'navigation' } as RecordingTrackingData);
        await this.injectForegroundScripts(tabId);
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
