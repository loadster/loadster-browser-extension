import browser from 'webextension-polyfill';
import Recorder from './Recorder.js';
import { NAVIGATE_URL, RECORDING_STATUS, RECORDING_EVENTS, USER_ACTION, RECORDING_TRACKING } from '../constants.js';
import { generateId } from './utils.js';

// eslint-disable-next-line no-undef
const isFirefox = __BROWSER__ === 'firefox';

export default class BrowserRecorder extends Recorder {
  constructor(contentScriptPort) {
    super(contentScriptPort);

    this.registeredScripts = [];
    this.pagePort = null;

    contentScriptPort.onMessage.addListener(async (message) => {
      if (message.type === NAVIGATE_URL) {
        this.recording = true;

        await this.createFirstTab(message.data.value);
        await this.uploadBrowserEvent({
          action: 'navigate',
          tabId: this.tabIds[0],
          data: {
            url: message.data.value
          }
        });
      }
    });

    this.boundNavigationCommitted = this.navigationCommitted.bind(this);
    browser.webNavigation.onCommitted.addListener(this.boundNavigationCommitted);
    this.registerPageContentScripts().then(() => {});
  }

  setupPageContentPort (pagePort) {
    this.pagePort = pagePort;

    pagePort.onMessage.addListener(msg => {
      if (msg.type === USER_ACTION) {
        this.uploadBrowserEvent(msg.data);
      }
    });
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

  async registerPageContentScripts () {
    const { manifest_version } = browser.runtime.getManifest();

    if (manifest_version === 3) {
      // Unregister first to avoid "Duplicate script ID" error
      try {
        await browser.scripting.unregisterContentScripts({
          ids: ['loadster-page-content-scripts']
        });
      } catch (e) {
        // Script wasn't registered, that's fine
      }

      await browser.scripting.registerContentScripts([{
        matches: ['*://*/*'],
        excludeMatches: ['*://localhost/*', 'https://loadster.com/*', 'https://loadster.app/*'],
        js: ['src/content/windowEventRecorder.js'],
        id: 'loadster-page-content-scripts',
        allFrames: true,
        runAt: 'document_start',
        world: 'MAIN',
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
        world: 'MAIN',
      });

      this.registeredScripts.push(script);
    }
  }

  stopAndCleanup() {
    super.stopAndCleanup();

    browser.webNavigation.onCommitted.removeListener(this.boundNavigationCommitted);

    this.tabIds.forEach(tabId => this.updateWindowsRecordingStatus(tabId));

    this.unregisterAllDynamicContentScripts().then();
  }

  async unregisterAllDynamicContentScripts() {
    const { manifest_version } = browser.runtime.getManifest();

    console.log('unregisterAllDynamicContentScripts', this.registeredScripts);

    if (manifest_version === 3) {
      await browser.scripting.unregisterContentScripts({ ids: ['loadster-page-content-scripts'] });
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
          files: ['src/contentTab.js'],
        });
      } else {
        await browser.tabs.executeScript(tabId, {
          file: 'src/contentTab.js',
          allFrames: true,
          runAt: 'document_start'
        });
      }

      this.recording = true;
      this.updateWindowsRecordingStatus();
      this.sendMessageToLoadster(RECORDING_TRACKING, { tabId, type: 'inject-content-script' });
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

    if (this.tabIds.includes(tabId)) {
      if (isFirefox || frameType === 'outermost_frame') {
        this.sendMessageToLoadster(RECORDING_TRACKING, { tabId, frameId, frameType, transitionType, type: 'navigation' });
        await this.injectForegroundScripts(tabId);
      }
      if (['typed'].includes(transitionType)) {
        await this.uploadBrowserEvent({ action: 'navigate', data });
      } else if (['link'].includes(transitionType) && transitionQualifiers.includes('forward_back')) {
        await this.uploadBrowserEvent({ action: 'navigate', data });
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
