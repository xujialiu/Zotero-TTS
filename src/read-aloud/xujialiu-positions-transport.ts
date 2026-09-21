import { createSingleFlight } from '../core/single-flight';
import { WebDAVError } from '../core/webdav';
import {
  entryOf,
  mergeSharedPositions,
  parseSharedPositions,
  serializeSharedPositions,
  SHARED_POSITIONS_FILENAME,
  SharedPositionsFileError,
  type SharedEntry,
  type SharedItem,
} from './xujialiu-positions-file';

/**
 * Carries the Positions File, `xujialiu-positions.json`, over the user's
 * WebDAV folder (docs/spec/SYNC-FORMAT.md, section 6): the shape of
 * position-transport.ts, for the file OpenReader shares. Every sync is
 * download → merge → adopt → conditional upload: the file's items merged
 * with this machine's by Document Id, newest stamp winning; every usable
 * merged item offered to the document store, which takes it only for a
 * document this machine holds and only when strictly newer than what it has;
 * the union uploaded back only when its canonical text differs from what
 * came down. Items for documents this machine does not have, and items in
 * formats this build does not implement, stay in the file untouched (spec
 * 2.5): the file is every device's positions, not this machine's view.
 *
 * Nothing removes an item (spec 6.7), so unlike the plugin's own transport
 * there is no tombstone here. A file of a newer version is left strictly
 * alone; a malformed one is treated as absent and healed by the next upload;
 * failures are reported once per window and retried at the next poke. The
 * pokes are the plugin's (startup, reader open and close, shutdown, the pane,
 * an import) plus the two the spec adds in 6.8: quiet after a pause, and
 * once before a resume.
 *
 * `prepare` runs once before the first sync: the upgrade's backfill of
 * Document Ids for attachments that already had a position, so the first
 * upload after the update carries what this machine already knows.
 */

export const SHARED_SYNC_RETRY_MS = 60_000;

export interface SharedPositionsClient {
  download(name: string): Promise<string>;
  upload(name: string, text: string): Promise<void>;
}

export interface SharedTransportDeps {
  /** The webdav.syncPositions switch, read per sync so the checkbox applies at once. */
  enabled(): boolean;
  /** A client for the settings as they are now; throws WebDAVError('config') for an unusable URL. */
  client(): SharedPositionsClient;
  /** Every item this machine holds a position for. */
  local(): SharedItem[];
  /** Offer one usable item; true when this machine holds the document, the item is strictly newer, and it was taken. */
  adopt(item: SharedItem): boolean;
  /** Awaited before the first sync of the session; a rejection is reported and the sync goes on. */
  prepare?(): Promise<void>;
  now(): number;
  error(e: unknown): void;
  debug(message: string): void;
  /** After every completed sync, skipped ones excepted. */
  onSynced?(): void;
}

/**
 * The last completed run's numbers — a skipped run leaves them, an erroring
 * run reports `uploaded` false, `adopted` 0 and the rest null. `adopted` is
 * per run; `lastAdoption` is the durable record of the last run that took
 * something, as `documents.adopted` in document-positions.ts counts the
 * session's.
 */
export interface SharedTransportStats {
  syncs: number;
  lastOutcome: 'ok' | 'skipped' | 'error' | null;
  lastTrigger: string | null;
  lastAt: number | null;
  lastError: string | null;
  remoteItems: number | null;
  /** Items the file held that this build could not use — other formats, malformed — carried through. */
  carried: number | null;
  /** Items the file held with no id, dropped and counted. */
  dropped: number | null;
  adopted: number | null;
  uploaded: boolean | null;
  lastAdoption: { at: number; count: number } | null;
  running: boolean;
}

export interface SharedTransport {
  /** Schedule a sync; never blocks, a burst coalesces into one trailing run. */
  poke(trigger: string): void;
  /** One awaited sync — the shutdown's final push and the pull before a resume; runs even inside the failure window. */
  flush(trigger: string): Promise<void>;
  stats(): SharedTransportStats;
}

export function createSharedTransport(deps: SharedTransportDeps): SharedTransport {
  let syncs = 0;
  let lastOutcome: SharedTransportStats['lastOutcome'] = null;
  let lastTrigger: string | null = null;
  let lastAt: number | null = null;
  let lastError: string | null = null;
  let remoteItems: number | null = null;
  let carried: number | null = null;
  let dropped: number | null = null;
  let adoptedCount: number | null = null;
  let uploadedFlag: boolean | null = null;
  let lastAdoption: SharedTransportStats['lastAdoption'] = null;
  let lastFailureAt = Number.NEGATIVE_INFINITY;
  let lastReportAt = Number.NEGATIVE_INFINITY;
  let prepared: Promise<void> | null = null;

  function report(e: unknown): void {
    try {
      deps.error(e);
    } catch {
      // Reporting must never be the thing that throws
    }
  }

  function reportGated(e: unknown): void {
    const at = deps.now();
    if (at - lastReportAt < SHARED_SYNC_RETRY_MS) return;
    lastReportAt = at;
    report(e);
  }

  function notify(): void {
    try {
      deps.onSynced?.();
    } catch (e) {
      reportGated(e);
    }
  }

  async function sync(trigger: string, force: boolean): Promise<void> {
    syncs++;
    lastTrigger = trigger;
    lastAt = deps.now();
    if (!deps.enabled()) {
      lastOutcome = 'skipped';
      return;
    }
    if (!force && deps.now() - lastFailureAt < SHARED_SYNC_RETRY_MS) {
      lastOutcome = 'skipped';
      return;
    }
    try {
      if (deps.prepare) {
        // Once per session; a backfill that failed is reported, never retried
        // inside every sync — the next start runs it again
        prepared ??= deps.prepare().catch((e) => report(e));
        await prepared;
      }
      const client = deps.client();
      let remoteText: string | null = null;
      try {
        remoteText = await client.download(SHARED_POSITIONS_FILENAME);
      } catch (e) {
        if (!(e instanceof WebDAVError) || e.kind !== 'not-found') throw e;
      }
      let remote: SharedEntry[] = [];
      let droppedNow = 0;
      if (remoteText !== null) {
        try {
          const parsed = parseSharedPositions(remoteText);
          remote = parsed.entries;
          droppedNow = parsed.dropped;
        } catch (e) {
          if (e instanceof SharedPositionsFileError && e.kind === 'newer') throw e;
          reportGated(e);
          remoteText = null;
        }
      }
      const local = deps.local().map(entryOf);
      const merged = mergeSharedPositions(local, remote);
      // Only what came from the file is offered: an entry that is this
      // machine's own (it won the merge, or nothing else had the id) is
      // the same object the map was given, and adopting it would be a no-op
      const own = new Set(local);
      let adopted = 0;
      let carriedNow = 0;
      for (const entry of merged) {
        if (!entry.usable) {
          carriedNow++;
          continue;
        }
        if (own.has(entry)) continue;
        if (deps.adopt(entry.usable)) adopted++;
      }
      const text = serializeSharedPositions(merged);
      let uploaded = false;
      if (remoteText === null ? merged.length > 0 : text !== remoteText) {
        await client.upload(SHARED_POSITIONS_FILENAME, text);
        uploaded = true;
      }
      remoteItems = remote.length;
      carried = carriedNow;
      dropped = droppedNow;
      adoptedCount = adopted;
      uploadedFlag = uploaded;
      if (adopted > 0) lastAdoption = { at: deps.now(), count: adopted };
      lastOutcome = 'ok';
      lastError = null;
      lastFailureAt = Number.NEGATIVE_INFINITY;
      deps.debug(`shared position sync (${trigger}): ${remote.length} remote, ${merged.length} merged, ${adopted} adopted, ${carriedNow} carried${droppedNow ? `, ${droppedNow} dropped` : ''}${uploaded ? ', uploaded' : ''}`);
      notify();
    } catch (e) {
      lastOutcome = 'error';
      lastError = String(e);
      lastFailureAt = deps.now();
      // This run's numbers, not the last good run's: nothing went up and
      // nothing was taken; what the file held is unknown
      uploadedFlag = false;
      adoptedCount = 0;
      remoteItems = null;
      carried = null;
      dropped = null;
      reportGated(e);
      notify();
    }
  }

  const flight = createSingleFlight(sync);

  return {
    poke: flight.poke,
    flush: flight.flush,
    stats: () => ({
      syncs,
      lastOutcome,
      lastTrigger,
      lastAt,
      lastError,
      remoteItems,
      carried,
      dropped,
      adopted: adoptedCount,
      uploaded: uploadedFlag,
      lastAdoption,
      running: flight.running(),
    }),
  };
}
