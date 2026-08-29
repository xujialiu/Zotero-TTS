/**
 * The Read Aloud player's **Options** button — the sliders icon that
 * unfolds the panel with the speed slider, the tier, the language and the
 * voice.
 *
 * The panel's open/closed state is React state local to Zotero's
 * `ReadAloudPopup` (`useState(false)`, reader.js ~38512) and reaches
 * neither `_readAloudManager` nor any reader state, so there is no method
 * to call: the only handle is the button itself, in the reader iframe's
 * document. React's `onClick` is a delegated synthetic listener, so a real
 * `click()` on the element runs the same handler the mouse does — and the
 * mouse does not focus it either (the reader's `_handlePointerDown`
 * preventDefault()s a press on a button), so nothing here touches focus.
 */

/** The player's root. It exists exactly while the popup is on screen. */
export const PLAYER_POPUP_SELECTOR = '.read-aloud-popup';

/** The same root while the options panel is unfolded (reader.js ~38604) — what a toggle is verified by. */
export const EXPANDED_POPUP_SELECTOR = '.read-aloud-popup.expanded';

/**
 * The first button of the player's button row. The row holds three groups
 * — options, the skip/play cluster, annotate — and only position tells
 * them apart: every one of them is a `toolbar-button`, and their titles
 * are localized strings.
 */
export const OPTIONS_BUTTON_SELECTOR = '.read-aloud-popup .row.buttons .group:first-child > button.toolbar-button';

export interface ClickableLike {
  click(): void;
}

/** The part of the reader's Document this module reads; tests pass a fake. */
export interface PopupDocumentLike {
  querySelector(selector: string): unknown;
}

type MaybeDocument = PopupDocumentLike | null | undefined;

function match(doc: MaybeDocument, selector: string): unknown {
  try {
    return doc?.querySelector(selector) ?? null;
  } catch {
    // A reader whose document is already gone has no player
    return null;
  }
}

/** The Options button, or null when no player is on screen — the key then falls through to the reader. */
export function findOptionsButton(doc: MaybeDocument): ClickableLike | null {
  const el = match(doc, OPTIONS_BUTTON_SELECTOR) as ClickableLike | null;
  return el && typeof el.click === 'function' ? el : null;
}

/** Whether the options panel is unfolded right now. */
export function isOptionsPanelOpen(doc: MaybeDocument): boolean {
  return !!match(doc, EXPANDED_POPUP_SELECTOR);
}

/** Whether the player is on screen at all; a player without a button means the markup moved. */
export function hasPlayer(doc: MaybeDocument): boolean {
  return !!match(doc, PLAYER_POPUP_SELECTOR);
}
