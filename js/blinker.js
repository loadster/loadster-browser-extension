(function () {
  if (!window.loadster_recording_blinker) {
    const iconA = String.fromCodePoint(0x25CF);
    const iconB = String.fromCodePoint(0x25CB);

    window.loadsterOriginalTitle = window.document.title;

    const BLINK_TITLE = 'loadster_blink_title';

    browser.runtime.onMessage.addListener((msg) => {
      if (msg.type === BLINK_TITLE) {
        if (msg.value !== null) {
          window.document.title = `${++msg.value % 2 ? iconA : iconB} ${window.loadsterOriginalTitle}`;
        } else {
          window.document.title = window.loadsterOriginalTitle;
        }
      }
    });

    window.loadster_recording_blinker = true;
  }

  return true;
}());
