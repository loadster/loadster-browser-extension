import browser from 'webextension-polyfill';
import { onMessage, sendMessage } from 'webext-bridge/background';
import Recorder from './Recorder.js';
import { NAVIGATE_URL, OPTIONS, RECORDING_STATUS, RECORDING_EVENTS, USER_ACTION } from '../constants.js';
import { generateId } from './utils.js';

// eslint-disable-next-line no-undef
const isFirefox = __BROWSER__ === 'firefox';

export default class BrowserRecorder extends Recorder {
  constructor(port, channel) {
    super(port, channel);

    this.recordingOptions = {};
    this.registeredScripts = [];

    this.registerPageContentScripts().then(() => {
      onMessage(OPTIONS, msg => Object.assign(this.recordingOptions, msg.data));
      onMessage(NAVIGATE_URL, async message => {
        this.recording = true;

        await this.createFirstTab(message.data.value);
      });

      onMessage(USER_ACTION, msg => this.uploadBrowserEvent(msg.data));

      browser.webNavigation.onCommitted.addListener(this.navigationCommitted.bind(this));
    });
  }

  async registerPageContentScripts () {
    const { manifest_version } = browser.runtime.getManifest();

    if (manifest_version === 3) {
       await browser.scripting.registerContentScripts([{
          matches: ['*://*/*'],
          excludeMatches: ['*://localhost/*', 'https://loadster.app/*', 'https://speedway.app/*'],
          js: ['src/content/windowEventRecorder.js'],
          id: 'loadster-page-content-scripts',
          allFrames: true,
          runAt: 'document_start',
          world: 'MAIN',
        }]);
    } else {
      const script = await browser.contentScripts.register({
        matches: ['*://*/*'],
        excludeMatches: ['*://localhost/*', 'https://loadster.app/*', 'https://speedway.app/*'],
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

    browser.webNavigation.onCommitted.removeListener(this.navigationCommitted);

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

      console.log('injectForegroundScripts', { tabId });

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
      this.updateWindowsRecordingStatus(tabId);
    } catch (err) {
      console.error(err);
    }
  }

  async uploadBrowserEvent(event) {
    await sendMessage(RECORDING_EVENTS, {
      http: {},
      browser: {
        [generateId(event.action)]: event
      }
    }, this.channel);
  }

  async navigationCommitted(details) {
    const { tabId, frameId, frameType, transitionType, ...data } = details;

    if (this.tabIds.includes(tabId)) {
      if (isFirefox) {
        await this.injectForegroundScripts(tabId);

        if (['link', 'typed', 'form_submit'].includes(transitionType)) {
          await this.uploadBrowserEvent({ action: 'navigate', data });
        }

      } else {
        if (frameType === 'outermost_frame') {
          await this.injectForegroundScripts(tabId); // inject content scripts to all frames
        }

        if (['link', 'typed'].includes(transitionType)) {
          await this.uploadBrowserEvent({ action: 'navigate', data });
        }
      }
    }
  }

  updateWindowsRecordingStatus(tabId) {
    sendMessage(RECORDING_STATUS, {
      enabled: this.recording,
      options: this.recordingOptions
    }, `content-script@${tabId}`);
  }
}
