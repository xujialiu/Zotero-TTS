import { normalizePosition, type PositionEntry } from './read-aloud-position';

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
 * The connection MUST be closed permanently at shutdown: Gecko's
 * Sqlite.sys.mjs blocks `profile-before-change` on every open connection,
 * so a leaked one turns quitting Zotero into a 60-second AsyncShutdown hang
 * and a crash report. After the close, a late tick's save is swallowed —
 * any write would throw "Database permanently closed".
 */

export const SCHEMA_VERSION = 1;

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
}

export interface PositionStore {
  /**
   * Migrate the schema, import the old pref store, sweep orphaned rows,
   * and return every surviving row. Rejects when the database cannot be
   * opened — the caller keeps the sampler running in memory and reports.
   */
  open(): Promise<PositionEntry[]>;
  /** Queue one row write; coalesced per attachment, safe before open and after close. */
  save(entry: PositionEntry): void;
  /** Queue one row's removal — permanent item deletion; same queue, last op per attachment wins. */
  remove(lib: number, key: string): void;
  /** Retry a failed flush; a no-op while healthy, gated to one attempt per RETRY_MS. */
  retry(): void;
  /** One forced flush of whatever is queued — no retry loop; the caller bounds the wait. */
  drain(): Promise<void>;
  /** Close the connection for good; whatever still cannot be written is dropped. */
  close(): Promise<void>;
  stats(): PositionStoreStats;
}

type Op = { kind: 'put'; entry: PositionEntry } | { kind: 'remove'; lib: number; key: string };

export function createPositionStore(deps: PositionStoreDeps): PositionStore {
  let state: PositionStoreStats['state'] = 'new';
  let schemaVersion: number | null = null;
  let imported: number | null = null;
  let swept: number | null = null;
  let loaded: number | null = null;
  let lastError: string | null = null;
  let lastFailureAt = 0;
  /** Pending ops by `lib/key`, last op per attachment wins; Map order is arrival order. */
  const queue = new Map<string, Op>();
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
        } else {
          await deps.db.queryAsync('DELETE FROM positions WHERE libraryID = ? AND key = ?', [op.lib, op.key]);
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
    // Schema, keyed off PRAGMA user_version; 0 is a fresh file
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
    const dead: { lib: number; key: string }[] = [];
    for (const row of rows) {
      const lib = Number(row.libraryID);
      const key = String(row.key);
      let keep = true;
      if (!checksBroken) {
        try {
          keep = deps.libraryExists(lib) && deps.itemExists(lib, key);
        } catch (e) {
          checksBroken = true;
          keep = true;
          report(e);
        }
      }
      if (!keep) {
        dead.push({ lib, key });
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
        }
      });
    }
    swept = dead.length;
    loaded = alive.length;

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
    save: (entry) => {
      if (state === 'closed') return; // the tick that lost the race with shutdown
      queue.set(opKey(entry.lib, entry.key), { kind: 'put', entry });
      void pump();
    },
    remove: (lib, key) => {
      if (state === 'closed') return;
      queue.set(opKey(lib, key), { kind: 'remove', lib, key });
      void pump();
    },
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
    }),
  };
}
