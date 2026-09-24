/**
 * The Player's **Options** button: in the Floating panel it shows or hides
 * the provider, language and voice rows, and exposes that state through
 * `aria-expanded`. The Top and Bottom bars have none.
 *
 * Zotero's own player is never shown (issue #134, ADR 0007), but it stays
 * in the document while a reading is open, Options button and all. It is
 * never a match here: with the Player closed, the key falls through to
 * the reader.
 */

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

function pluginFrame(doc: MaybeDocument) {
  const frame = match(doc, '#ztts-player-frame') as {
    hidden: boolean; contentDocument: PopupDocumentLike | null; getAttribute(name: string): string | null;
  } | null;
  return frame && !frame.hidden ? frame : null;
}

/** The Floating panel's Options button, or null when none is on screen — the key then falls through to the reader. */
export function findOptionsButton(doc: MaybeDocument): ClickableLike | null {
  const frame = pluginFrame(doc);
  const el = (frame?.getAttribute('data-layout') === 'B' ? match(frame.contentDocument, '.options-toggle') : null) as ClickableLike | null;
  return el && typeof el.click === 'function' ? el : null;
}

/** Whether the Floating panel's rows are unfolded right now. */
export function isOptionsPanelOpen(doc: MaybeDocument): boolean {
  const button = findOptionsButton(doc) as (ClickableLike & { getAttribute?(name: string): string | null }) | null;
  return button?.getAttribute?.('aria-expanded') === 'true';
}

/** Whether the Player is on screen at all. */
export function hasPlayer(doc: MaybeDocument): boolean {
  return !!pluginFrame(doc);
}
