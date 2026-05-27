import { asLocator } from '../../generated/playwright-codegen.js';

export interface ElementLocatorSpec {
  method: string;
  [key: string]: unknown;
}

export function adaptSelector(rawSelector: string): ElementLocatorSpec[] {
  try {
    const jsonStr = asLocator('jsonl', rawSelector);
    return flattenLocatorChain(jsonStr);
  } catch {
    return [{ method: 'locator', selector: rawSelector }];
  }
}

function flattenLocatorChain(jsonStr: string): ElementLocatorSpec[] {
  let node: any;
  try {
    node = JSON.parse(jsonStr);
  } catch {
    return [{ method: 'locator', selector: jsonStr }];
  }

  const result: ElementLocatorSpec[] = [];
  while (node) {
    result.push(nodeToSpec(node));
    node = node.next ?? null;
  }
  return result;
}

function nodeToSpec({ kind, body, options = {} }: { kind: string; body: string; options?: Record<string, unknown> }): ElementLocatorSpec {
  switch (kind) {
    case 'role':          return { method: 'getByRole', role: body, options };
    case 'text':          return { method: 'getByText', text: body, options };
    case 'label':         return { method: 'getByLabel', label: body, options };
    case 'placeholder':   return { method: 'getByPlaceholder', text: body, options };
    case 'alt':           return { method: 'getByAltText', text: body, options };
    case 'title':         return { method: 'getByTitle', title: body, options };
    case 'test-id':       return { method: 'getByTestId', testId: body };
    case 'nth':           return { method: 'nth', index: parseInt(body) };
    case 'first':         return { method: 'first' };
    case 'last':          return { method: 'last' };
    case 'has-text':      return { method: 'filter', options: { hasText: body, ...options } };
    case 'has-not-text':  return { method: 'filter', options: { hasNotText: body, ...options } };
    case 'has':           return { method: 'filter', options: { has: body } };
    case 'hasNot':        return { method: 'filter', options: { hasNot: body } };
    case 'frame-locator': return { method: 'frameLocator', selector: body };
    default:              return { method: 'locator', selector: body };
  }
}

export function includeElementAttributes(element: Element): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (let i = 0, x = element.attributes, n = x.length; i < n; i++) {
    attrs[x[i].name] = x[i].value;
  }
  return attrs;
}
