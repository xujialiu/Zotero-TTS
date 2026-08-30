import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import {
  createPositionStore,
  RETRY_MS,
  SCHEMA_VERSION,
  type PositionDatabase,
  type PositionStoreDeps,
} from '../../src/read-aloud/position-store';
import type { PositionEntry } from '../../src/read-aloud/read-aloud-position';

// The tests run the store's real SQL against real SQLite — Node's built-in
// engine behind the same interface Zotero.DBConnection presents — so the
// schema, the REPLACE semantics and the user_version migration are what is
// verified, not a count of calls.

const FAT_PDF = { pageIndex: 7, rects: Array.from({ length: 500 }, (_, i) => [i, i, i + 1, i + 1]) };
const PDF_POINT = { pageIndex: 7, rects: [[0.5, 0.5, 0.5, 0.5]] };
const CFI = { type: 'FragmentSelector', value: 'epubcfi(/6/34!/4/2/4/2/4/1,:0,:94)' };

const entry = (over: Partial<PositionEntry> = {}): PositionEntry => ({
  lib: 1,
  key: 'ABCD1234',
  pos: PDF_POINT,
  ts: 100,
  ...over,
});

/**
 * Zotero.DBConnection's face, over node:sqlite. Mimics the quirks that
 * matter: `valueQueryAsync` returns false (not null) when there is no row,
 * and `executeTransaction` takes an async closure over the same connection.
 */
function fakeDB(raw = new DatabaseSync(':memory:')) {
  let failing: string | null = null;
  let closed = false;
  // Test hook: resolves before COMMIT so a save can arrive mid-flight
  let holdTransaction: Promise<void> | null = null;
  const run = (sql: string, params: unknown[]): unknown[] | undefined => {
    if (closed) throw new Error('Database permanently closed');
    if (failing) throw new Error(failing);
    if (/^\s*(SELECT|PRAGMA\s+\w+\s*$)/i.test(sql)) {
      return raw.prepare(sql).all(...(params as never[])) as unknown[];
    }
    if (params.length) raw.prepare(sql).run(...(params as never[]));
    else raw.exec(sql);
    return undefined;
  };
  const db: PositionDatabase = {
    queryAsync: async (sql, params = []) => run(sql, params),
    valueQueryAsync: async (sql, params = []) => {
      const rows = run(sql, params) ?? [];
      const first = rows[0] as Record<string, unknown> | undefined;
      if (first === undefined) return false;
      return Object.values(first)[0];
    },
    executeTransaction: async <T>(fn: () => Promise<T>): Promise<T> => {
      if (closed) throw new Error('Database permanently closed');
      if (failing) throw new Error(failing);
      raw.exec('BEGIN');
      try {
        const result = await fn();
        if (holdTransaction) await holdTransaction;
        // Re-checked at commit so a failure can be injected into a
        // transaction that is already holding — the re-queue-order tests
        if (failing) throw new Error(failing);
        raw.exec('COMMIT');
        return result;
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
    closeDatabase: async (permanent) => {
      expect(permanent).toBe(true);
      closed = true;
    },
  };
  return {
    db,
    raw,
    rows: () => raw.prepare('SELECT libraryID, key, pos, ts FROM positions ORDER BY key').all() as { libraryID: number; key: string; pos: string; ts: number }[],
    userVersion: () => Number((raw.prepare('PRAGMA user_version').get() as { user_version: number }).user_version),
    fail: (message: string | null) => void (failing = message),
    hold: (promise: Promise<void> | null) => void (holdTransaction = promise),
    isClosed: () => closed,
  };
}

function harness(over: Partial<PositionStoreDeps> = {}, legacyEntries: PositionEntry[] = []) {
  const fake = fakeDB();
  const errors: unknown[] = [];
  let cleared = 0;
  let clock = 0;
  const deps: PositionStoreDeps = {
    db: fake.db,
    legacy: {
      read: () => legacyEntries,
      clear: () => void cleared++,
    },
    itemExists: () => true,
    libraryExists: () => true,
    now: () => clock,
    error: (e) => void errors.push(e),
    ...over,
  };
  const store = createPositionStore(deps);
  return {
    store,
    fake,
    errors,
    clearedCount: () => cleared,
    tick: (ms: number) => void (clock += ms),
  };
}

/** Let the queued microtask flush settle without touching real timers. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createPositionStore', () => {
  it('open() creates the schema and stamps user_version on a fresh database', async () => {
    const h = harness();
    await h.store.open();
    expect(h.fake.userVersion()).toBe(SCHEMA_VERSION);
    expect(h.fake.rows()).toEqual([]);
  });

  it('open() on an already-migrated database changes nothing', async () => {
    const first = harness();
    await first.store.open();
    first.fake.raw.prepare('REPLACE INTO positions (libraryID, key, pos, ts) VALUES (?, ?, ?, ?)').run(1, 'KEEP0000', JSON.stringify(CFI), 5);
    // The same file opened by a second store — an in-place plugin upgrade
    const again = fakeDB(first.fake.raw);
    const h = harness({ db: again.db });
    const loaded = await h.store.open();
    expect(again.userVersion()).toBe(SCHEMA_VERSION);
    expect(loaded).toEqual([{ lib: 1, key: 'KEEP0000', pos: CFI, ts: 5 }]);
  });

  it('open() imports the pref store, normalized on the way in, then clears the pref', async () => {
    const h = harness({}, [entry({ key: 'FATPDF00', pos: FAT_PDF, ts: 5 }), entry({ key: 'EPUB0000', pos: CFI, ts: 4 })]);
    const loaded = await h.store.open();
    expect(h.fake.rows()).toEqual([
      { libraryID: 1, key: 'EPUB0000', pos: JSON.stringify(CFI), ts: 4 },
      { libraryID: 1, key: 'FATPDF00', pos: JSON.stringify(PDF_POINT), ts: 5 },
    ]);
    expect(loaded.map((e) => e.key).sort()).toEqual(['EPUB0000', 'FATPDF00']);
    expect(h.clearedCount()).toBe(1);
  });

  it('open() clears an empty pref too — garbage read as no entries has nothing to lose', async () => {
    const h = harness({}, []);
    await h.store.open();
    expect(h.clearedCount()).toBe(1);
  });

  it('a failed import keeps the pref so the next start retries', async () => {
    const h = harness({}, [entry()]);
    h.fake.fail('disk I/O error');
    await expect(h.store.open()).rejects.toThrow('disk I/O error');
    expect(h.clearedCount()).toBe(0);
    expect(h.store.stats().state).toBe('failed');
  });

  it('open() sweeps rows for attachments and libraries that no longer exist', async () => {
    const first = harness();
    await first.store.open();
    const put = first.fake.raw.prepare('REPLACE INTO positions (libraryID, key, pos, ts) VALUES (?, ?, ?, ?)');
    put.run(1, 'ALIVE000', JSON.stringify(CFI), 1);
    put.run(1, 'GONE0000', JSON.stringify(CFI), 2);
    put.run(9, 'DEADLIB0', JSON.stringify(CFI), 3);
    const again = fakeDB(first.fake.raw);
    const h = harness({
      db: again.db,
      itemExists: (_lib, key) => key === 'ALIVE000',
      libraryExists: (lib) => lib === 1,
    });
    const loaded = await h.store.open();
    expect(loaded).toEqual([{ lib: 1, key: 'ALIVE000', pos: CFI, ts: 1 }]);
    expect(again.rows().map((r) => r.key)).toEqual(['ALIVE000']);
    expect(h.store.stats().swept).toBe(2);
  });

  it('imported rows are swept in the same open() — import runs first', async () => {
    const h = harness({ itemExists: (_lib, key) => key !== 'DELETED0' }, [entry({ key: 'DELETED0' }), entry({ key: 'ALIVE000' })]);
    const loaded = await h.store.open();
    expect(loaded.map((e) => e.key)).toEqual(['ALIVE000']);
    expect(h.clearedCount()).toBe(1);
  });

  it('a sweep check that throws keeps the row — never delete on an error', async () => {
    const h = harness(
      {
        itemExists: () => {
          throw new Error('Items not loaded');
        },
      },
      [entry()],
    );
    const loaded = await h.store.open();
    expect(loaded).toHaveLength(1);
    expect(h.errors.length).toBeGreaterThan(0);
  });

  it('a row whose pos does not parse is reported and skipped, not fatal', async () => {
    const first = harness();
    await first.store.open();
    const put = first.fake.raw.prepare('REPLACE INTO positions (libraryID, key, pos, ts) VALUES (?, ?, ?, ?)');
    put.run(1, 'BROKEN00', '{not json', 1);
    put.run(1, 'GOOD0000', JSON.stringify(CFI), 2);
    const again = fakeDB(first.fake.raw);
    const h = harness({ db: again.db });
    const loaded = await h.store.open();
    expect(loaded).toEqual([{ lib: 1, key: 'GOOD0000', pos: CFI, ts: 2 }]);
    expect(h.errors).toHaveLength(1);
  });

  it('save() writes one row through the queue', async () => {
    const h = harness();
    await h.store.open();
    h.store.save(entry({ pos: CFI }));
    await h.store.drain();
    expect(h.fake.rows()).toEqual([{ libraryID: 1, key: 'ABCD1234', pos: JSON.stringify(CFI), ts: 100 }]);
  });

  it('saves queued while a write is in flight coalesce into the next batch', async () => {
    const h = harness();
    await h.store.open();
    let release!: () => void;
    h.fake.hold(new Promise((resolve) => (release = resolve)));
    h.store.save(entry({ ts: 1 }));
    await settle();
    // First write is holding its transaction open; these arrive meanwhile
    h.store.save(entry({ ts: 2, pos: CFI }));
    h.store.save(entry({ key: 'OTHER000', ts: 3, pos: CFI }));
    h.fake.hold(null);
    release();
    await h.store.drain();
    expect(h.fake.rows()).toEqual([
      { libraryID: 1, key: 'ABCD1234', pos: JSON.stringify(CFI), ts: 2 },
      { libraryID: 1, key: 'OTHER000', pos: JSON.stringify(CFI), ts: 3 },
    ]);
  });

  it('remove() deletes the row, and the last op per attachment wins', async () => {
    const h = harness();
    await h.store.open();
    h.store.save(entry());
    await h.store.drain();
    h.store.save(entry({ key: 'STAYS000' }));
    h.store.remove(1, 'STAYS000');
    h.store.save(entry({ key: 'STAYS000', pos: CFI, ts: 9 }));
    h.store.remove(1, 'ABCD1234');
    await h.store.drain();
    expect(h.fake.rows()).toEqual([{ libraryID: 1, key: 'STAYS000', pos: JSON.stringify(CFI), ts: 9 }]);
  });

  it('a failed write keeps its entries queued and retries once per window', async () => {
    const h = harness();
    await h.store.open();
    h.fake.fail('database is locked');
    h.store.save(entry());
    await settle();
    expect(h.errors).toHaveLength(1);
    expect(h.store.stats().queued).toBe(1);
    // Nudges inside the window must not hammer the failing database
    h.store.retry();
    h.store.retry();
    await settle();
    expect(h.errors).toHaveLength(1);
    // The window passes, the disk recovers, the nudge lands the write
    h.tick(RETRY_MS);
    h.fake.fail(null);
    h.store.retry();
    await h.store.drain();
    expect(h.fake.rows().map((r) => r.key)).toEqual(['ABCD1234']);
    expect(h.store.stats().queued).toBe(0);
    expect(h.store.stats().lastError).toBeNull();
  });

  it('a save arriving after a failure does not bypass the retry window', async () => {
    const h = harness();
    await h.store.open();
    h.fake.fail('database is locked');
    h.store.save(entry({ ts: 1 }));
    await settle();
    expect(h.errors).toHaveLength(1);
    h.store.save(entry({ ts: 2 }));
    await settle();
    expect(h.errors).toHaveLength(1);
    expect(h.store.stats().queued).toBe(1);
  });

  it('a newer op is not clobbered when the failed batch is re-queued', async () => {
    const h = harness();
    await h.store.open();
    let release!: () => void;
    h.fake.hold(new Promise((resolve) => (release = resolve)));
    h.store.save(entry({ ts: 1 }));
    await settle();
    // While ts:1 is in flight the attachment is deleted; then the write fails
    h.store.remove(1, 'ABCD1234');
    h.fake.fail('database is locked');
    h.fake.hold(null);
    release();
    await settle();
    h.tick(RETRY_MS);
    h.fake.fail(null);
    h.store.retry();
    await h.store.drain();
    // The delete, being newer, must win over the re-queued save
    expect(h.fake.rows()).toEqual([]);
  });

  it('save() before open() waits for the database and lands after it', async () => {
    const h = harness();
    h.store.save(entry({ pos: CFI }));
    await settle();
    expect(h.errors).toEqual([]);
    await h.store.open();
    await h.store.drain();
    expect(h.fake.rows().map((r) => r.key)).toEqual(['ABCD1234']);
  });

  it('drain() makes one forced attempt on a failing database and gives up', async () => {
    const h = harness();
    await h.store.open();
    h.fake.fail('database is locked');
    h.store.save(entry());
    await settle();
    const before = h.errors.length;
    await h.store.drain();
    expect(h.errors.length).toBe(before + 1);
    expect(h.store.stats().queued).toBe(1);
  });

  it('drain() forces its attempt past the retry window', async () => {
    const h = harness();
    await h.store.open();
    h.fake.fail('database is locked');
    h.store.save(entry());
    await settle();
    h.fake.fail(null);
    // Still inside the window — a nudge would be gated, the final flush is not
    await h.store.drain();
    expect(h.fake.rows().map((r) => r.key)).toEqual(['ABCD1234']);
  });

  it('close() closes permanently and swallows anything arriving after', async () => {
    const h = harness();
    await h.store.open();
    h.store.save(entry());
    await h.store.drain();
    await h.store.close();
    expect(h.fake.isClosed()).toBe(true);
    // The tick that lost the race with shutdown: silent, by design
    h.store.save(entry({ ts: 2 }));
    h.store.remove(1, 'ABCD1234');
    h.store.retry();
    await expect(h.store.drain()).resolves.toBeUndefined();
    expect(h.errors).toEqual([]);
    expect(h.store.stats().state).toBe('closed');
  });

  it('open() failure leaves save() harmless and stats() honest', async () => {
    const h = harness();
    h.fake.fail('malformed database schema');
    await expect(h.store.open()).rejects.toThrow();
    h.fake.fail(null);
    h.store.save(entry());
    await settle();
    const stats = h.store.stats();
    expect(stats.state).toBe('failed');
    expect(stats.queued).toBe(1);
    await expect(h.store.drain()).resolves.toBeUndefined();
    await expect(h.store.close()).resolves.toBeUndefined();
  });

  it('stats() carries the counts the live verification reads', async () => {
    const h = harness({}, [entry({ key: 'IMPORTED' })]);
    expect(h.store.stats().state).toBe('new');
    await h.store.open();
    const stats = h.store.stats();
    expect(stats).toMatchObject({
      state: 'open',
      schemaVersion: SCHEMA_VERSION,
      imported: 1,
      swept: 0,
      loaded: 1,
      queued: 0,
      writing: false,
      lastError: null,
    });
  });
});
