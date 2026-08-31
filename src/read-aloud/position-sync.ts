import { normalizePosition, samePosition, type PositionEntry } from './read-aloud-position';

/**
 * Fills the reading-position store in from the open readers.
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
 * The sampler stays synchronous; everything asynchronous lives in
 * position-store.ts. A changed sentence becomes one `save(entry)` into the
 * store's write queue — one row REPLACE, a fraction of a millisecond, so
 * the throttle the pref rewrite needed is gone (Zotero itself persists its
 * own copy on every change, reader.js:1037). The tick doubles as the
 * store's retry heartbeat: `retryWrites()` every pass, so a failed write
 * is retried once its window passes even when no sentence changes; the
 * store gates the cadence.
 *
 * The tick's interval changes with activity (ACTIVE_TICK_MS vs IDLE_TICK_MS),
 * so it is a recursive `setTimeout` rather than a fixed `setInterval` — which
 * the sandbox does provide, contrary to what this comment used to claim
 * (`plugins.js` assigns setInterval/clearInterval/requestIdleCallback;
 * verified again 2026-08-30 by reading the live sandbox global).
 *
 * Recording is sentence-triggered — an entry is only touched when the
 * sentence actually changes — so the tick is just how fast that change
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

export interface Attachment {
  lib: number;
  key: string;
}

export interface PositionSyncDeps {
  /** The rows the store loaded at startup — or the legacy pref, when the database could not open. */
  initial: PositionEntry[];
  /** One changed bookmark, into position-store's write queue. Synchronous, never awaited. */
  save(entry: PositionEntry): void;
  /** The tick's nudge: retry a failed store write once its window has passed. */
  retryWrites(): void;
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
  /** Clears the tick, after one last read of every open reader — the final sentence must not ride on the tick. */
  stop(): void;
  /** One pass over the open readers. */
  sample(): void;
  /**
   * One last read of a closing reader, called from the `reader.uninit`
   * wrap while the state is still whole. Reads even a deactivated session
   * (the popup was closed earlier; savedPosition is frozen), then freezes
   * the attachment so nothing the lingering reader does during teardown
   * can be copied over the captured value.
   */
  captureClose(reader: unknown): void;
  /** The stored position for a reader's attachment, or null. */
  lookup(reader: unknown): unknown | null;
  /** Every entry held, for the WebDAV transport's merge (position-transport.ts). */
  list(): PositionEntry[];
  /**
   * One entry from another machine (position-transport.ts): taken only when
   * strictly newer than what this machine holds, written through the same
   * store queue as the sampler's own saves. The reader itself is never
   * touched — an open document picks the position up at its next resume,
   * and an actively read one reclaims the entry with its next sentence.
   */
  adopt(entry: PositionEntry): boolean;
}

export function createPositionSync(deps: PositionSyncDeps): PositionSync {
  /** The in-memory store, by `lib/key` — every lookup is one hash hit. */
  const entries = new Map<string, PositionEntry>();
  // Normalized on the way in: rows from the database already are, but the
  // legacy-pref fallback can carry pre-#14 rect lists
  for (const e of deps.initial) {
    entries.set(e.lib + '/' + e.key, { ...e, pos: normalizePosition(e.pos) });
  }
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
   * silently broke resuming (2026-08-26: the row on disk was correct, the
   * copy in memory was a corpse, and cloneInto threw on it). So the position
   * is serialized on the way in; it has to survive as plain data anyway,
   * since it goes into a database row.
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
    const previous = entries.get(id);
    if (samePosition(previous?.pos, norm)) return seen;
    // Above whatever is held, clock or no clock: an entry adopted from a
    // machine with a fast clock must not pin this attachment against real
    // listening here — the write has to win the transport's merge too
    const entry: PositionEntry = { lib: attachment.lib, key: attachment.key, pos: norm, ts: previous ? Math.max(clock(), previous.ts + 1) : clock() };
    entries.set(id, entry);
    guard(() => deps.save(entry), undefined);
    return seen;
  }

  function sample(): void {
    let sawActive = false;
    for (const reader of guard(() => deps.readers(), [] as unknown[])) {
      const seen = record(reader);
      if (seen?.active) sawActive = true;
    }
    anyActive = sawActive;
    // The store retries a failed write on this heartbeat — gated there to
    // one attempt per window, so an idle pass costs a size check
    guard(() => deps.retryWrites(), undefined);
  }

  function captureClose(reader: unknown): void {
    // record() is guarded throughout: a reader half torn down at close
    // costs the final read, never what is already saved
    const seen = record(reader, true);
    // Freeze: the closed reader can linger in Zotero.Reader._readers while
    // teardown regresses its savedPosition — from here on, nothing short of
    // playing again may touch this attachment's entry
    if (seen) wasActive.delete(seen.lib + '/' + seen.key);
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
    lastSeen.clear();
    wasActive.clear();
    if (tick !== null) {
      guard(() => deps.clearTimeout(tick), undefined);
      tick = null;
    }
  }

  function lookup(reader: unknown): unknown | null {
    const attachment = guard(() => deps.attachmentOf(reader), null);
    if (!attachment) return null;
    return entries.get(attachment.lib + '/' + attachment.key)?.pos ?? null;
  }

  function list(): PositionEntry[] {
    return [...entries.values()];
  }

  function adopt(entry: PositionEntry): boolean {
    const id = entry.lib + '/' + entry.key;
    const existing = entries.get(id);
    if (existing && existing.ts >= entry.ts) return false;
    const taken: PositionEntry = { lib: entry.lib, key: entry.key, pos: normalizePosition(entry.pos), ts: entry.ts };
    entries.set(id, taken);
    guard(() => deps.save(taken), undefined);
    return true;
  }

  return { start, stop, sample, captureClose, lookup, list, adopt };
}
