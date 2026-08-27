import { PREF_PREFIX, PROVIDER_IDS, type PrefsBackend } from '../core/settings';

/**
 * Adding a voice while Read Aloud is open in some tab. A reader's popup
 * lists its voices once, when it opens (ReadAloudManager.loadVoices runs
 * from _prepareReadAloud and from nowhere else), and Zotero has no path to
 * refresh an open popup's list — so a voice added now (a favorite marked
 * while only favorites are offered, a provider switched on) would not
 * reach a tab that is reading until Read Aloud is closed and opened there
 * again. Reloading the list live was researched and rejected
 * (notes/NOTES.md): Zotero's resolve recreates the controller even onto the
 * same voice, so every refresh restarts the sentence being read, and a
 * listing that fails mid-playback would move the tab to another voice. The
 * settings refuse instead, naming the tabs; the user closes them (or stops
 * Read Aloud there) and adds the voice again.
 */

export function readingTabsMessage(titles: readonly string[]): string {
  const one = titles.length === 1;
  const list = titles.map((title) => `  • ${title}`).join('\n');
  return (
    `Read Aloud is open in ${one ? 'a tab' : `${titles.length} tabs`}:\n${list}\n\n` +
    `A tab lists its voices when Read Aloud opens there, so a voice added now would not reach ${one ? 'it' : 'them'}. ` +
    `Close ${one ? 'that tab' : 'those tabs'} (or stop Read Aloud ${one ? 'in it' : 'in them'}), then add the voice again.`
  );
}

export interface ReadingGuardDeps {
  /** The titles of the tabs Read Aloud is open in right now (paused counts); empty when nothing is reading. */
  readingTabs(): string[];
  /** Shows the message to the user — a dialog. */
  warn(message: string): void;
}

const XHTML = 'http://www.w3.org/1999/xhtml';

/**
 * The message as a dialog of the pane's own document: an html:dialog shown
 * modal over the pane, painted in the pane's own light or dark colors. The
 * OS prompt (Services.prompt.alert, toolkit's commonDialog) draws a white
 * ring around its dark body on Windows in dark mode (Zotero 10.0.1-beta.3,
 * seen 2026-08-27), and nothing in the plugin can restyle another window's
 * document; the pane's follows Zotero's theme, so a dialog inside it does
 * too. `fallback` — the OS prompt — is used where showModal is unavailable
 * or refuses. Returns at once; the dialog closes on OK or Escape.
 */
export function showPaneNotice(
  doc: { createElementNS(ns: string, tag: string): any; documentElement?: any; body?: any; defaultView?: any },
  message: string,
  fallback: (message: string) => void,
): void {
  const root = doc.body ?? doc.documentElement;
  const dialog = doc.createElementNS(XHTML, 'dialog');
  if (!root || typeof dialog?.showModal !== 'function') {
    fallback(message);
    return;
  }
  let dark = false;
  try {
    dark = !!doc.defaultView?.matchMedia?.('(prefers-color-scheme: dark)')?.matches;
  } catch {
    // No matchMedia: the light colors
  }
  dialog.setAttribute(
    'style',
    `color-scheme: ${dark ? 'dark' : 'light'}; background: ${dark ? '#2b2b2b' : '#ffffff'}; color: ${dark ? '#f0f0f0' : '#000000'};` +
      ' border: 1px solid rgba(128, 128, 128, 0.5); border-radius: 6px; padding: 16px 20px; max-width: 44em; font: inherit;' +
      ' box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);',
  );
  const text = doc.createElementNS(XHTML, 'div');
  text.textContent = message;
  text.setAttribute('style', 'white-space: pre-wrap; line-height: 1.5; margin: 0 0 14px;');
  dialog.appendChild(text);
  const row = doc.createElementNS(XHTML, 'div');
  row.setAttribute('style', 'display: flex; justify-content: flex-end;');
  const ok = doc.createElementNS(XHTML, 'button');
  ok.textContent = 'OK';
  ok.setAttribute('style', 'min-width: 6em; padding: 4px 12px; font: inherit;');
  ok.addEventListener('click', () => dialog.close());
  row.appendChild(ok);
  dialog.appendChild(row);
  dialog.addEventListener('close', () => dialog.remove());
  root.appendChild(dialog);
  try {
    dialog.showModal();
    ok.focus?.();
  } catch {
    dialog.remove();
    fallback(message);
  }
}

/** Whether adding a voice must wait: Read Aloud is open somewhere, and the user has just been told where. */
export function refuseWhileReading(deps: ReadingGuardDeps): boolean {
  const titles = deps.readingTabs();
  if (!titles.length) return false;
  deps.warn(readingTabsMessage(titles));
  return true;
}

/**
 * The three "Enable … voices" checkboxes: switching a provider on adds its
 * voices, so the switch is refused while a tab is reading. Zotero's own
 * binding writes the pref on `command` too, and its order against this
 * listener is not relied on: both the checkbox and the pref are put back
 * to off, whichever ran first. Switching off is never refused.
 */
export function guardProviderSwitches(doc: { querySelector(selector: string): any }, deps: ReadingGuardDeps & { prefs: PrefsBackend }): void {
  for (const id of PROVIDER_IDS) {
    const pref = `${PREF_PREFIX}${id}.enabled`;
    const checkbox = doc.querySelector(`checkbox[preference="${pref}"]`);
    if (!checkbox) continue;
    checkbox.addEventListener('command', () => {
      if (!checkbox.checked) return;
      const titles = deps.readingTabs();
      if (!titles.length) return;
      checkbox.checked = false;
      deps.prefs.set(pref, false);
      deps.warn(readingTabsMessage(titles));
    });
  }
}
