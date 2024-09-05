export function overrideEventListeners() {
  // Store the original addEventListener method
  const originalAddEventListener = Element.prototype.addEventListener;
  const originalRemoveEventListener = Element.prototype.removeEventListener;

  console.log('event listeners override');

  // Override addEventListener
  Element.prototype.addEventListener = function (type, listener, options) {
    // Log or process the event listener being added
    // console.log('capturing events');
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
