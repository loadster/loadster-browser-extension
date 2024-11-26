export const RECORDING_STATUS = 'loadster.recording';
export const RECORDING_EVENTS = 'RecordingEvents';
export const RECORDING_STOP = 'RecordingStop';
export const NAVIGATE_URL = 'Url';
export const PING = 'Ping';
export const PONG = 'Pong';
export const USER_ACTION = 'loadster_browser_event';
export const OPTIONS = 'loadster_recording_options';
export const RECORDING_TRACKING = 'loadster_recording_tracking';

export const ENDPOINT_PAGE_CONNECT = 'loadster-browser-recorder-tab';
export const RECORDER_TYPE = {
  HTTP: 'loadster-http-recorder',
  BROWSER: 'loadster-browser-recorder'
};

export const bridgeEvents = {
  'CONNECT': 'loadster_connect_extension',
  'CONNECTED': 'loadster_connected_extension',
  'DISCONNECTED': 'loadster_disconnected_extension',
  'SEND': 'loadster_post_message',
  'STOP': 'loadster_stop_recording',
  'READY': 'loadster_recorder_ready'
};
