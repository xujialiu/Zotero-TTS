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

/** The alert's two palettes: Windows 11's dialog colors, which is what the OS prompt looks like there. */
const NOTICE_COLORS = {
  light: { background: '#f3f3f3', text: '#1a1a1a', border: '#c8c8c8', rule: 'rgba(0, 0, 0, 0.12)' },
  dark: { background: '#202020', text: '#f0f0f0', border: '#4a4a4a', rule: 'rgba(255, 255, 255, 0.12)' },
} as const;

/**
 * The message as an alert of the pane's own document: an html:dialog shown
 * modal over the pane and drawn like an alert window — a title strip, the
 * warning sign, the first line in bold, OK bottom right, a dimmed backdrop
 * — in the pane's own light or dark colors. The OS prompt
 * (Services.prompt.alert, toolkit's commonDialog) draws a white ring
 * around its dark body on Windows in dark mode (Zotero 10.0.1-beta.3, seen
 * 2026-08-27), and nothing in the plugin can restyle another window's
 * document; the pane's follows Zotero's theme, so a dialog inside it does
 * too. `fallback` — the OS prompt — is used where showModal is unavailable
 * or refuses. Returns at once; the dialog closes on OK or Escape.
 */
export function showPaneNotice(
  doc: { createElementNS(ns: string, tag: string): any; documentElement?: any; body?: any; defaultView?: any },
  message: string,
  fallback: (message: string) => void,
  title = 'Zotero TTS',
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
  const colors = dark ? NOTICE_COLORS.dark : NOTICE_COLORS.light;
  const el = (tag: string, style: string, text?: string) => {
    const node = doc.createElementNS(XHTML, tag);
    node.setAttribute('style', style);
    if (text !== undefined) node.textContent = text;
    return node;
  };

  dialog.setAttribute('id', 'ztts-notice');
  dialog.setAttribute(
    'style',
    `color-scheme: ${dark ? 'dark' : 'light'}; background: ${colors.background}; color: ${colors.text}; border: 1px solid ${colors.border};` +
      ' border-radius: 8px; padding: 0; min-width: 28em; max-width: 46em; font: inherit; box-shadow: 0 12px 40px rgba(0, 0, 0, 0.55);',
  );
  // The backdrop cannot be set inline; a style element inside the dialog
  // applies to the document and goes away with the dialog
  const style = doc.createElementNS(XHTML, 'style');
  style.textContent = '#ztts-notice::backdrop { background: rgba(0, 0, 0, 0.45); }';
  dialog.appendChild(style);

  dialog.appendChild(el('div', `padding: 8px 14px; font-weight: 600; border-bottom: 1px solid ${colors.rule};`, title));

  const body = el('div', 'display: flex; align-items: flex-start; gap: 14px; padding: 16px 18px 8px;');
  // The warning sign in its emoji presentation: the yellow triangle of the OS alert
  body.appendChild(el('div', 'flex: none; font-size: 28px; line-height: 1;', '⚠️'));
  const text = el('div', 'flex: 1; min-width: 0; line-height: 1.5;');
  const [lead, ...rest] = message.split('\n');
  text.appendChild(el('div', 'font-weight: 600; margin-bottom: 4px;', lead));
  if (rest.length) text.appendChild(el('div', 'white-space: pre-wrap;', rest.join('\n')));
  body.appendChild(text);
  dialog.appendChild(body);

  const buttons = el('div', 'display: flex; justify-content: flex-end; padding: 10px 14px 14px;');
  const ok = el('button', 'min-width: 6.5em; padding: 5px 14px; font: inherit;', 'OK');
  ok.addEventListener('click', () => dialog.close());
  buttons.appendChild(ok);
  dialog.appendChild(buttons);

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
