interface LoadsterCapturedListener {
  type: string;
  listener: EventListenerOrEventListenerObject;
  options?: boolean | AddEventListenerOptions;
}

declare global {
  interface Element {
    _loadsterCapturedEventListeners?: Record<string, LoadsterCapturedListener[]>;
    getLoadsterCapturedEventListeners(type: string): LoadsterCapturedListener[];
    getLoadsterCapturedEventListeners(type?: undefined): Record<string, LoadsterCapturedListener[]>;
  }
}

export function overrideEventListeners(): void {
  // Store the original addEventListener method
  const originalAddEventListener = Element.prototype.addEventListener;
  const originalRemoveEventListener = Element.prototype.removeEventListener;

  // Override addEventListener
  Element.prototype.addEventListener = function (type, listener, options) {
    // Call the original addEventListener method
    originalAddEventListener.call(this, type, listener, options);

    if (!this._loadsterCapturedEventListeners) this._loadsterCapturedEventListeners = {};
    if (!this._loadsterCapturedEventListeners[type]) this._loadsterCapturedEventListeners[type] = [];

    // Add listener to event tracking list
    this._loadsterCapturedEventListeners[type].push({ type, listener, options });
  };

  Element.prototype.removeEventListener = function (type, listener, options) {
    originalRemoveEventListener.call(this, type, listener, options);

    if (!this._loadsterCapturedEventListeners) this._loadsterCapturedEventListeners = {};
    if (!this._loadsterCapturedEventListeners[type]) this._loadsterCapturedEventListeners[type] = [];

    for (let i = 0; i < this._loadsterCapturedEventListeners[type].length; i++) {
      if (this._loadsterCapturedEventListeners[type][i].listener === listener) {
        this._loadsterCapturedEventListeners[type].splice(i, 1);
        break;
      }
    }
  };

  Element.prototype.getLoadsterCapturedEventListeners = function (type?: string) {
    if (!this._loadsterCapturedEventListeners) this._loadsterCapturedEventListeners = {};

    // return requested listeners type or all them
    if (type === undefined) {
      return this._loadsterCapturedEventListeners;
    } else {
      return this._loadsterCapturedEventListeners[type];
    }
  };
}

// Remove the :hover part of the selector to match the element itself
function getBaseSelector(rule: CSSStyleRule): string {
  return rule.selectorText.replace(':hover', '').trim();
}

// Get all CSSStyleRule[] from document that use :hover
function getAllHoverRules(): CSSStyleRule[] {
  const hoverRules: CSSStyleRule[] = [];

  for (const stylesheet of document.styleSheets) {
    try {
      for (const rule of stylesheet.cssRules) {
        if (rule instanceof CSSStyleRule) {
          if (rule.selectorText.includes(':hover')) {
            hoverRules.push(rule);
          }
        }
      }
    } catch (e) {
      // console.warn('Could not access some stylesheets due to cross-origin policy.');
    }
  }

  return hoverRules;
}

// Get CSSStyleRule in given collection
function getElementCSSHoverRule(hoverRules: CSSStyleRule[], targetElement: Element): CSSStyleRule | undefined {
  for (const rule of hoverRules) {
    const baseSelector = getBaseSelector(rule);

    if (targetElement.matches(baseSelector)) {
      return rule;
    }
  }
}

export function setupCSSHoverEventListener(immediate = true): {
  getElementWithCSSHoverRule: (targetElement: Element) => Element | null | undefined;
  elementHasCSSHoverRule: (targetElement: Element) => boolean;
} {
  const hoverRules: CSSStyleRule[] = [];
  const PERF_WARN_THRESHOLD_MS = 100;

  function collectHoverRules(): CSSStyleRule[] {
    const start = performance.now();
    const rules = getAllHoverRules();
    const duration = performance.now() - start;
    if (duration > PERF_WARN_THRESHOLD_MS) {
      console.warn(`[Loadster] Slow operation: getAllHoverRules took ${duration.toFixed(1)}ms (found ${rules.length} rules)`);
    }
    return rules;
  }

  if (immediate) {
    hoverRules.push(...collectHoverRules());
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      hoverRules.push(...collectHoverRules());
    });
  }

  function getElementWithCSSHoverRule(targetElement: Element): Element | null | undefined {
    return hoverRules.map(hoverRule => {
      const baseSelector = getBaseSelector(hoverRule);

      return targetElement.closest(baseSelector);
    }).find(el => !!el);
  }

  function elementHasCSSHoverRule(targetElement: Element): boolean {
    const rule = getElementCSSHoverRule(hoverRules, targetElement);

    return !!rule;
  }

  return {
    getElementWithCSSHoverRule,
    elementHasCSSHoverRule
  };
}