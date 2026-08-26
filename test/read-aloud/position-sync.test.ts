import { describe, expect, it } from 'vitest';
import type { PrefsBackend } from '../../src/core/settings';
import { createPositionSync, TICK_MS, WRITE_THROTTLE_MS, type PositionSyncDeps } from '../../src/read-aloud/position-sync';
import { READ_ALOUD_POSITIONS_PREF, readPositions } from '../../src/read-aloud/read-aloud-position';

const PDF_POS = { pageIndex: 12, rects: [[10, 20, 30, 40]] };
const LATER_POS = { pageIndex: 13, rects: [[10, 20, 30, 40]] };

/** A reader as the sampler sees it: an attachment, a manager, a saved position. */
interface FakeReader {
  lib: number;
  key: string;
  active: boolean;
  saved: unknown;
}

const reader = (over: Partial<FakeReader> = {}): FakeReader => ({ lib: 1, key: 'ABCD1234', active: true, saved: PDF_POS, ...over });

function harness(readers: FakeReader[], over: Partial<PositionSyncDeps> = {}) {
  const store: Record<string, unknown> = {};
  const prefs: PrefsBackend = { get: (k) => store[k], set: (k, v) => void (store[k] = v) };
  const errors: unknown[] = [];
  let clock = 0;
  const timers: { fn: () => void; at: number; handle: number }[] = [];
  let nextHandle = 1;

  const deps: PositionSyncDeps = {
    prefs,
    readers: () => readers,
    attachmentOf: (r) => {
      const f = r as FakeReader;
      return f.key ? { lib: f.lib, key: f.key } : null;
    },
    managerOf: (r) => ({ active: (r as FakeReader).active }),
    savedPositionOf: (r) => (r as FakeReader).saved,
    setTimeout: (fn, ms) => {
      const handle = nextHandle++;
      timers.push({ fn, at: clock + ms, handle });
      return handle;
    },
    clearTimeout: (handle) => {
      const i = timers.findIndex((t) => t.handle === handle);
      if (i >= 0) timers.splice(i, 1);
    },
    now: () => clock,
    error: (e) => void errors.push(e),
    ...over,
  };

  /** Advance the clock, firing every timer that comes due. */
  const advance = (ms: number) => {
    const target = clock + ms;
    for (;;) {
      const due = timers.filter((t) => t.at <= target).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      timers.splice(timers.indexOf(due), 1);
      clock = due.at;
      due.fn();
    }
    clock = target;
  };

  return { sync: createPositionSync(deps), store, prefs, errors, advance, timers };
}

describe('createPositionSync', () => {
  it('records the saved position of an active reader', () => {
    const h = harness([reader()]);
    h.sync.sample();
    h.sync.flush();
    expect(readPositions(h.prefs)).toEqual([{ lib: 1, key: 'ABCD1234', pos: PDF_POS, ts: 0 }]);
  });

  it('ignores a reader whose session is not active', () => {
    const h = harness([reader({ active: false })]);
    h.sync.sample();
    h.sync.flush();
    expect(readPositions(h.prefs)).toEqual([]);
  });

  it('ignores a null saved position', () => {
    const h = harness([reader({ saved: null })]);
    h.sync.sample();
    h.sync.flush();
    expect(readPositions(h.prefs)).toEqual([]);
  });

  it('ignores a reader with no attachment', () => {
    const h = harness([reader({ key: '' })]);
    h.sync.sample();
    h.sync.flush();
    expect(readPositions(h.prefs)).toEqual([]);
  });

  it('writes at most once per throttle window while ticking', () => {
    const readers = [reader()];
    const h = harness(readers);
    h.sync.start();
    h.advance(TICK_MS);
    const afterFirst = h.store[READ_ALOUD_POSITIONS_PREF];
    readers[0].saved = LATER_POS;
    h.advance(TICK_MS);
    expect(h.store[READ_ALOUD_POSITIONS_PREF]).toBe(afterFirst);
    h.advance(WRITE_THROTTLE_MS);
    expect(readPositions(h.prefs)[0].pos).toEqual(LATER_POS);
  });

  it('flush() bypasses the throttle', () => {
    const h = harness([reader()]);
    h.sync.start();
    h.sync.sample();
    expect(h.store[READ_ALOUD_POSITIONS_PREF]).toBeUndefined();
    h.sync.flush();
    expect(readPositions(h.prefs)).toHaveLength(1);
  });

  it('stop() flushes what is pending and stops ticking', () => {
    const h = harness([reader()]);
    h.sync.start();
    h.sync.sample();
    h.sync.stop();
    expect(readPositions(h.prefs)).toHaveLength(1);
    expect(h.timers).toHaveLength(0);
    h.advance(TICK_MS * 3);
    expect(h.timers).toHaveLength(0);
  });

  it('keeps ticking until stopped', () => {
    const h = harness([reader()]);
    h.sync.start();
    h.advance(TICK_MS * 3);
    expect(h.timers).toHaveLength(1);
  });

  it('reports a broken reader and keeps going', () => {
    const h = harness([reader({ key: 'BAD' }), reader({ key: 'GOOD' })], {
      savedPositionOf: (r) => {
        if ((r as FakeReader).key === 'BAD') throw new Error('compartment');
        return (r as FakeReader).saved;
      },
    });
    h.sync.sample();
    h.sync.flush();
    expect(h.errors).toHaveLength(1);
    expect(readPositions(h.prefs).map((e) => e.key)).toEqual(['GOOD']);
  });

  it('does not rewrite an unchanged position', () => {
    const h = harness([reader()]);
    h.sync.sample();
    h.sync.flush();
    const first = h.store[READ_ALOUD_POSITIONS_PREF];
    h.store[READ_ALOUD_POSITIONS_PREF] = 'clobbered';
    h.sync.sample();
    h.sync.flush();
    expect(h.store[READ_ALOUD_POSITIONS_PREF]).toBe('clobbered');
    expect(first).toBeTypeOf('string');
  });

  it('starts from what the pref already holds', () => {
    const store: Record<string, unknown> = {
      [READ_ALOUD_POSITIONS_PREF]: JSON.stringify({ v: 1, items: [{ lib: 1, key: 'OLD', pos: PDF_POS, ts: 5 }] }),
    };
    const fresh = createPositionSync({
      prefs: { get: (k) => store[k], set: (k, v) => void (store[k] = v) },
      readers: () => [],
      attachmentOf: () => ({ lib: 1, key: 'OLD' }),
      managerOf: () => null,
      savedPositionOf: () => null,
      setTimeout: () => 0,
      clearTimeout: () => {},
      now: () => 0,
      error: () => {},
    });
    expect(fresh.lookup({})).toEqual(PDF_POS);
  });

  it('lookup() returns null for an attachment with nothing stored', () => {
    const h = harness([reader()]);
    h.sync.sample();
    expect(h.sync.lookup(reader())).toEqual(PDF_POS);
    expect(h.sync.lookup(reader({ key: 'OTHER' }))).toBeNull();
  });
});
