/** The part of Document the marker needs; tests pass a fake. */
export interface PlatformDocument {
  querySelector(selector: string): { classList: { add(name: string): void } } | null;
}

/** The class the pane's sheet scopes its macOS-only rules by (issue #56). */
export const MAC_CLASS = 'ztts-mac';

/**
 * Put the platform on the pane's root as a class, for the rules the sheet
 * cannot scope by media query: `-moz-platform` is honored in chrome and UA
 * sheets only, and a plugin's pane sheet reaches the window under the xpi's
 * jar:file: URL, where a `@media (-moz-platform: macos)` block is parsed
 * as a condition nobody recognizes and never matches (issue #56, measured
 * 2026-09-06). macOS is the only platform the sheet tells apart today.
 */
export function markPlatform(doc: PlatformDocument, platform: { isMac: boolean }): void {
  if (platform.isMac) doc.querySelector('.ztts-pane')?.classList.add(MAC_CLASS);
}
