import { getInjectedScriptClass } from '../../generated/playwright-injected-ctor.js';

export interface SelectorGeneratorOptions {
  testIdAttributeName?: string;
  isUnderTest?: boolean;
  browserName?: string;
  stableRafCount?: number;
}

// Cached class constructor — loaded once per content-script context.
let InjectedScriptCtor: any = null;

export function createSelectorGenerator(
  win: Window & typeof globalThis,
  opts: SelectorGeneratorOptions = {},
) {
  if (!InjectedScriptCtor) {
    InjectedScriptCtor = getInjectedScriptClass();
  }
  const injected = new InjectedScriptCtor(win, {
    sdkLanguage: 'javascript',
    testIdAttributeName: opts.testIdAttributeName ?? 'data-testid',
    isUnderTest: opts.isUnderTest ?? false,
    browserName: opts.browserName ?? 'chromium',
    stableRafCount: opts.stableRafCount ?? 1,
    isUtilityWorld: false,
    customEngines: [],
  });
  return (el: Element, options: { testIdAttributeName: string }) =>
    injected.generateSelector(el, options);
}
