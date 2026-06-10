/**
 * RecorderController — CDP-based Playwright test recorder.
 *
 * Architecture:
 * - Attaches to the tab via chrome.debugger (CDP 1.3)
 * - Injects InjectedScript (Playwright's selector engine) for selector generation
 * - Injects a custom recording overlay (hover highlight + recording badge)
 * - Overlay sends actions via a dedicated direct CDP binding: __pw_overlay_action__
 * - Overlay pushes UI state (mode/pos/events) via __pw_overlay_persist__ binding;
 *   background merges it into this.overlayState and re-embeds it in the on-new-document
 *   script so state survives cross-origin navigation.
 * - Accumulates ActionInContext objects and regenerates Playwright test code on every action
 * - Emits 'codeChanged' with the generated playwright-test code
 */

import { EventEmitter } from 'events';
import type { ActionInContext } from './recorderTypes';
import { collapseActions, generateCode, JavaScriptLanguageGenerator, } from '../../generated/playwright-codegen.js';
import { injectedScriptSource } from '../../generated/playwright-recorder-source.js';
import overlaySource from '../../generated/overlayInjected.js?raw';
import { OVERLAY_STATE_BINDING, mergeOverlayState, type PersistedOverlayState } from '../../content/overlay-shared/persistence';

/** CDP binding name used by the overlay to send recorded actions to the background. */
const OVERLAY_BINDING = '__pw_overlay_action__';

/**
 * Builds the IIFE injected into the page:
 *   1. Guards against double-injection
 *   2. Embeds the persisted overlay state as window.__pw_overlay_state
 *   3. Instantiates InjectedScript (full Playwright selector engine)
 *   4. Mounts the custom recording overlay
 */
function buildInjectionScript(overlayState: PersistedOverlayState): string {
  return `(function () {
  if (window.__pw_recorder_loaded) return;
  window.__pw_recorder_loaded = true;

  // Persisted overlay UI state embedded by the background before each injection.
  // playwright-overlay/index.ts reads this synchronously in __pw_initOverlay.
  window.__pw_overlay_state = ${JSON.stringify(overlayState)};

  // ---- InjectedScript ----
  // Own IIFE + module={} to avoid var-name collisions; instantiated via factory.
  const injectedScript = (() => {
    const module = {};
    ${injectedScriptSource}
    return new (module.exports.InjectedScript())(globalThis, {
      sdkLanguage: 'javascript',
      testIdAttributeName: 'data-testid',
      isUnderTest: false,
      browserName: 'chromium',
      stableRafCount: 1,
      isUtilityWorld: false,
      customEngines: [],
    });
  })();

  // Expose injectedScript so child frames can generate selectors for their <iframe> elements
  window.__pw_injectedScript = injectedScript;

  // ---- Custom Recording Overlay ----
  ${overlaySource}
  __pw_initOverlay(injectedScript);
}());`;
}

export default class RecorderController extends EventEmitter {
  private readonly tabId: number;
  private readonly initialUrl: string | undefined;
  private actions: ActionInContext[];
  private overlayState: PersistedOverlayState;
  private readonly generator = new JavaScriptLanguageGenerator(/* isPlaywrightTest */ true);
  private readonly langOptions = { browserName: 'chromium' as const, contextOptions: {} };
  private bound = false;
  private scriptIdentifier: string | null = null;
  private reregisterTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    tabId: number,
    initialUrl?: string,
    initialActions: ActionInContext[] = [],
    initialOverlayState: PersistedOverlayState = {},
  ) {
    super();
    this.tabId = tabId;
    this.initialUrl = initialUrl;
    this.actions = [...initialActions];
    this.overlayState = { ...initialOverlayState };
  }

  getActions(): ActionInContext[] {
    return this.actions;
  }

  getOverlayState(): PersistedOverlayState {
    return this.overlayState;
  }

  async start(): Promise<void> {
    await chrome.debugger.attach({ tabId: this.tabId }, '1.3');

    // Runtime.enable is required so the inspector tracks execution contexts;
    // without it Runtime.addBinding has no contexts to bind into and
    // Runtime.bindingCalled events are never dispatched.
    await chrome.debugger.sendCommand({ tabId: this.tabId }, 'Runtime.enable');

    // Direct CDP binding: overlay calls window.__pw_overlay_action__(jsonPayload)
    await chrome.debugger.sendCommand({ tabId: this.tabId }, 'Runtime.addBinding', {
      name: OVERLAY_BINDING,
    });

    // Overlay state binding: overlay calls window.__pw_overlay_persist__(jsonPayload)
    // to push mode/pos/events back to the background so they survive navigation.
    await chrome.debugger.sendCommand({ tabId: this.tabId }, 'Runtime.addBinding', {
      name: OVERLAY_STATE_BINDING,
    });

    // Enable Page domain for navigation events
    await chrome.debugger.sendCommand({ tabId: this.tabId }, 'Page.enable');

    chrome.debugger.onEvent.addListener(this.onDebuggerEvent);
    chrome.debugger.onDetach.addListener(this.onDebuggerDetach);
    this.bound = true;

    // Persist across navigations (re-embeds overlayState on every new document)
    const addResult = await chrome.debugger.sendCommand(
      { tabId: this.tabId },
      'Page.addScriptToEvaluateOnNewDocument',
      { source: this.buildInjectionScript() },
    ) as { identifier?: string };
    if (addResult?.identifier) {
      this.scriptIdentifier = addResult.identifier;
    }

    // Also inject into the already-loaded page
    await this.injectNow();

    // If the page finished loading before we attached CDP, Page.frameNavigated won't fire
    // for the initial URL. Detect this by checking readyState and inject the navigate action.
    if (this.initialUrl) {
      const result = await chrome.debugger.sendCommand({ tabId: this.tabId }, 'Runtime.evaluate', {
        expression: 'document.readyState',
        returnByValue: true,
      }).catch(() => null) as { result?: { value?: string } } | null;

      const readyState = result?.result?.value;
      if (readyState === 'complete' || readyState === 'interactive') {
        this.addNavigateAction(this.initialUrl);
      }
    }
  }

  async stop(): Promise<void> {
    if (this.reregisterTimer) {
      clearTimeout(this.reregisterTimer);
      this.reregisterTimer = null;
    }

    if (this.bound) {
      chrome.debugger.onEvent.removeListener(this.onDebuggerEvent);
      chrome.debugger.onDetach.removeListener(this.onDebuggerDetach);
      this.bound = false;

      // Remove the overlay from all frames before detaching
      await chrome.debugger.sendCommand({ tabId: this.tabId }, 'Runtime.evaluate', {
        expression: 'if (typeof window.__pw_destroyOverlay === "function") window.__pw_destroyOverlay();',
        includeCommandLineAPI: false,
      }).catch(() => {});
    }
    await chrome.debugger.detach({ tabId: this.tabId }).catch(() => {});
  }

  get code(): string {
    return this.generateCodeText();
  }

  private buildInjectionScript(): string {
    return buildInjectionScript(this.overlayState);
  }

  private async injectNow(): Promise<void> {
    await chrome.debugger
      .sendCommand({ tabId: this.tabId }, 'Runtime.evaluate', {
        expression: this.buildInjectionScript(),
        includeCommandLineAPI: false,
      })
      .catch(() => {});
  }

  /**
   * Re-registers the on-new-document injection script with the current overlayState,
   * so any subsequent navigation (any origin) restores the latest UI state.
   * Debounced to avoid excessive CDP round-trips when state changes rapidly.
   */
  private scheduleReregisterScript(): void {
    if (this.reregisterTimer) clearTimeout(this.reregisterTimer);
    this.reregisterTimer = setTimeout(() => {
      this.reregisterTimer = null;
      this.reregisterOnNewDocumentScript().catch(() => {});
    }, 500);
  }

  private async reregisterOnNewDocumentScript(): Promise<void> {
    if (!this.bound) return;

    if (this.scriptIdentifier) {
      await chrome.debugger.sendCommand(
        { tabId: this.tabId },
        'Page.removeScriptToEvaluateOnNewDocument',
        { identifier: this.scriptIdentifier },
      ).catch(() => {});
      this.scriptIdentifier = null;
    }

    const result = await chrome.debugger.sendCommand(
      { tabId: this.tabId },
      'Page.addScriptToEvaluateOnNewDocument',
      { source: this.buildInjectionScript() },
    ).catch(() => null) as { identifier?: string } | null;

    if (result?.identifier) {
      this.scriptIdentifier = result.identifier;
    }
  }

  private onDebuggerDetach = (
    debuggee: chrome.debugger.Debuggee,
    reason: string,
  ) => {
    if (debuggee.tabId !== this.tabId || !this.bound) return;

    // Debugger was detached externally (user cancelled, DevTools conflict, etc.)
    chrome.debugger.onEvent.removeListener(this.onDebuggerEvent);
    chrome.debugger.onDetach.removeListener(this.onDebuggerDetach);
    this.bound = false;
    this.emit('detached', reason);
  };

  private onDebuggerEvent = (
    debuggee: chrome.debugger.Debuggee,
    method: string,
    params?: Record<string, unknown>,
  ) => {
    if (debuggee.tabId !== this.tabId) return;

    if (method === 'Runtime.bindingCalled') {
      if (params?.name === OVERLAY_BINDING) {
        try {
          const action = JSON.parse(params.payload as string) as Record<string, unknown>;
          if (action) this.handleRecordedAction(action);
        } catch {
          // ignore malformed payloads
        }
      } else if (params?.name === OVERLAY_STATE_BINDING) {
        try {
          const partial = JSON.parse(params.payload as string) as Partial<PersistedOverlayState>;
          this.overlayState = mergeOverlayState(this.overlayState, partial);
          // Re-register the on-new-document script so the next navigation gets fresh state.
          this.scheduleReregisterScript();
        } catch {
          // ignore malformed payloads
        }
      }
    } else if (method === 'Page.frameNavigated') {
      const frame = params?.frame as Record<string, unknown> | undefined;
      if (!frame?.parentId) {
        this.addNavigateAction(frame?.url as string ?? '');
      }
    }
  };

  private handleRecordedAction(action: Record<string, unknown>): void {
    const framePath = Array.isArray(action.framePath) ? (action.framePath as string[]) : [];
    const { framePath: _fp, ...actionData } = action;

    const actionInContext: ActionInContext = {
      frame: {
        pageGuid: `page-${this.tabId}`,
        pageAlias: 'page',
        framePath,
      },
      action: {
        name: actionData.name as string,
        signals: [],
        ...(actionData as object),
      },
      startTime: Date.now(),
      endTime: Date.now(),
    };

    this.actions.push(actionInContext);
    this.emitCode();
  }

  private addNavigateAction(url: string): void {
    const actionInContext: ActionInContext = {
      frame: {
        pageGuid: `page-${this.tabId}`,
        pageAlias: 'page',
        framePath: [],
      },
      action: {
        name: 'navigate',
        url,
        signals: [],
      },
      startTime: Date.now(),
      endTime: Date.now(),
    };

    console.log('add navigation', url);

    this.actions.push(actionInContext);
    this.emitCode();
  }

  private generateCodeText(): string {
    try {
      const collapsed = collapseActions(this.actions);
      const { text } = generateCode(collapsed, this.generator, this.langOptions);
      return text;
    } catch (e) {
      console.error('RecorderController: code generation failed', e);
      return '';
    }
  }

  private emitCode(): void {
    const text = this.generateCodeText();
    if (text) this.emit('codeChanged', text);
  }
}
