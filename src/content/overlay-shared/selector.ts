/**
 * Cleans a raw Playwright-style selector for human-readable display.
 * Splits on `>>`, strips `internal:` prefixes and trailing `"i`, rejoins with ` >> `.
 */
export function stripInternalSelector(raw?: string): string {
  if (!raw) return '';
  return raw
    .split('>>')
    .map((seg) => seg.trim().replace(/^internal:/, '').replace(/"i$/, '"'))
    .join(' >> ');
}
