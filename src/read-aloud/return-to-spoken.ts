/**
 * The Go to reading position key on Zotero's two kinds of view (issue #76).
 *
 * The key locks the view to the spoken position (`_lockPositionToReadAloud`,
 * reader.js:84174 — the popup's own skip buttons' call) and re-emits the
 * manager's state so the locked view has a push to act on. Zotero's PDF view
 * navigates on any push while locked (`setReadAloudState`, reader.js:76459).
 * Its DOM views — EPUB, web snapshot and Reading Mode, all on `DOMView`'s
 * `ReadAloud` helper (reader.js:53191, created at 53542) — navigate only
 * when the push's segment differs from the one the helper remembers
 * (`segmentChanged`, 53236, gating 53240), and a re-emitted snapshot carries
 * the same segment object (`_composeReadAloudStateSnapshot`, 83913), so that
 * gate never opened: playing, the view returned at the next sentence;
 * paused, never.
 *
 * Forgetting what the helper remembers makes the next push the session's
 * first: `setState` re-locks (`!previousState?.active`, 53213) and navigates
 * through its own code, with its own scroll flag and scroll debounce. The
 * push stores the new state in the same call (53209), so the null lives for
 * the microtask between the key and the queued onStateChange (`_stateChanged`,
 * 82731); the helper's other readers — `setPositionLocked` (53276), the jump
 * button (54994), the scroll handler (55154) — run from events and cannot see
 * it.
 *
 * The view is `_internalReader._lastView`, the one the lock call locks. The
 * write goes through the waiver the wiring hands in: the plugin's assignments
 * on reader objects have landed on an Xray wrapper before (index.ts
 * `waived()`), and waiving is a no-op on a transparent chain.
 */

/** Which of Zotero's view classes a reader's current view is, by the Read Aloud fields it carries. */
export type ReadAloudViewKind = 'dom' | 'pdf' | 'none';

/** The DOM views' ReadAloud helper, as far as this module touches it: the last state it was handed. */
export interface ReadAloudHelperLike {
  state?: unknown;
}

/** The corner of a view this module reads: the DOM views' helper, the PDF view's lock flag. */
export interface ReadAloudViewLike {
  _readAloud?: ReadAloudHelperLike | null;
  _readAloudPositionLocked?: boolean;
}

/** A reader as the key sees it: its internal reader's current view. */
export interface ReturnToSpokenReader {
  _internalReader?: { _lastView?: ReadAloudViewLike | null } | null;
}

/**
 * `dom` for a view carrying the ReadAloud helper (EPUB, snapshot, Reading
 * Mode), `pdf` for one carrying the PDF view's lock flag, `none` for no view,
 * a view of neither kind, or one that throws (a dead tab).
 */
export function readAloudViewKind(view: ReadAloudViewLike | null | undefined): ReadAloudViewKind {
  try {
    if (!view) return 'none';
    if (view._readAloud && typeof view._readAloud === 'object') return 'dom';
    if (typeof view._readAloudPositionLocked === 'boolean') return 'pdf';
    return 'none';
  } catch {
    return 'none';
  }
}

/**
 * Make a DOM view take the next state push as the session's first, so a
 * locked view navigates to the spoken segment on it. Returns the kind of
 * view found; only `dom` is touched. Reading a dead reader answers `none`;
 * a write that throws is left to the caller, since a swallowed one would be
 * the silent no-op this exists to avoid.
 */
export function forgetViewReadAloudState(
  reader: ReturnToSpokenReader | null | undefined,
  waive: (helper: ReadAloudHelperLike) => ReadAloudHelperLike = (helper) => helper,
): ReadAloudViewKind {
  let view: ReadAloudViewLike | null | undefined;
  try {
    view = reader?._internalReader?._lastView;
  } catch {
    return 'none';
  }
  const kind = readAloudViewKind(view);
  if (kind !== 'dom') return kind;
  const helper = view?._readAloud;
  if (helper) waive(helper).state = null;
  return kind;
}
