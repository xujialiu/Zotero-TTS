import { describe, expect, it } from 'vitest';
import type { PrefsBackend } from '../../src/core/settings';
import {
  createPositionSync,
  IDLE_TICK_MS,
  ACTIVE_TICK_MS,
  WRITE_THROTTLE_MS,
  type PositionSyncDeps,
} from '../../src/read-aloud/position-sync';
import { READ_ALOUD_POSITIONS_PREF, readPositions } from '../../src/read-aloud/read-aloud-position';

const PDF_POS = { pageIndex: 12, rects: [[10, 20, 30, 40]] };
const LATER_POS = { pageIndex: 13, rects: [[10, 20, 30, 40]] };

/** A reader as the sampler sees it: an attachment, a manager, a saved position. */
interface FakeReader {
  lib: number;
  key: string;
  active: boolean;
  paused: boolean;
  saved: unknown;
}

const reader = (over: Partial<FakeReader> = {}): FakeReader => ({
  lib: 1,
  key: 'ABCD1234',
  active: true,
  paused: false,
  saved: PDF_POS,
  ...over,
});

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
    managerOf: (r) => ({ active: (r as FakeReader).active, paused: (r as FakeReader).paused }),
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

  /** How long the next tick is scheduled for, so the cadence can be asserted. */
  const nextDelay = () => (timers.length ? timers[0].at - clock : null);

  return { sync: createPositionSync(deps), store, prefs, errors, advance, timers, nextDelay };
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
    h.advance(IDLE_TICK_MS);
    expect(h.store[READ_ALOUD_POSITIONS_PREF]).toBeUndefined();
    readers[0].saved = LATER_POS;
    h.advance(ACTIVE_TICK_MS);
    expect(h.store[READ_ALOUD_POSITIONS_PREF]).toBeUndefined();
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
    h.advance(IDLE_TICK_MS * 3);
    expect(h.timers).toHaveLength(0);
  });

  it('keeps ticking until stopped', () => {
    const h = harness([reader()]);
    h.sync.start();
    h.advance(IDLE_TICK_MS * 3);
    expect(h.timers).toHaveLength(1);
  });

  it('polls fast while a session is open — paused included — and slowly otherwise', () => {
    const readers = [reader()];
    const h = harness(readers);
    h.sync.start();
    // Nothing observed yet, so the first tick is the cheap one
    expect(h.nextDelay()).toBe(IDLE_TICK_MS);
    h.advance(IDLE_TICK_MS);
    expect(h.nextDelay()).toBe(ACTIVE_TICK_MS);
    // Paused still moves the position: the arrow keys skip without playing
    readers[0].paused = true;
    h.advance(ACTIVE_TICK_MS);
    expect(h.nextDelay()).toBe(ACTIVE_TICK_MS);
    // Popup closed: nothing can move any more
    readers[0].active = false;
    h.advance(ACTIVE_TICK_MS);
    expect(h.nextDelay()).toBe(IDLE_TICK_MS);
  });

  it('catches a sentence change within one speaking tick', () => {
    const readers = [reader()];
    const h = harness(readers);
    h.sync.start();
    h.advance(IDLE_TICK_MS);
    readers[0].saved = LATER_POS;
    h.advance(ACTIVE_TICK_MS);
    expect(h.sync.lookup(reader())).toEqual(LATER_POS);
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

  it('stores a copy, not the object it read from the reader', () => {
    // The reader's own object dies with its tab; keeping the reference is
    // what made every later touch throw "can't access dead object"
    const source = { type: 'FragmentSelector', value: 'epubcfi(/6/16!/4/4/152)' };
    const h = harness([reader({ saved: source })]);
    h.sync.sample();
    expect(h.sync.lookup(reader())).toEqual(source);
    expect(h.sync.lookup(reader())).not.toBe(source);
  });

  it('skips a position it cannot copy, and reports it', () => {
    const dead = {
      get value(): string {
        throw new TypeError("can't access dead object");
      },
    };
    const h = harness([reader({ saved: dead })]);
    h.sync.sample();
    h.sync.flush();
    expect(readPositions(h.prefs)).toEqual([]);
    expect(h.errors).toHaveLength(1);
  });

  it('flushes as soon as a reader it was tracking is gone', () => {
    const readers = [reader()];
    const h = harness(readers);
    h.sync.start();
    h.advance(IDLE_TICK_MS);
    // Recorded, but still inside the throttle window
    expect(h.store[READ_ALOUD_POSITIONS_PREF]).toBeUndefined();
    readers.length = 0; // the tab was closed
    h.advance(ACTIVE_TICK_MS);
    expect(readPositions(h.prefs)[0].key).toBe('ABCD1234');
  });

  it('keeps ticking after a pass throws', () => {
    let broken = true;
    const h = harness([], {
      readers: () => {
        if (!broken) return [];
        broken = false;
        // What a torn-down window can look like: even iterating throws
        return {
          [Symbol.iterator]() {
            throw new TypeError("can't access dead object");
          },
        } as unknown as unknown[];
      },
    });
    h.sync.start();
    h.advance(IDLE_TICK_MS);
    expect(h.errors).toHaveLength(1);
    expect(h.timers).toHaveLength(1);
  });

  // The unload hook: one last read while the closing reader is still alive,
  // written out at once — the fix for resuming one sentence early when the
  // tab closed inside the tick window (notes/NOTES.md 2026-08-26)
  it('captureClose() records the closing reader at once, past the throttle', () => {
    const readers = [reader()];
    const h = harness(readers);
    h.sync.start();
    h.advance(IDLE_TICK_MS);
    // The sentence changed after the last tick — exactly the race
    readers[0].saved = LATER_POS;
    h.sync.captureClose(readers[0]);
    expect(readPositions(h.prefs)[0].pos).toEqual(LATER_POS);
  });

  it('captureClose() writes what was already pending even if the final read fails', () => {
    const readers = [reader()];
    const h = harness(readers);
    h.sync.start();
    h.advance(IDLE_TICK_MS);
    expect(h.store[READ_ALOUD_POSITIONS_PREF]).toBeUndefined();
    h.sync.captureClose({ dead: true });
    expect(readPositions(h.prefs)[0].pos).toEqual(PDF_POS);
  });

  it('captureClose() on a reader that never played stores nothing', () => {
    const h = harness([reader({ active: false })]);
    h.sync.captureClose(reader({ active: false }));
    expect(readPositions(h.prefs)).toEqual([]);
  });

  // Ticks read only open sessions: what a deactivated reader's state does
  // afterwards is teardown noise, not listening (2026-08-26: Zotero's own
  // savedPosition regressed a sentence during tab teardown, and a periodic
  // read faithfully copied the regression over the correct value)
  it('stops following a reader once its session closed', () => {
    const readers = [reader()];
    const h = harness(readers);
    h.sync.start();
    h.advance(IDLE_TICK_MS);
    readers[0].active = false;
    readers[0].saved = LATER_POS;
    h.advance(IDLE_TICK_MS * 3);
    expect(h.sync.lookup(reader())).toEqual(PDF_POS);
  });

  // The popup was closed (savedPosition frozen at the final sentence) and
  // the tab closed later: the uninit capture must still read the frozen value
  it('captureClose() reads a deactivated reader that played this session', () => {
    const readers = [reader()];
    const h = harness(readers);
    h.sync.start();
    h.advance(IDLE_TICK_MS);
    readers[0].active = false;
    readers[0].saved = LATER_POS;
    h.sync.captureClose(readers[0]);
    expect(readPositions(h.prefs)[0].pos).toEqual(LATER_POS);
  });

  // The incident: after the capture, the closed reader lingered in _readers
  // with a savedPosition that had regressed — it must not be copied
  it('freezes an attachment after captureClose() until it plays again', () => {
    const readers = [reader()];
    const h = harness(readers);
    h.sync.start();
    h.advance(IDLE_TICK_MS);
    readers[0].active = false;
    h.sync.captureClose(readers[0]);
    readers[0].saved = LATER_POS; // teardown noise on the lingering reader
    h.advance(IDLE_TICK_MS * 3);
    expect(h.sync.lookup(reader())).toEqual(PDF_POS);
    // Played again (the tab was reopened): recording resumes
    readers[0].active = true;
    readers[0].saved = LATER_POS;
    h.advance(IDLE_TICK_MS);
    expect(h.sync.lookup(reader())).toEqual(LATER_POS);
  });

  it('still never imports from a reader that has not played this session', () => {
    const readers = [reader({ active: false })];
    const h = harness(readers);
    h.sync.start();
    h.advance(IDLE_TICK_MS * 2);
    expect(h.sync.lookup(reader())).toBeNull();
  });

  it('stop() takes a last look before writing', () => {
    const readers = [reader()];
    const h = harness(readers);
    h.sync.start();
    h.advance(IDLE_TICK_MS);
    readers[0].saved = LATER_POS;
    h.sync.stop();
    expect(readPositions(h.prefs)[0].pos).toEqual(LATER_POS);
  });

  it('stop() still reads a deactivated reader that played this session', () => {
    const readers = [reader()];
    const h = harness(readers);
    h.sync.start();
    h.advance(IDLE_TICK_MS);
    readers[0].active = false;
    readers[0].saved = LATER_POS;
    h.sync.stop();
    expect(readPositions(h.prefs)[0].pos).toEqual(LATER_POS);
  });

  it('lookup() returns null for an attachment with nothing stored', () => {
    const h = harness([reader()]);
    h.sync.sample();
    expect(h.sync.lookup(reader())).toEqual(PDF_POS);
    expect(h.sync.lookup(reader({ key: 'OTHER' }))).toBeNull();
  });
});
