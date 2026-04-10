export enum BridgeEvent {
  CONNECT = 'loadster_connect_extension',
  CONNECTED = 'loadster_connected_extension',
  DISCONNECTED = 'loadster_disconnected_extension',
  SEND = 'loadster_post_message',
  STOP = 'loadster_stop_recording',
  READY = 'loadster_recorder_ready',
  PING = 'Ping',
  PONG = 'Pong',
}

export enum RecorderMessageType {
  RECORDING_STATUS = 'loadster_recording_status',
  RECORDING_EVENTS = 'RecordingEvents',
  RECORDING_STOP = 'RecordingStop',
  NAVIGATE_URL = 'Url',
  USER_ACTION = 'loadster_user_action',
  OPTIONS = 'loadster_recording_options',
  RECORDING_TRACKING = 'loadster_recording_tracking',
  ENDPOINT_PAGE_CONNECT = 'loadster-browser-recorder-tab'
}

export enum RecorderType {
  HTTP = 'loadster-http-recorder',
  BROWSER = 'loadster-browser-recorder',
  PLAYWRIGHT = 'loadster-playwright-recorder',
}

export interface RecordingOptions {
  startUrl?: string;
  incognito?: boolean;
  newWindow?: boolean;
}

export interface BrowserRecordingOptions extends RecordingOptions {
  recordHoverEvents?: boolean;
  recordClickEvents?: boolean;
}

export interface PlaywrightRecordingOptions extends RecordingOptions {}

export type LoadsterRecordingOptions = RecordingOptions;

export type LoadsterRecorderStatus = {
  enabled: boolean;
  options: RecordingOptions;
}

export type LoadsterPortMessage = {
  type: string,
  data: {
    detail?: any,
    value?: any,
  }
}
