export function overrideEventListeners() {
  // Store the original addEventListener method
  const originalAddEventListener = Element.prototype.addEventListener;
  const originalRemoveEventListener = Element.prototype.removeEventListener;

  // Override addEventListener
  Element.prototype.addEventListener = function (type, listener, options) {
    // console.log('Event listener added:', {
    //   element: this,
    //   type: type,
    //   listener: listener,
    //   options: options
    // });

    // Call the original addEventListener method
    originalAddEventListener.call(this, type, listener, options);

    if (!this._loadsterCapturedEventListeners) this._loadsterCapturedEventListeners = {};
    if (!this._loadsterCapturedEventListeners[type]) this._loadsterCapturedEventListeners[type] = [];

    // Add listener to event tracking list
    this._loadsterCapturedEventListeners[type].push({ type, listener, options });
  };

  Element.prototype.removeEventListener = function (type, listener, options) {
    originalRemoveEventListener(type, listener, options);

    if (!this._loadsterCapturedEventListeners) this._loadsterCapturedEventListeners = {};
    if (!this._loadsterCapturedEventListeners[type]) this._loadsterCapturedEventListeners[type] = [];

    for (let i = 0; i < this._loadsterCapturedEventListeners[type].length; i++) {
      if (this._loadsterCapturedEventListeners[type][i].listener === listener) {
        this._loadsterCapturedEventListeners[type].splice(i, 1);
        break;
      }
    }
  };

  Element.prototype.getLoadsterCapturedEventListeners = function (type) {
    if (!this._loadsterCapturedEventListeners) this._loadsterCapturedEventListeners = {};

    // return requested listeners type or all them
    if (type === undefined) {
      return this._loadsterCapturedEventListeners;
    } else {
      return this._loadsterCapturedEventListeners[type];
    }
  };
}

export function createMessage(msg) {
  // Firefox's security issue
  // eslint-disable-next-line no-undef
  if (__BROWSER__ === 'firefox' && typeof cloneInto === 'function') {
    // eslint-disable-next-line no-undef
    return cloneInto(msg, window, { 'cloneFunctions': true });
  } else {
    return msg;
  }
}


// Get all CSSStyleRule[] from document that use :hover
function getAllHoverRules() {
  const hoverRules = [];

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

// Get CSStyleRule in given collection
function getElementCSSHoverRule(hoverRules, targetElement) {
  for (const rule of hoverRules) {
    // Remove the :hover part of the selector to match the element itself
    const baseSelector = rule.selectorText.replace(':hover', '').trim();

    if (targetElement.matches(baseSelector)) {
      return rule;
    }
  }
}

export function setupCSSHoverEventListener(immediate = true) {
  const hoverRules = [];

  if (immediate) {
    hoverRules.push(...getAllHoverRules());
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      hoverRules.push(...getAllHoverRules());
    });
  }

  function elementHasCSSHoverRule(targetElement) {
    const rule = getElementCSSHoverRule(hoverRules, targetElement);

    // rule && (targetElement.style.border = '1px solid red'); // Debug

    return !!rule;
  }

  return {
    elementHasCSSHoverRule
  };
}
