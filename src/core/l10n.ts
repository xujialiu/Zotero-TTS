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
