/**
 * The plugin's strings, by id (issue #30).
 *
 * Every sentence a user reads lives in `addon/locale/<locale>/zotero-tts.ftl`
 * — en-US the source of truth, the other files pinned to its ids by
 * test/l10n.test.ts — and Zotero registers those files itself at startup
 * (xpcom/plugins.js registerLocales). The settings pane's markup is
 * translated by Zotero, through the `data-l10n-id`s and the `<linkset>` in
 * preferences.xhtml; what TypeScript writes — a status line, a dialog, a
 * toast — goes through `t()`.
 *
 * `t` formats through whatever source was installed: in Zotero a sync
 * `Localization` over the plugin's file, built in the plugin sandbox (which
 * is handed the constructor, plugins.js) so nothing here waits on a window
 * or a promise; in the tests a rendering of the en-US file by Fluent's
 * reference implementation (test/setup.ts). Without a source, or for an id
 * the file lacks, `t` returns the id — visible in the pane, never a throw
 * in the middle of a dialog.
 */
export type L10nArgs = Record<string, string | number>;

/** The part of Fluent's `Localization` that `t` uses. */
export interface MessageSource {
  formatValueSync(id: string, args?: L10nArgs): string | null | undefined;
}

/** The plugin's one Fluent file, as Zotero registers it: `[plugin root]/locale/<locale>/zotero-tts.ftl`. */
export const FTL_FILE = 'zotero-tts.ftl';

let source: MessageSource | null = null;

/** Installs the source `t` formats through; null uninstalls it (shutdown). */
export function setMessageSource(next: MessageSource | null): void {
  source = next;
}

/** Whether a source is installed — what diagnostics.l10n() reports. */
export function hasMessageSource(): boolean {
  return source !== null;
}

/** The message's text in the app's language, with `args` filled in; the id itself when there is no such message. */
export function t(id: string, args?: L10nArgs): string {
  if (!source) return id;
  try {
    const value = source.formatValueSync(id, args);
    return typeof value === 'string' && value !== '' ? value : id;
  } catch {
    return id;
  }
}

/**
 * Sentences put side by side on one line — a connection result, a restore's
 * report — through the `ztts-join` message, which is what knows whether the
 * language puts a space between them (English) or nothing (Chinese). Empty
 * parts are left out; a single part comes back as it is (issue #43).
 */
export function sentences(...parts: Array<string | null | undefined>): string {
  const kept = parts.filter((part): part is string => typeof part === 'string' && part !== '');
  if (!kept.length) return '';
  return kept.reduce((first, second) => t('ztts-join', { first, second }));
}

/** The part of a settings pane element that paneElementBlank reads. */
export interface PaneElement {
  readonly textContent: string | null;
  getAttribute(name: string): string | null;
}

/**
 * The attributes the pane's messages set, besides `value` — `aria-label`
 * the name of a field that shows no text of its own, which the diagnostic
 * reported blank until issue #103. test/l10n.test.ts runs every message
 * through paneElementBlank, so a message carrying only a kind this list
 * lacks fails there, not in a live pass.
 */
const STRING_ATTRIBUTES = ['label', 'placeholder', 'tooltiptext', 'help', 'aria-label'];

/**
 * Whether Fluent left a settings pane element without its string — what
 * diagnostics.l10n() lists as `blank` (issue #30): no text, none of the
 * attributes above, and no `value` but the `?` a help icon's markup
 * carries by itself.
 */
export function paneElementBlank(el: PaneElement): boolean {
  if ((el.textContent ?? '').trim()) return false;
  const value = el.getAttribute('value') ?? '';
  if (value && value !== '?') return false;
  return !STRING_ATTRIBUTES.some((name) => el.getAttribute(name));
}
