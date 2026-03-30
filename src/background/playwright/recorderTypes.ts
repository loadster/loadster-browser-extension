// Minimal type for ActionInContext as emitted by Recorder in playwright-core v1.58.0.
// Internal types are not exported from the npm package, so we declare what we need here.

export interface FrameDescription {
  pageGuid: string;
  pageAlias?: string;
  framePath?: string[];

  [key: string]: unknown;
}

export interface RecordedSignal {
  name: string;

  [key: string]: unknown;
}

export interface RecordedAction {
  name: string;
  signals: RecordedSignal[];
  selector?: string;

  [key: string]: unknown;
}

export interface ActionInContext {
  frame: FrameDescription;
  action: RecordedAction;
  startTime: number;
  endTime: number;
}

declare global {
  interface Window {
    // playwrightSetMode: (mode: Mode) => void;
    // playwrightSetPaused: (paused: boolean) => void;
    // playwrightSetOverlayVisible: (visible: boolean) => void;
    // playwrightSetRunningFile: (file: string | undefined) => void;

    // dispatch(data: any): Promise<void>;
  }
}
