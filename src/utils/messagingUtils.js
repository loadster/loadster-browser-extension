
export function parseRecorderConfig(json) {
  try {
    return JSON.parse(json);
  } catch (err) {
    return null;
  }
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
