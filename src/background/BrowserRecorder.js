import browser from 'webextension-polyfill';
import { onMessage, sendMessage } from 'webext-bridge/background';
import Recorder from './Recorder.js';
import { NAVIGATE_URL, OPTIONS, RECORDING_STATUS, RECORDING_EVENTS, USER_ACTION } from '../constants.js';
import { generateId } from './utils.js';

export default class BrowserRecorder extends Recorder {
  constructor(port, channel) {
    super(port, channel);

    this.recordingOptions = {};

    onMessage(OPTIONS, msg => Object.assign(this.recordingOptions, msg.data));
    onMessage(NAVIGATE_URL, async message => {
      this.recording = true;

      const tab = await this.createFirstTab(message.data.value);

      this.updateWindowsRecordingStatus(tab.id);

      await this.uploadBrowserEvent({ action: 'navigate', data: { url: message.data.value } });
    });

    onMessage(USER_ACTION, msg => this.uploadBrowserEvent(msg.data));

    browser.webNavigation.onCommitted.addListener(this.navigationCommitted.bind(this));
  }

  stopAndCleanup() {
    super.stopAndCleanup();
    console.log('stopAndCleanup B');

    browser.webNavigation.onCommitted.removeListener(this.navigationCommitted);

    this.updateWindowsRecordingStatus(this.port.sender.tab.id);
    console.log('disconnected');
  }

  async injectForegroundScripts(tabId, frameId) {
    try {
      const { manifest_version } = browser.runtime.getManifest();

      console.log('injectForegroundScripts', { tabId, frameId });

      if (manifest_version === 3) {
        await browser.scripting.executeScript({
          target: { tabId, frameIds: [frameId] },
          files: ['src/contentTab.js'],
        });

        await browser.scripting.executeScript({
          target: { tabId },
          files: ['src/content/windowEventRecorder.js'],
          world: 'MAIN',
          injectImmediately: true,
        });
      } else {
        await browser.tabs.executeScript(tabId, {
          file: 'src/contentTab.js',
          frameId: frameId,
          runAt: 'document_start'
        })
        await browser.tabs.executeScript(tabId, {
          file: 'src/content/windowEventRecorder.js',
          frameId: frameId,
          runAt: 'document_start'
        })
      }
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
      console.log('navigationCommitted', { frameType, transitionType });

      // TODO inject once
      await this.injectForegroundScripts(tabId, frameId);

      if (frameType === 'outermost_frame' && transitionType === 'typed') {
        await this.uploadBrowserEvent({ action: 'navigate', data });
      }
    }
  }

  updateWindowsRecordingStatus(tabId) {
    sendMessage(RECORDING_STATUS, {
      enabled: this.recording,
      options: this.recordingOptions
    }, `window@${tabId}`);
  }
}
