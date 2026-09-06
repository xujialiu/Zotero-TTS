/** The part of Document the marker needs; tests pass a fake. */
export interface PlatformDocument {
  querySelector(selector: string): { classList: { add(name: string): void } } | null;
  querySelectorAll?(selector: string): ArrayLike<{ getAttribute(name: string): string | null; hidden: boolean }>;
}

/** The class the pane's sheet scopes its macOS-only rules by (issue #56). */
export const MAC_CLASS = 'ztts-mac';

/** The attribute an element carries to be shown on one platform only: `win`, `mac` or `other` (the System voices note, issue #23). */
export const PLATFORM_ATTR = 'data-ztts-platform';

export type PanePlatform = 'win' | 'mac' | 'other';

export function panePlatform(platform: { isMac: boolean; isWin?: boolean }): PanePlatform {
  return platform.isMac ? 'mac' : platform.isWin ? 'win' : 'other';
}

/**
 * Put the platform on the pane's root as a class, for the rules the sheet
 * cannot scope by media query: `-moz-platform` is honored in chrome and UA
 * sheets only, and a plugin's pane sheet reaches the window under the xpi's
 * jar:file: URL, where a `@media (-moz-platform: macos)` block is parsed
 * as a condition nobody recognizes and never matches (issue #56, measured
 * 2026-09-06). macOS is the only platform the sheet tells apart today.
 *
 * And show, of the elements written for one platform each, the one for
 * this platform: three static Fluent messages and a `hidden` flag, since
 * Zotero translates the pane once at load and a `data-l10n-id` swapped
 * afterwards is not re-translated.
 */
export function markPlatform(doc: PlatformDocument, platform: { isMac: boolean; isWin?: boolean }): void {
  if (platform.isMac) doc.querySelector('.ztts-pane')?.classList.add(MAC_CLASS);
  const current = panePlatform(platform);
  const marked = doc.querySelectorAll?.(`[${PLATFORM_ATTR}]`) ?? [];
  for (let i = 0; i < marked.length; i++) marked[i].hidden = marked[i].getAttribute(PLATFORM_ATTR) !== current;
}
