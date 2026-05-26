declare global {
  interface Window {
    __loadster_generateLocator?: (el: Element) => string | null;
    loadsterLocatorRecorderLoaded?: boolean;
  }
}

export {};
