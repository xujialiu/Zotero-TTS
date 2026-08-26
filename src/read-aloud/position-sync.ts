import type { PrefsBackend } from '../core/settings';
import { lookupPosition, putPosition, readPositions, samePosition, writePositions, type PositionEntry } from './read-aloud-position';

/**
 * Fills read-aloud-position.ts in from the open readers.
 *
 * The position is *read*, never patched in:
 * `reader._internalReader._state.readAloudState.savedPosition` is the value
 * Zotero maintains for itself, updated on every active-segment change
 * (reader bundle ~83604). Objects reached from our side are safe to read
 * across the compartment boundary (NOTES.md), so this needs neither
 * `exportFunction` nor Xray waiving — unlike wrapping
 * `_onReadAloudEngineStateChanged`, which is the class of instance-method
 * patch that has silently broken the Read Aloud button before. A bookmark
 * up to one tick stale is not worth that risk.
 *
 * `setInterval` is not in the sandbox whitelist, so the tick is a recursive
 * `setTimeout`. Writes go through a throttle: continuous listening moves the
 * position every few seconds and every pref write hits prefs.js.
 */

export const TICK_MS = 3000;
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
  /** `reader._internalReader._readAloudManager`. */
  managerOf(reader: unknown): { active?: boolean } | null;
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

  function record(reader: unknown): void {
    const manager = guard(() => deps.managerOf(reader), null);
    if (!manager?.active) return;
    const pos = guard(() => deps.savedPositionOf(reader), null);
    if (pos === null || pos === undefined) return;
    const attachment = guard(() => deps.attachmentOf(reader), null);
    if (!attachment) return;
    if (samePosition(lookupPosition(entries, attachment.lib, attachment.key), pos)) return;
    entries = putPosition(entries, attachment.lib, attachment.key, pos, clock());
    dirty = true;
  }

  function flush(): void {
    if (!dirty) return;
    guard(() => writePositions(deps.prefs, entries), undefined);
    dirty = false;
    lastWrite = clock();
  }

  function sample(): void {
    for (const reader of guard(() => deps.readers(), [] as unknown[])) record(reader);
    if (dirty && clock() - lastWrite >= WRITE_THROTTLE_MS) flush();
  }

  function arm(): void {
    tick = guard(
      () =>
        deps.setTimeout(() => {
          tick = null;
          if (!running) return;
          sample();
          arm();
        }, TICK_MS),
      null,
    );
  }

  function start(): void {
    if (running) return;
    running = true;
    lastWrite = clock();
    arm();
  }

  function stop(): void {
    running = false;
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
