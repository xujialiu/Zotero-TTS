import type { PrefsBackend } from '../core/settings';
import { lookupPosition, normalizePosition, putPosition, readPositions, samePosition, writePositions, type PositionEntry } from './read-aloud-position';

/**
 * Fills read-aloud-position.ts in from the open readers.
 *
 * The position is *read*, never patched in:
 * `reader._internalReader._state.readAloudState.savedPosition` is the value
 * Zotero maintains for itself, updated on every active-segment change
 * (reader bundle ~83604). Objects reached from our side are safe to *read*
 * across the compartment boundary (NOTES.md), so this needs neither
 * `exportFunction` nor Xray waiving — unlike wrapping
 * `_onReadAloudEngineStateChanged`, which is the class of instance-method
 * patch that has silently broken the Read Aloud button before. A bookmark
 * up to one tick stale is not worth that risk.
 *
 * Safe to read is not safe to *keep*: what comes back belongs to the
 * reader's window and dies with its tab, so every value is copied into our
 * own compartment on the way in (plainCopy).
 *
 * The tick's interval changes with activity (ACTIVE_TICK_MS vs IDLE_TICK_MS),
 * so it is a recursive `setTimeout` rather than a fixed `setInterval` — which
 * the sandbox does provide, contrary to what this comment used to claim
 * (`plugins.js` assigns setInterval/clearInterval/requestIdleCallback;
 * verified again 2026-08-30 by reading the live sandbox global). Writes go
 * through a throttle: continuous listening moves the position every few
 * seconds and every pref write hits prefs.js.
 *
 * Recording is already sentence-triggered — an entry is only touched when
 * the sentence actually changes — so the tick is just how fast that change
 * is noticed. While a session is open it runs twice a second, well under
 * the length of any sentence; the rest of the time nothing can move and
 * the cheap interval is enough. The tick alone still loses the last
 * ≤500 ms at close (resuming then lands one sentence early), so the moment
 * of closing is covered separately: `captureClose` reads the closing
 * reader one final time, called from a wrap of the tab's `onClose`
 * (index.ts; runs synchronously inside `Zotero_Tabs.close` on every close
 * path, before the deferred DOM removal) with a `reader.uninit` wrap as
 * backstop for separate windows and the late close notification. An
 * iframe 'unload' hook was tried first and never fired: removing the
 * iframe's node does not dispatch unload. The capture also
 * works on a session already deactivated by closing the popup, since
 * deactivate freezes but does not clear `savedPosition`
 * (`_resetReadAloudSegmentState` only resets segmentAnnotations) — and it
 * then *freezes* the attachment: a closed reader can linger in `_readers`
 * while Zotero's teardown regresses its `savedPosition`, and copying that
 * would corrupt the store (the 2026-08-26 incident). Ticks therefore read
 * open sessions only. Details: notes/NOTES.md (2026-08-26).
 */

/**
 * Twice a second while a session is open — paused included, since the arrow
 * keys move the position without playing: shorter than any sentence, so
 * none is missed.
 */
export const ACTIVE_TICK_MS = 500;
/** Nothing is moving — a few property reads to notice when that changes. */
export const IDLE_TICK_MS = 3000;
export const WRITE_THROTTLE_MS = 10000;

export interface Attachment {
  lib: number;
  key: string;
}

export interface PositionSyncDeps {
  prefs: PrefsBackend;
  /** `Zotero.Reader._readers`. */
  readers(): unknown[];
  /** The reader's attachment (`Zotero.Items.get(reader.itemID)`), or null when it has none. */
  attachmentOf(reader: unknown): Attachment | null;
  /** `reader._internalReader._readAloudManager`. `active` means the session is open; paused leaves it true. */
  managerOf(reader: unknown): { active?: boolean; paused?: boolean } | null;
  /** `reader._internalReader._state.readAloudState.savedPosition`. */
  savedPositionOf(reader: unknown): unknown;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  now(): number;
  error(e: unknown): void;
}

export interface PositionSync {
  start(): void;
  /** Clears the tick and writes anything still pending. */
  stop(): void;
  /** One pass over the open readers. */
  sample(): void;
  /**
   * One last read of a closing reader, written out at once — called from
   * the `reader.uninit` wrap, while the state is still whole. Reads even a
   * deactivated session (the popup was closed earlier; savedPosition is
   * frozen), then freezes the attachment so nothing the lingering reader
   * does during teardown can be copied over the captured value. Whatever
   * was pending is flushed even if the final read fails.
   */
  captureClose(reader: unknown): void;
  /** Write now, ignoring the throttle. */
  flush(): void;
  /** The stored position for a reader's attachment, or null. */
  lookup(reader: unknown): unknown | null;
}

export function createPositionSync(deps: PositionSyncDeps): PositionSync {
  let entries: PositionEntry[] = readPositions(deps.prefs);
  let dirty = false;
  // Entries written before normalization existed can carry the full rect
  // list (#14: one was 106,938 chars). writePositions rewrites the whole
  // array on every flush, so a fat entry left as it is would go out at full
  // size each time until 50 newer documents push it off the end; normalized
  // here and marked dirty, it is shed on the first flush instead, whether
  // or not its document ever plays again.
  {
    const healed = entries.map((e) => ({ ...e, pos: normalizePosition(e.pos) }));
    if (JSON.stringify(healed) !== JSON.stringify(entries)) dirty = true;
    entries = healed;
  }
  let lastWrite = 0;
  let tick: unknown = null;
  let running = false;
  let anyActive = false;
  // Attachments seen with an open session this plugin session: only these
  // are still read after deactivate, so a freshly opened document cannot
  // import Zotero's own restored savedPosition into the store.
  const wasActive = new Set<string>();
  // The last position seen per attachment, already serialized: an unchanged
  // sentence then costs one stringify and no parse.
  const lastSeen = new Map<string, string>();
  // The attachments seen open on the previous pass, as `lib/key` strings —
  // never reader references, which would be the very thing that dies.
  let tracked = new Set<string>();

  // One broken reader must not stop the pass: a reader torn down mid-tick
  // throws on any property read.
  function guard<T>(fn: () => T, fallback: T): T {
    try {
      return fn();
    } catch (e) {
      try {
        deps.error(e);
      } catch {
        // Reporting must never be the thing that throws
      }
      return fallback;
    }
  }

  const clock = (): number => guard(() => deps.now(), 0);

  /** What one pass learned about a reader: the attachment it holds open, and whether its session is open. */
  type Seen = Attachment & { active: boolean };

  /**
   * Nothing read from the reader is ever *kept*. What Zotero hands back
   * lives in the reader's compartment: holding that reference means holding
   * a pointer into a window that dies with its tab, and every later touch
   * then throws `TypeError: can't access dead object` — which is what
   * silently broke resuming (2026-08-26: the pref on disk was correct, the
   * copy in memory was a corpse, and cloneInto threw on it). So the position
   * is serialized on the way in; it has to survive as plain data anyway,
   * since it goes into a pref.
   */
  function record(reader: unknown, force = false): Seen | null {
    const attachment = guard(() => deps.attachmentOf(reader), null);
    if (!attachment) return null;
    const manager = guard(() => deps.managerOf(reader), null);
    const active = !!manager?.active;
    const seen: Seen = { ...attachment, active };
    const id = attachment.lib + '/' + attachment.key;
    if (active) wasActive.add(id);
    // Ticks read open sessions only. The one forced read at close also
    // takes a session deactivated earlier (savedPosition frozen by
    // deactivate) — but never a document that has not played this plugin
    // session, whose savedPosition is Zotero's own restored copy, not
    // something the user just listened to.
    else if (!force || !wasActive.has(id)) return seen;
    const raw = guard(() => deps.savedPositionOf(reader), null);
    if (raw === null || raw === undefined) return seen;
    // Serialize once: it is both the change test and the copy.
    const text = guard(() => JSON.stringify(raw), null);
    if (text === null || text === undefined) return seen;
    if (lastSeen.get(id) === text) return seen;
    lastSeen.set(id, text);
    const pos = guard(() => JSON.parse(text) as unknown, null);
    if (pos === null) return seen;
    // Normalized before the comparison, so the store's point and the
    // reader's raw rect list for the same sentence read as equal — compared
    // raw, every restart would re-write every open document once
    const norm = normalizePosition(pos);
    if (samePosition(lookupPosition(entries, attachment.lib, attachment.key), norm)) return seen;
    entries = putPosition(entries, attachment.lib, attachment.key, norm, clock());
    dirty = true;
    return seen;
  }

  function flush(): void {
    if (!dirty) return;
    // Retry cadence, not tick cadence: lastWrite advances even when the
    // write throws, so a store that cannot persist says so once per
    // throttle window, not twice a second on the active tick
    lastWrite = clock();
    try {
      writePositions(deps.prefs, entries);
      dirty = false;
    } catch (e) {
      // Zotero.Prefs.set logs and rethrows (xpcom/prefs.js); dirty stays
      // set so the next window tries again — clearing it here was #14's
      // silent-freeze bug: every bookmark after a failed write was lost
      // with nothing ever retried
      try {
        deps.error(e);
      } catch {
        // Reporting must never be the thing that throws
      }
    }
  }

  function sample(): void {
    const open = new Set<string>();
    let sawActive = false;
    for (const reader of guard(() => deps.readers(), [] as unknown[])) {
      const seen = record(reader);
      if (!seen) continue;
      open.add(seen.lib + '/' + seen.key);
      if (seen.active) sawActive = true;
    }
    anyActive = sawActive;
    // A reader that was open and is not any more: its tab was closed, so put
    // what we have on disk now rather than waiting out the throttle. The
    // final value itself comes from captureClose on the iframe's unload;
    // this is only the backstop for a close whose unload never reached us.
    let closed = false;
    for (const key of tracked) if (!open.has(key)) closed = true;
    tracked = open;
    if (closed || (dirty && clock() - lastWrite >= WRITE_THROTTLE_MS)) flush();
  }

  function captureClose(reader: unknown): void {
    // record() is guarded throughout: a reader half torn down at close
    // costs the final read, never the flush of what is already in hand
    const seen = record(reader, true);
    // Freeze: the closed reader can linger in Zotero.Reader._readers while
    // teardown regresses its savedPosition — from here on, nothing short of
    // playing again may touch this attachment's entry
    if (seen) wasActive.delete(seen.lib + '/' + seen.key);
    flush();
  }

  function arm(delay: number): void {
    tick = guard(
      () =>
        deps.setTimeout(() => {
          tick = null;
          if (!running) return;
          try {
            sample();
          } catch (e) {
            // Every dep call is guarded already; this is the backstop that
            // keeps one unexpected throw from ending the heartbeat silently
            try {
              deps.error(e);
            } catch {
              // Reporting must never be the thing that stops the tick
            }
          } finally {
            if (running) arm(anyActive ? ACTIVE_TICK_MS : IDLE_TICK_MS);
          }
        }, delay),
      null,
    );
  }

  function start(): void {
    if (running) return;
    running = true;
    lastWrite = clock();
    // Nothing observed yet, so start on the cheap interval
    arm(IDLE_TICK_MS);
  }

  function stop(): void {
    if (running) {
      // One last look while the readers are still there (plugin shutdown,
      // Zotero quitting), so the final sentence does not ride on the tick.
      // Forced: a popup closed earlier still holds its frozen savedPosition.
      for (const reader of guard(() => deps.readers(), [] as unknown[])) {
        record(reader, true);
      }
    }
    running = false;
    anyActive = false;
    tracked = new Set<string>();
    lastSeen.clear();
    wasActive.clear();
    if (tick !== null) {
      guard(() => deps.clearTimeout(tick), undefined);
      tick = null;
    }
    flush();
  }

  function lookup(reader: unknown): unknown | null {
    const attachment = guard(() => deps.attachmentOf(reader), null);
    if (!attachment) return null;
    return lookupPosition(entries, attachment.lib, attachment.key);
  }

  return { start, stop, sample, captureClose, flush, lookup };
}
