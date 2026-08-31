import { WebDAVError } from '../core/webdav';
import { mergePositions, parsePositions, POSITIONS_FILENAME, PositionsFileError, serializePositions } from './position-file';
import type { PositionEntry } from './read-aloud-position';

/**
 * Carries the reading-position store over the user's WebDAV server (#40):
 * the automatic side of "the bookmarks follow the user between computers".
 *
 * Every sync is read-merge-write against the one shared file
 * (position-file.ts): download, merge with this machine's entries — per
 * attachment, newest `ts` wins — offer every merged entry the local library
 * actually holds to the sampler (`adopt`, which takes only what is strictly
 * newer and writes through the store's own queue), and upload the union
 * back only when it differs from what came down. Entries for documents this
 * machine does not have stay in the file untouched: the file is the union
 * of every machine's bookmarks, not this machine's view.
 *
 * Event-driven, no timer: the wiring pokes it at startup, when a reader
 * opens, when a tab closes, and flushes it once at shutdown. Pokes are
 * fire-and-forget and single-flight — a burst of tab opens coalesces into
 * the running sync plus one trailing one — so nothing ever blocks a tab.
 *
 * Failures follow the store's pattern (#14): report once per window, back
 * off, and never treat a failed write as done — the local store is the
 * source of truth and the next healthy sync carries everything. Two remote
 * conditions part ways deliberately: a malformed file is treated as absent
 * and healed by the next upload, but a file of a newer version is left
 * strictly alone — a downgrade must not eat what a newer build wrote.
 */

/** A failed sync retries at most once per window, and says so once per window. */
export const SYNC_RETRY_MS = 60_000;

/** The slice of core/webdav's client the transport drives. */
export interface PositionsClient {
  download(name: string): Promise<string>;
  upload(name: string, text: string): Promise<void>;
}

export interface PositionTransportDeps {
  /** The webdav.syncPositions switch, read per sync so the checkbox applies at once. */
  enabled(): boolean;
  /** A client for the settings as they are now; throws WebDAVError('config') for an unusable URL. */
  client(): PositionsClient;
  /** Every bookmark this machine holds — the sampler's map, store-backed. */
  local(): PositionEntry[];
  /** Offer one remote entry to the sampler and store; true when strictly newer and taken. */
  adopt(entry: PositionEntry): boolean;
  /** `Zotero.Items.getIDFromLibraryAndKey` — only entries this machine can resolve are adopted. */
  itemExists(lib: number, key: string): boolean;
  /** `Zotero.Libraries.exists`. */
  libraryExists(lib: number): boolean;
  now(): number;
  error(e: unknown): void;
  debug(message: string): void;
}

export interface PositionTransportStats {
  /** Sync attempts, skipped ones included. */
  syncs: number;
  lastOutcome: 'ok' | 'skipped' | 'error' | null;
  lastTrigger: string | null;
  lastAt: number | null;
  lastError: string | null;
  /** The last completed sync's numbers; null before one completes. */
  remoteEntries: number | null;
  adopted: number | null;
  uploaded: boolean | null;
  running: boolean;
}

export interface PositionTransport {
  /** Schedule a sync; never blocks, a burst coalesces into one trailing run. */
  poke(trigger: string): void;
  /** One awaited sync — shutdown's final push; runs even inside the failure window. */
  flush(trigger: string): Promise<void>;
  stats(): PositionTransportStats;
}

export function createPositionTransport(deps: PositionTransportDeps): PositionTransport {
  let syncs = 0;
  let lastOutcome: PositionTransportStats['lastOutcome'] = null;
  let lastTrigger: string | null = null;
  let lastAt: number | null = null;
  let lastError: string | null = null;
  let remoteEntries: number | null = null;
  let adoptedCount: number | null = null;
  let uploadedFlag: boolean | null = null;
  let lastFailureAt = Number.NEGATIVE_INFINITY;
  let lastReportAt = Number.NEGATIVE_INFINITY;

  function report(e: unknown): void {
    try {
      deps.error(e);
    } catch {
      // Reporting must never be the thing that throws
    }
  }

  /** One report per window: a down server says so once a minute, not once per closed tab. */
  function reportGated(e: unknown): void {
    const at = deps.now();
    if (at - lastReportAt < SYNC_RETRY_MS) return;
    lastReportAt = at;
    report(e);
  }

  /** Never throws: outcome and error land in the stats and the gated report. */
  async function sync(trigger: string, force: boolean): Promise<void> {
    syncs++;
    lastTrigger = trigger;
    lastAt = deps.now();
    if (!deps.enabled()) {
      lastOutcome = 'skipped';
      return;
    }
    if (!force && deps.now() - lastFailureAt < SYNC_RETRY_MS) {
      lastOutcome = 'skipped';
      return;
    }
    try {
      const client = deps.client();
      let remoteText: string | null = null;
      try {
        remoteText = await client.download(POSITIONS_FILENAME);
      } catch (e) {
        // No file yet is the ordinary first run, not a failure
        if (!(e instanceof WebDAVError) || e.kind !== 'not-found') throw e;
      }
      let remote: PositionEntry[] = [];
      if (remoteText !== null) {
        try {
          remote = parsePositions(remoteText);
        } catch (e) {
          // A newer build's file is left strictly alone; a broken one is
          // treated as absent, and the upload below heals it
          if (e instanceof PositionsFileError && e.kind === 'newer') throw e;
          reportGated(e);
          remoteText = null;
        }
      }
      const merged = mergePositions(deps.local(), remote);
      let adopted = 0;
      for (const entry of merged) {
        // Only bookmarks this machine can resolve go into its store; the
        // check failing keeps the entry out of the store, never out of the file
        let here = false;
        try {
          here = deps.libraryExists(entry.lib) && deps.itemExists(entry.lib, entry.key);
        } catch (e) {
          reportGated(e);
        }
        if (here && deps.adopt(entry)) adopted++;
      }
      const text = serializePositions(merged);
      let uploaded = false;
      if (remoteText === null ? merged.length > 0 : text !== remoteText) {
        await client.upload(POSITIONS_FILENAME, text);
        uploaded = true;
      }
      remoteEntries = remote.length;
      adoptedCount = adopted;
      uploadedFlag = uploaded;
      lastOutcome = 'ok';
      lastError = null;
      lastFailureAt = Number.NEGATIVE_INFINITY;
      deps.debug(`position sync (${trigger}): ${remote.length} remote, ${merged.length} merged, ${adopted} adopted${uploaded ? ', uploaded' : ''}`);
    } catch (e) {
      lastOutcome = 'error';
      lastError = String(e);
      lastFailureAt = deps.now();
      reportGated(e);
    }
  }

  /** The one in-flight sync, and the at-most-one waiting behind it. */
  let inFlight: Promise<void> | null = null;
  let trailing: { trigger: string; force: boolean; promise: Promise<void>; resolve: () => void } | null = null;

  function request(trigger: string, force: boolean): Promise<void> {
    if (inFlight) {
      if (trailing) {
        trailing.trigger = trigger;
        trailing.force = trailing.force || force;
      } else {
        let resolve!: () => void;
        const promise = new Promise<void>((r) => {
          resolve = r;
        });
        trailing = { trigger, force, promise, resolve };
      }
      return trailing.promise;
    }
    inFlight = sync(trigger, force).finally(() => {
      inFlight = null;
      if (trailing) {
        const next = trailing;
        trailing = null;
        void request(next.trigger, next.force).finally(next.resolve);
      }
    });
    return inFlight;
  }

  return {
    poke: (trigger) => {
      void request(trigger, false);
    },
    flush: (trigger) => request(trigger, true),
    stats: () => ({
      syncs,
      lastOutcome,
      lastTrigger,
      lastAt,
      lastError,
      remoteEntries,
      adopted: adoptedCount,
      uploaded: uploadedFlag,
      running: inFlight !== null,
    }),
  };
}
