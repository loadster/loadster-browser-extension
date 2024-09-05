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

    onMessage(OPTIONS, msg => Object.assign(this.recordingOptions, msg.data));
    onMessage(NAVIGATE_URL, async message => {
      this.recording = true;

      await this.createFirstTab(message.data.value);
    });

    onMessage(USER_ACTION, msg => this.uploadBrowserEvent(msg.data));

    browser.webNavigation.onCommitted.addListener(this.navigationCommitted.bind(this));
  }

  stopAndCleanup() {
    super.stopAndCleanup();
    console.log('stopAndCleanup B');

    browser.webNavigation.onCommitted.removeListener(this.navigationCommitted);

    this.tabIds.forEach(tabId => this.updateWindowsRecordingStatus(tabId));
    console.log('disconnected');
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

        await browser.scripting.executeScript({
          target: { tabId, allFrames: true },
          files: ['src/content/windowEventRecorder.js'],
          world: 'MAIN', // this is necessary for recording event listeners
          injectImmediately: true,
        });
      } else {
        await browser.tabs.executeScript(tabId, {
          file: 'src/contentTab.js',
          allFrames: true,
          runAt: 'document_start'
        });
        await browser.tabs.executeScript(tabId, {
          file: 'src/content/windowEventRecorder.js',
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
    console.log('uploadBrowserEvent', event, this.channel);

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
        console.log('navigationCommitted', { transitionType, frameId });

        await this.injectForegroundScripts(tabId);

        if (['link', 'typed', 'form_submit'].includes(transitionType)) {
          await this.uploadBrowserEvent({ action: 'navigate', data });
        }

      } else {
        console.log('navigationCommitted', { frameType, transitionType });
        if (frameType === 'outermost_frame') {
          // inject content scripts to all frames
          await this.injectForegroundScripts(tabId);
        }

        if (['link', 'typed'].includes(transitionType)) {
          await this.uploadBrowserEvent({ action: 'navigate', data });
        }
      }
    }
  }

  updateWindowsRecordingStatus(tabId) {
    console.log('RECORDING_STATUS to', tabId);
    sendMessage(RECORDING_STATUS, {
      enabled: this.recording,
      options: this.recordingOptions
    }, `content-script@${tabId}`);
  }
}
