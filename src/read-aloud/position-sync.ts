import type { PrefsBackend } from '../core/settings';
import { lookupPosition, putPosition, readPositions, samePosition, writePositions, type PositionEntry } from './read-aloud-position';

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
 * `setInterval` is not in the sandbox whitelist, so the tick is a recursive
 * `setTimeout`. Writes go through a throttle: continuous listening moves the
 * position every few seconds and every pref write hits prefs.js.
 *
 * Recording is already sentence-triggered — an entry is only touched when
 * the sentence actually changes — so the tick is just how fast that change
 * is noticed. While a reader is speaking it runs twice a second, well under
 * the length of any sentence, so what is captured at the moment a tab
 * closes is the sentence that was being read and not the one before it;
 * the rest of the time nothing can move and the cheap interval is enough.
 */

/** Twice a second while speaking: shorter than any sentence, so none is missed. */
export const SPEAKING_TICK_MS = 500;
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
  /** Write now, ignoring the throttle. */
  flush(): void;
  /** The stored position for a reader's attachment, or null. */
  lookup(reader: unknown): unknown | null;
}

export function createPositionSync(deps: PositionSyncDeps): PositionSync {
  let entries: PositionEntry[] = readPositions(deps.prefs);
  let dirty = false;
  let lastWrite = 0;
  let tick: unknown = null;
  let running = false;
  let speaking = false;
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

  /** What one pass learned about a reader: the attachment it holds open, and whether it is speaking. */
  type Seen = Attachment & { speaking: boolean };

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
  function record(reader: unknown): Seen | null {
    const attachment = guard(() => deps.attachmentOf(reader), null);
    if (!attachment) return null;
    const manager = guard(() => deps.managerOf(reader), null);
    const seen: Seen = { ...attachment, speaking: !!manager?.active && !manager.paused };
    if (!manager?.active) return seen;
    const raw = guard(() => deps.savedPositionOf(reader), null);
    if (raw === null || raw === undefined) return seen;
    // Serialize once: it is both the change test and the copy.
    const text = guard(() => JSON.stringify(raw), null);
    if (text === null || text === undefined) return seen;
    const id = attachment.lib + '/' + attachment.key;
    if (lastSeen.get(id) === text) return seen;
    lastSeen.set(id, text);
    const pos = guard(() => JSON.parse(text) as unknown, null);
    if (pos === null) return seen;
    if (samePosition(lookupPosition(entries, attachment.lib, attachment.key), pos)) return seen;
    entries = putPosition(entries, attachment.lib, attachment.key, pos, clock());
    dirty = true;
    return seen;
  }

  function flush(): void {
    if (!dirty) return;
    guard(() => writePositions(deps.prefs, entries), undefined);
    dirty = false;
    lastWrite = clock();
  }

  function sample(): void {
    const open = new Set<string>();
    let anySpeaking = false;
    for (const reader of guard(() => deps.readers(), [] as unknown[])) {
      const seen = record(reader);
      if (!seen) continue;
      open.add(seen.lib + '/' + seen.key);
      if (seen.speaking) anySpeaking = true;
    }
    speaking = anySpeaking;
    // A reader that was open and is not any more: its tab was closed, so put
    // what we have on disk now rather than waiting out the throttle. This is
    // the closest thing to a close event there is — Zotero's
    // Reader.registerEventListener carries only render and context-menu
    // hooks — and reading the position *at* close would be too late anyway,
    // with the compartment already going away.
    let closed = false;
    for (const key of tracked) if (!open.has(key)) closed = true;
    tracked = open;
    if (closed || (dirty && clock() - lastWrite >= WRITE_THROTTLE_MS)) flush();
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
            if (running) arm(speaking ? SPEAKING_TICK_MS : IDLE_TICK_MS);
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
    running = false;
    speaking = false;
    tracked = new Set<string>();
    lastSeen.clear();
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

  return { start, stop, sample, flush, lookup };
}
