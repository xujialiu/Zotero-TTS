/**
 * Closing the Read Aloud player in every tab at once — the reading guard's
 * *Stop reading and continue* (ui/reading-guard.ts, issue #71), and the
 * key that stops every player (the second step of that issue).
 *
 * A player is open when its popup is on screen or a session is open
 * behind it: `_state.readAloudState.popupOpen`, and
 * `_readAloudManager.active`, which paused keeps true. The two differ for
 * a moment — the popup is up before the voice resolves and Zotero
 * activates the manager (reader.js:83860-83866) — and for good on the
 * first-run popup with no voice ever chosen. Either way the popup has
 * built its voice list from the settings as they were (`loadVoices`, from
 * `_prepareReadAloud` and nowhere else), which is what the guard is
 * about, so open is the union of the two.
 *
 * The close is the headphone button's own, `toggleReadAloudPopup(false)`
 * (reader.js:84183-84209): `deactivate()` — audio and highlight stop, the
 * controller goes — then `_resetReadAloudSegmentState()` and `popupOpen:
 * false`, all in the same tick (measured 2026-09-06, issue #65; the popup
 * element leaves the DOM on React's next render). Zotero keeps the reading
 * position and the plugin's own store restores it on the next open
 * (verified 2026-09-05). What the plugin cannot do is start the reading
 * again with sound: a session a script starts stays mute for its whole
 * life (the autoplay gate, notes/NOTES_2026-09-06.md). The argument is a
 * primitive — all that may cross into the reader's compartment (CLAUDE.md).
 */

/** The corner of a reader this module reads: the two flags, and the button's own close. */
export interface PlayerStopReader {
  _internalReader?: {
    _state?: { readAloudState?: { popupOpen?: boolean } | null } | null;
    _readAloudManager?: { active?: boolean } | null;
    toggleReadAloudPopup?(open: boolean): void;
  } | null;
}

/** Whether a player is on screen in this reader — the popup up, or a session open behind it; false on a reader that throws (a dead tab). */
export function isPlayerOpen(reader: PlayerStopReader | null | undefined): boolean {
  try {
    const internal = reader?._internalReader;
    if (!internal) return false;
    return !!internal._state?.readAloudState?.popupOpen || !!internal._readAloudManager?.active;
  } catch {
    return false;
  }
}

export interface PlayerStopDeps<R extends PlayerStopReader> {
  /** Every reader in every window: `Zotero.Reader._readers`. */
  readers(): readonly R[];
  log?(e: unknown): void;
}

export interface PlayerStop<R> {
  /** The readers with a player open right now, in reader order. */
  open(): R[];
  /**
   * Closes every one of them the button's way and returns the ones it
   * closed. One that throws (a reader gone dead mid-close) is logged and
   * left out, and costs the rest nothing: the guard re-reads what is left.
   */
  stopAll(): R[];
}

export function createPlayerStop<R extends PlayerStopReader>(deps: PlayerStopDeps<R>): PlayerStop<R> {
  function open(): R[] {
    return deps.readers().filter((reader) => isPlayerOpen(reader));
  }

  function stopAll(): R[] {
    const stopped: R[] = [];
    for (const reader of open()) {
      try {
        const internal = reader._internalReader;
        if (typeof internal?.toggleReadAloudPopup !== 'function') continue;
        internal.toggleReadAloudPopup(false);
        stopped.push(reader);
      } catch (e) {
        deps.log?.(e);
      }
    }
    return stopped;
  }

  return { open, stopAll };
}
