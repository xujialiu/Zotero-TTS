import { normalizePosition, type PositionEntry } from './read-aloud-position';
import type { SharedItem } from './xujialiu-positions-file';

/**
 * The reading-position store's home: the plugin's own SQLite database,
 * `<data directory>/zotero-tts.sqlite` (#16). The pref that used to hold it
 * warns at 4 KiB and throws at 1 MiB, and a store with one entry per
 * listened-to attachment has an ordinary size in the hundreds of kilobytes;
 * a row write is a fraction of a millisecond and does not grow with the
 * library the way rewriting a blob does.
 *
 * The module owns everything asynchronous: the schema and its
 * `PRAGMA user_version` migration, the one-time import of the old pref, the
 * startup sweep of rows whose attachment or library no longer exists, the
 * load of every row, the write queue, and the close. The sampler
 * (position-sync.ts) stays synchronous and talks to this store through
 * `save()`/`remove()` plus one awaited `drain()` at shutdown.
 *
 * The write queue serializes and coalesces itself: ops queued while a write
 * is in flight accumulate by attachment — last op wins — and go out in the
 * next batch, so there is no timer and no throttle. A failed write leaves
 * its ops in the queue for the next attempt (#14: never treat a failed
 * write as done), behind anything newer that arrived meanwhile; retries are
 * gated to one attempt per RETRY_MS so a persistently failing disk reports
 * once per window, not on every 500 ms tick. Deletions ride the same queue,
 * so a `'delete'` notification arriving beside a queued save cannot be
 * overtaken by it — and the notifier observer stays synchronous, which
 * matters because Zotero awaits every observer (xpcom/notifier.js:167).
 *
 * A second table, `deletions`, holds this machine's tombstones (#51): one
 * row per attachment permanently deleted here whose bookmark this machine
 * held, stamped when it learned of the deletion. The WebDAV transport
 * (position-transport.ts) drops an entry stamped no later than its
 * tombstone from the merge, so the shared file loses the orphan instead of
 * keeping it forever; the tombstones themselves never leave the machine.
 * The startup sweep records one for every row whose library is still here
 * but whose item is not — a deletion that happened while the plugin was
 * not running — and none for a row whose library is gone, since a library
 * removed from this machine is not a deleted document.
 *
 * Two more tables since schema 3 (docs/spec/SYNC-FORMAT.md, issue #126):
 * `documents` — the Document Id computed for an EPUB attachment this machine
 * holds a position for, keyed like `positions`, so the id is computed once
 * per attachment and the `{lib, key}` to id mapping never leaves this
 * machine; and `document_positions` — the shared Positions File's items for
 * the documents this machine holds, keyed by Document Id, whether this
 * machine wrote them or adopted them from a phone. Both ride the same write
 * queue as the rows above (`saveDocument`, `saveSharedPosition`) and are read
 * back once with `loadShared()` after `open()`.
 *
 * The connection MUST be closed permanently at shutdown: Gecko's
 * Sqlite.sys.mjs blocks `profile-before-change` on every open connection,
 * so a leaked one turns quitting Zotero into a 60-second AsyncShutdown hang
 * and a crash report. After the close, a late tick's save is swallowed —
 * any write would throw "Database permanently closed".
 */

export const SCHEMA_VERSION = 3;

/** A failed write retries at most once per window — the pref store's cadence. */
export const RETRY_MS = 10000;

/**
 * The slice of `Zotero.DBConnection` the store drives. The tests run the
 * same SQL against Node's built-in SQLite behind this interface; the one
 * Zotero quirk mimicked there is `valueQueryAsync` returning false, not
 * null, when there is no row.
 */
export interface PositionDatabase {
  queryAsync(sql: string, params?: unknown[]): Promise<unknown>;
  valueQueryAsync(sql: string, params?: unknown[]): Promise<unknown>;
  executeTransaction<T>(fn: () => Promise<T>): Promise<T>;
  closeDatabase(permanent: boolean): Promise<void>;
}

export interface PositionStoreDeps {
  db: PositionDatabase;
  /** The old pref store: read for the one-time import, cleared only after it commits. */
  legacy: {
    read(): PositionEntry[];
    clear(): void;
  };
  /** `Zotero.Items.getIDFromLibraryAndKey` — synchronous once Zotero has initialized. */
  itemExists(lib: number, key: string): boolean;
  /** `Zotero.Libraries.exists`. */
  libraryExists(lib: number): boolean;
  now(): number;
  error(e: unknown): void;
}

export interface PositionStoreStats {
  state: 'new' | 'open' | 'failed' | 'closed';
  schemaVersion: number | null;
  /** Pref entries imported by this open(); null before it ran. */
  imported: number | null;
  /** Rows removed by the startup sweep; null before it ran. */
  swept: number | null;
  /** Rows handed to the sampler; null before the load ran. */
  loaded: number | null;
  queued: number;
  writing: boolean;
  lastError: string | null;
  /** Tombstones held in memory — loaded at open, plus those recorded since. */
  deletions: number;
}

/** One row of `documents`: the Document Id this machine computed for an attachment (spec 6.3). */
export interface DocumentRow {
  lib: number;
  key: string;
  documentId: string;
  publicationId: string | null;
  /** When the id was computed, ms since the epoch. */
  identifiedAt: number;
}

export interface PositionStore {
  /**
   * Migrate the schema, import the old pref store, sweep orphaned rows,
   * and return every surviving row. Rejects when the database cannot be
   * opened — the caller keeps the sampler running in memory and reports.
   */
  open(): Promise<PositionEntry[]>;
  /** The two shared-sync tables, read once after `open()`; rejects only when the read itself fails. */
  loadShared(): Promise<{ documents: DocumentRow[]; positions: SharedItem[] }>;
  /** Queue one `documents` row; coalesced per attachment like a position. */
  saveDocument(row: DocumentRow): void;
  /** Queue one Positions File item for a document this machine holds; coalesced per Document Id. */
  saveSharedPosition(item: SharedItem): void;
  /** Queue one row write; coalesced per attachment, safe before open and after close. */
  save(entry: PositionEntry): void;
  /**
   * Queue one row's removal — permanent item deletion; same queue, last op
   * per attachment wins. With `deletedAt`, a tombstone is recorded too
   * (#51): the same transaction writes it to `deletions`, and `deletedAt()`
   * answers it at once, so the delete-triggered sync drops the entry from
   * the shared file before the write has even landed.
   */
  remove(lib: number, key: string, deletedAt?: number): void;
  /** When this machine permanently deleted the attachment — its tombstone — or null. Synchronous, from memory. */
  deletedAt(lib: number, key: string): number | null;
  /** Retry a failed flush; a no-op while healthy, gated to one attempt per RETRY_MS. */
  retry(): void;
  /** One forced flush of whatever is queued — no retry loop; the caller bounds the wait. */
  drain(): Promise<void>;
  /** Close the connection for good; whatever still cannot be written is dropped. */
  close(): Promise<void>;
  stats(): PositionStoreStats;
}

type Op =
  | { kind: 'put'; entry: PositionEntry }
  | { kind: 'remove'; lib: number; key: string }
  | { kind: 'tombstone'; lib: number; key: string; ts: number }
  | { kind: 'document'; row: DocumentRow }
  | { kind: 'shared'; item: SharedItem };

export function createPositionStore(deps: PositionStoreDeps): PositionStore {
  let state: PositionStoreStats['state'] = 'new';
  let schemaVersion: number | null = null;
  let imported: number | null = null;
  let swept: number | null = null;
  let loaded: number | null = null;
  let lastError: string | null = null;
  let lastFailureAt = 0;
  /**
   * Pending ops by `lib/key`, last op per attachment wins; Map order is
   * arrival order. A tombstone rides under its own key, so a save queued
   * behind the remove cannot swallow it.
   */
  const queue = new Map<string, Op>();
  /** This machine's tombstones by `lib/key`: loaded at open, plus those recorded since. */
  const tombstones = new Map<string, number>();
  /** The running flush, so drain() can wait it out; never rejects. */
  let pumping: Promise<void> | null = null;

  function report(e: unknown): void {
    try {
      deps.error(e);
    } catch {
      // Reporting must never be the thing that throws
    }
  }

  function opKey(lib: number, key: string): string {
    return lib + '/' + key;
  }

  async function writeBatch(batch: [string, Op][]): Promise<void> {
    await deps.db.executeTransaction(async () => {
      for (const [, op] of batch) {
        if (op.kind === 'put') {
          await deps.db.queryAsync('REPLACE INTO positions (libraryID, key, pos, ts) VALUES (?, ?, ?, ?)', [
            op.entry.lib,
            op.entry.key,
            JSON.stringify(op.entry.pos),
            op.entry.ts,
          ]);
        } else if (op.kind === 'remove') {
          await deps.db.queryAsync('DELETE FROM positions WHERE libraryID = ? AND key = ?', [op.lib, op.key]);
        } else if (op.kind === 'tombstone') {
          await deps.db.queryAsync('REPLACE INTO deletions (libraryID, key, ts) VALUES (?, ?, ?)', [op.lib, op.key, op.ts]);
        } else if (op.kind === 'document') {
          await deps.db.queryAsync('REPLACE INTO documents (libraryID, key, documentId, publicationId, identifiedAt) VALUES (?, ?, ?, ?, ?)', [
            op.row.lib,
            op.row.key,
            op.row.documentId,
            op.row.publicationId,
            op.row.identifiedAt,
          ]);
        } else {
          const { item } = op;
          await deps.db.queryAsync(
            'REPLACE INTO document_positions (documentId, format, publicationId, locator, anchorExact, anchorPrefix, anchorSuffix, stampAt, stampDevice) ' +
              'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [item.id, item.format, item.publicationId, item.locator, item.anchor.exact, item.anchor.prefix, item.anchor.suffix, item.stamp.at, item.stamp.device],
          );
        }
      }
    });
  }

  /**
   * The one writer. Batches until the queue is dry; a failure re-queues the
   * batch behind anything newer and stops — the next attempt comes from the
   * tick's retry() once the window has passed, or forced from drain().
   */
  function pump(force = false): Promise<void> {
    if (pumping) return pumping;
    if (state !== 'open' || queue.size === 0) return Promise.resolve();
    if (!force && lastError !== null && deps.now() - lastFailureAt < RETRY_MS) return Promise.resolve();
    pumping = (async () => {
      try {
        while (queue.size > 0) {
          const batch = [...queue.entries()];
          queue.clear();
          try {
            await writeBatch(batch);
            lastError = null;
          } catch (e) {
            lastError = String(e);
            lastFailureAt = deps.now();
            // Back into the queue — but never over a newer op for the same
            // attachment that arrived while this batch was in flight
            for (const [id, op] of batch) {
              if (!queue.has(id)) queue.set(id, op);
            }
            report(e);
            return;
          }
        }
      } finally {
        pumping = null;
      }
    })();
    return pumping;
  }

  async function open(): Promise<PositionEntry[]> {
    // Schema, keyed off PRAGMA user_version; 0 is a fresh file. Every
    // step is additive and idempotent, so one pass brings any older file
    // up: 1 (#16) the rows, 2 (#51) the tombstones, 3 (#126) the Document
    // Ids and the shared Positions File's items
    const version = Number(await deps.db.valueQueryAsync('PRAGMA user_version')) || 0;
    if (version < SCHEMA_VERSION) {
      await deps.db.executeTransaction(async () => {
        await deps.db.queryAsync(
          'CREATE TABLE IF NOT EXISTS positions (' +
            'libraryID INTEGER NOT NULL, ' +
            'key TEXT NOT NULL, ' +
            'pos TEXT NOT NULL, ' +
            'ts INTEGER NOT NULL, ' +
            'PRIMARY KEY (libraryID, key))',
        );
        await deps.db.queryAsync(
          'CREATE TABLE IF NOT EXISTS deletions (' +
            'libraryID INTEGER NOT NULL, ' +
            'key TEXT NOT NULL, ' +
            'ts INTEGER NOT NULL, ' +
            'PRIMARY KEY (libraryID, key))',
        );
        await deps.db.queryAsync(
          'CREATE TABLE IF NOT EXISTS documents (' +
            'libraryID INTEGER NOT NULL, ' +
            'key TEXT NOT NULL, ' +
            'documentId TEXT NOT NULL, ' +
            'publicationId TEXT, ' +
            'identifiedAt INTEGER NOT NULL, ' +
            'PRIMARY KEY (libraryID, key))',
        );
        await deps.db.queryAsync(
          'CREATE TABLE IF NOT EXISTS document_positions (' +
            'documentId TEXT NOT NULL PRIMARY KEY, ' +
            'format TEXT NOT NULL, ' +
            'publicationId TEXT, ' +
            'locator TEXT NOT NULL, ' +
            'anchorExact TEXT NOT NULL, ' +
            'anchorPrefix TEXT NOT NULL, ' +
            'anchorSuffix TEXT NOT NULL, ' +
            'stampAt INTEGER NOT NULL, ' +
            'stampDevice TEXT NOT NULL)',
        );
        await deps.db.queryAsync('PRAGMA user_version = ' + SCHEMA_VERSION);
      });
    }
    schemaVersion = SCHEMA_VERSION;

    // One-time import of the pref store, normalized on the way in (entries
    // from before #14 can carry a full rect list). The pref is cleared only
    // after the transaction commits: a mid-import failure leaves it in
    // place and the next start retries. The import, the `legacy` dep and
    // read-aloud-position's readPositions all go away in 2.0 (#22).
    let legacy: PositionEntry[] = [];
    try {
      legacy = deps.legacy.read();
    } catch (e) {
      report(e);
    }
    if (legacy.length > 0) {
      await deps.db.executeTransaction(async () => {
        for (const e of legacy) {
          await deps.db.queryAsync('REPLACE INTO positions (libraryID, key, pos, ts) VALUES (?, ?, ?, ?)', [
            e.lib,
            e.key,
            JSON.stringify(normalizePosition(e.pos)),
            e.ts,
          ]);
        }
      });
    }
    imported = legacy.length;
    try {
      // An empty or unparseable pref is cleared too — nothing to lose
      deps.legacy.clear();
    } catch (e) {
      report(e);
    }

    // Sweep and load in one read. Deletion is exact or not at all: the
    // first existence check that throws turns the sweep off for this start
    // — a row wrongly kept costs nothing, a row wrongly deleted is the
    // user's bookmark.
    const rows = ((await deps.db.queryAsync('SELECT libraryID, key, pos, ts FROM positions')) ?? []) as {
      libraryID: unknown;
      key: unknown;
      pos: unknown;
      ts: unknown;
    }[];
    let checksBroken = false;
    const alive: PositionEntry[] = [];
    const dead: { lib: number; key: string; tombstone: number | null }[] = [];
    for (const row of rows) {
      const lib = Number(row.libraryID);
      const key = String(row.key);
      let keep = true;
      let libraryHere = true;
      if (!checksBroken) {
        try {
          libraryHere = deps.libraryExists(lib);
          keep = libraryHere && deps.itemExists(lib, key);
        } catch (e) {
          checksBroken = true;
          keep = true;
          report(e);
        }
      }
      if (!keep) {
        // A tombstone only for a document deleted while the plugin was not
        // running — the library still here, the item not — stamped at open
        // or at the row's own time, whichever is later, so it beats the
        // shared file's copy of exactly this row (#51)
        dead.push({ lib, key, tombstone: libraryHere ? Math.max(deps.now(), Number(row.ts) || 0) : null });
        continue;
      }
      try {
        const pos = JSON.parse(String(row.pos)) as unknown;
        if (pos === null || pos === undefined) throw new Error('zotero-tts: stored position is null');
        alive.push({ lib, key, pos, ts: Number(row.ts) });
      } catch (e) {
        // Skipped, not deleted: the row stays on disk for inspection
        report(e);
      }
    }
    if (dead.length > 0) {
      await deps.db.executeTransaction(async () => {
        for (const d of dead) {
          await deps.db.queryAsync('DELETE FROM positions WHERE libraryID = ? AND key = ?', [d.lib, d.key]);
          if (d.tombstone !== null) {
            await deps.db.queryAsync('REPLACE INTO deletions (libraryID, key, ts) VALUES (?, ?, ?)', [d.lib, d.key, d.tombstone]);
          }
        }
      });
      for (const d of dead) {
        if (d.tombstone !== null) tombstones.set(opKey(d.lib, d.key), d.tombstone);
      }
    }
    swept = dead.length;
    loaded = alive.length;

    // The tombstones of earlier sessions. One recorded while the database
    // was still opening is newer than anything on disk and stays
    const stones = ((await deps.db.queryAsync('SELECT libraryID, key, ts FROM deletions')) ?? []) as { libraryID: unknown; key: unknown; ts: unknown }[];
    for (const row of stones) {
      const id = opKey(Number(row.libraryID), String(row.key));
      if (!tombstones.has(id)) tombstones.set(id, Number(row.ts));
    }

    state = 'open';
    // Saves that arrived while the database was opening go out now
    void pump();
    return alive;
  }

  return {
    open: async () => {
      try {
        return await open();
      } catch (e) {
        state = 'failed';
        lastError = String(e);
        throw e;
      }
    },
    loadShared: async () => {
      const documents: DocumentRow[] = [];
      const rows = ((await deps.db.queryAsync('SELECT libraryID, key, documentId, publicationId, identifiedAt FROM documents')) ?? []) as Record<string, unknown>[];
      for (const row of rows) {
        documents.push({
          lib: Number(row.libraryID),
          key: String(row.key),
          documentId: String(row.documentId),
          publicationId: typeof row.publicationId === 'string' ? row.publicationId : null,
          identifiedAt: Number(row.identifiedAt) || 0,
        });
      }
      const positions: SharedItem[] = [];
      const items = ((await deps.db.queryAsync(
        'SELECT documentId, format, publicationId, locator, anchorExact, anchorPrefix, anchorSuffix, stampAt, stampDevice FROM document_positions',
      )) ?? []) as Record<string, unknown>[];
      for (const row of items) {
        positions.push({
          id: String(row.documentId),
          format: String(row.format),
          publicationId: typeof row.publicationId === 'string' ? row.publicationId : null,
          locator: String(row.locator),
          anchor: { exact: String(row.anchorExact ?? ''), prefix: String(row.anchorPrefix ?? ''), suffix: String(row.anchorSuffix ?? '') },
          stamp: { at: Number(row.stampAt) || 0, device: String(row.stampDevice ?? '') },
        });
      }
      return { documents, positions };
    },
    save: (entry) => {
      if (state === 'closed') return; // the tick that lost the race with shutdown
      queue.set(opKey(entry.lib, entry.key), { kind: 'put', entry });
      void pump();
    },
    saveDocument: (row) => {
      if (state === 'closed') return;
      queue.set('document:' + opKey(row.lib, row.key), { kind: 'document', row });
      void pump();
    },
    saveSharedPosition: (item) => {
      if (state === 'closed') return;
      queue.set('shared:' + item.id, { kind: 'shared', item });
      void pump();
    },
    remove: (lib, key, deletedAt) => {
      if (state === 'closed') return;
      queue.set(opKey(lib, key), { kind: 'remove', lib, key });
      if (deletedAt !== undefined) {
        tombstones.set(opKey(lib, key), deletedAt);
        queue.set('tombstone:' + opKey(lib, key), { kind: 'tombstone', lib, key, ts: deletedAt });
      }
      void pump();
    },
    deletedAt: (lib, key) => tombstones.get(opKey(lib, key)) ?? null,
    retry: () => {
      void pump();
    },
    drain: async () => {
      if (pumping) await pumping;
      if (state !== 'open' || queue.size === 0) return;
      await pump(true);
    },
    close: async () => {
      if (state === 'closed') return;
      state = 'closed';
      try {
        await deps.db.closeDatabase(true);
      } catch (e) {
        report(e);
      }
    },
    stats: () => ({
      state,
      schemaVersion,
      imported,
      swept,
      loaded,
      queued: queue.size,
      writing: pumping !== null,
      lastError,
      deletions: tombstones.size,
    }),
  };
}
