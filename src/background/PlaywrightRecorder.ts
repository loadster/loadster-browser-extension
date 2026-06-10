import browser from 'webextension-polyfill';
import { RecorderMessageType, type LoadsterPortMessage, RecordingTrackingData } from '../../index';
import Recorder from './Recorder';
import RecorderController from './playwright/RecorderController';
import type { ActionInContext } from './playwright/recorderTypes';
import type { PersistedOverlayState } from '../content/overlay-shared/persistence';

const { NAVIGATE_URL, RECORDING_TRACKING, RECORDING_EVENTS, RECORDING_STOP } = RecorderMessageType;

export default class PlaywrightRecorder extends Recorder {
  private _activeRecorder: RecorderController | null = null;
  private boundNavigationCommitted = this.navigationCommitted.bind(this);

  constructor(port: browser.Runtime.Port) {
    super(port);

    port.onMessage.addListener(async (message: LoadsterPortMessage) => {
      if (message.type === NAVIGATE_URL) {
        this.recording = true;
        const url = message.data.value;
        const tab = await this.createFirstTab(url);
        await this.attachTab(tab);
      }
    });

    browser.webNavigation.onCommitted.addListener(this.boundNavigationCommitted);
  }

  stopAndCleanup() {
    const tabIds = [...this.tabIds];

    super.stopAndCleanup();
    browser.webNavigation.onCommitted.removeListener(this.boundNavigationCommitted);

    if (this._activeRecorder) {
      this._activeRecorder.stop().catch(() => {});
      this._activeRecorder = null;
    }

    // Fallback: destroy overlay via chrome.scripting when CDP is unavailable (e.g. external debugger detach)
    for (const tabId of tabIds) {
      chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: () => {
          if (typeof window.__pw_destroyOverlay === 'function') window.__pw_destroyOverlay();
        },
      }).catch(() => {});
    }
  }

  onCreatedTab(tab: browser.Tabs.Tab) {
    if (this.tabIds.has(tab.openerTabId) && tab.openerTabId !== tab.id) {
      this.switchToTab(tab);
    }
  }

  private async switchToTab(tab: browser.Tabs.Tab) {
    const oldRecorder = this._activeRecorder;
    const inheritedActions = oldRecorder ? oldRecorder.getActions() : [];
    const inheritedOverlayState = oldRecorder ? oldRecorder.getOverlayState() : {};
    this._activeRecorder = null;

    this.stopBlinkingTitle();

    for (const tabId of this.tabIds) {
      chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: () => {
          if (typeof window.__pw_destroyOverlay === 'function') window.__pw_destroyOverlay();
        },
      }).catch(() => {});
    }

    this.tabIds.clear();
    this.tabIds.add(tab.id);

    if (oldRecorder) {
      oldRecorder.stop().catch(() => {});
    }

    await this.attachTab(tab, inheritedActions, inheritedOverlayState);
  }

  async attachTab(tab: browser.Tabs.Tab, initialActions: ActionInContext[] = [], initialOverlayState: PersistedOverlayState = {}) {
    const activeRecorder = new RecorderController(tab.id!, tab.url || tab.pendingUrl, initialActions, initialOverlayState);

    activeRecorder.on('codeChanged', (code: string) => {
      this.port.postMessage({
        type: RECORDING_EVENTS,
        data: { playwright: { code } }
      });
    });

    activeRecorder.on('detached', () => {
      console.log('detached');
      this.stopAndCleanup();
      this.port.postMessage({ type: RECORDING_STOP });
      this.port.disconnect();
    });

    await activeRecorder.start();

    this._activeRecorder = activeRecorder;
  }

  async navigationCommitted(
    details: browser.WebNavigation.OnCommittedDetailsType &
      { frameType: 'outermost_frame' | 'fenced_frame' | 'sub_frame' }
  ) {
    const { tabId, frameId, frameType, transitionType } = details;

    if (this.tabIds.has(tabId) && frameType === 'outermost_frame') {
      this.port.postMessage({
        type: RECORDING_TRACKING,
        data: { tabId, frameId, frameType, transitionType, type: 'navigation' } as RecordingTrackingData
      });
    }
  }
}
