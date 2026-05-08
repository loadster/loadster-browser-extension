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
  selectorFilters: {
    key: string;
    value: string;
  }[];
}

export interface HttpRecordingOptions extends RecordingOptions {
}

export interface PlaywrightRecordingOptions extends RecordingOptions {
}

export type LoadsterRecorderStatus = {
  enabled: boolean;
  options: RecordingOptions;
  permissions: Record<string, boolean>;
}

export type LoadsterPortMessage = {
  type: string,
  data: {
    detail?: any,
    value?: any,
  }
}

export interface BrowserEvent {
  action: string;
  data: {
    timestamp?: number;

    url?: string;
    transitionType?: string;
    tagName?: string;
    selectors?: Record<string, string | string[]>;
    value?: string;
    attrs?: Record<string, string>;
    [key: string]: unknown;
  };
  tabId?: number;
}

export interface BrowserRecordingEventsData {
  browser: Record<string, BrowserEvent>;
}

export interface PlaywrightRecordingEventsData {
  playwright: { code: string };
}

export interface HttpRecorderEvent {
  requestId: string;
  url: string;
  method: string;
  type: string;
  tabId: number;
  statusCode?: number;
  timeStamp?: number;
  timeStarted?: number;
  timeCompleted?: number;
  completed?: boolean;

  [key: string]: unknown;
}

export interface HttpRecordingEventsData {
  http: Record<string, HttpRecorderEvent>;
}

export type RecordingEventsDataMap = {
  [RecorderType.BROWSER]: BrowserRecordingEventsData;
  [RecorderType.PLAYWRIGHT]: PlaywrightRecordingEventsData;
  [RecorderType.HTTP]: HttpRecordingEventsData;
};

export type RecordingEventsData = BrowserRecordingEventsData | PlaywrightRecordingEventsData | HttpRecordingEventsData;

export interface ExtensionPermissions {
  incognito: boolean;

  [key: string]: boolean;
}

export interface PongData {
  enabled: boolean;
  permissions: ExtensionPermissions;
}

export interface BridgeMessage<T = unknown> {
  type: string;
  app: RecorderType;
  version: string;
  data: T;
}

export type PongMessage = BridgeMessage<PongData> & { type: BridgeEvent.PONG };
export type RecordingEventsMessage = BridgeMessage<RecordingEventsData> & { type: RecorderMessageType.RECORDING_EVENTS };
export type RecordingStopMessage = BridgeMessage & { type: RecorderMessageType.RECORDING_STOP };
export type RecordingTrackingMessage = BridgeMessage<RecordingTrackingData> & { type: RecorderMessageType.RECORDING_TRACKING };

export interface RecordingTrackingData {
  tabId: number;
  type: 'navigation' | 'inject-content-script';
  frameId?: number;
  frameType?: string;
  transitionType?: string;
}
