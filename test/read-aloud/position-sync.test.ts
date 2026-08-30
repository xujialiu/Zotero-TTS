import { describe, expect, it } from 'vitest';
import {
  createPositionSync,
  IDLE_TICK_MS,
  ACTIVE_TICK_MS,
  type PositionSyncDeps,
} from '../../src/read-aloud/position-sync';
import type { PositionEntry } from '../../src/read-aloud/read-aloud-position';

// What the reader hands out (the full merged-line rect list) and what the
// store keeps (the center of the first rect — the only part resume reads,
// normalized on the way in per #14)
const PDF_POS = { pageIndex: 12, rects: [[10, 20, 30, 40]] };
const PDF_POINT = { pageIndex: 12, rects: [[20, 30, 20, 30]] };
const LATER_POS = { pageIndex: 13, rects: [[10, 20, 30, 40]] };
const LATER_POINT = { pageIndex: 13, rects: [[20, 30, 20, 30]] };

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

function harness(readers: FakeReader[], over: Partial<PositionSyncDeps> = {}, initial: PositionEntry[] = []) {
  const saved: PositionEntry[] = [];
  const errors: unknown[] = [];
  let retries = 0;
  let clock = 0;
  const timers: { fn: () => void; at: number; handle: number }[] = [];
  let nextHandle = 1;

  const deps: PositionSyncDeps = {
    initial,
    save: (entry) => void saved.push(entry),
    retryWrites: () => void retries++,
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

  return { sync: createPositionSync(deps), saved, errors, advance, timers, nextDelay, retries: () => retries };
}

describe('createPositionSync', () => {
  it('saves the position of an active reader, normalized to the resume point', () => {
    const h = harness([reader()]);
    h.sync.sample();
    expect(h.saved).toEqual([{ lib: 1, key: 'ABCD1234', pos: PDF_POINT, ts: 0 }]);
  });

  it('ignores a reader whose session is not active', () => {
    const h = harness([reader({ active: false })]);
    h.sync.sample();
    expect(h.saved).toEqual([]);
  });

  it('ignores a null saved position', () => {
    const h = harness([reader({ saved: null })]);
    h.sync.sample();
    expect(h.saved).toEqual([]);
  });

  it('ignores a reader with no attachment', () => {
    const h = harness([reader({ key: '' })]);
    h.sync.sample();
    expect(h.saved).toEqual([]);
  });

  // The pref rewrite needed a throttle; a row write does not (#16). Every
  // changed sentence goes straight into the store's queue — and only
  // changed ones.
  it('saves each sentence change once, as it happens', () => {
    const readers = [reader()];
    const h = harness(readers);
    h.sync.start();
    h.advance(IDLE_TICK_MS);
    expect(h.saved).toHaveLength(1);
    readers[0].saved = LATER_POS;
    h.advance(ACTIVE_TICK_MS);
    expect(h.saved).toHaveLength(2);
    expect(h.saved[1].pos).toEqual(LATER_POINT);
    // Nothing moves, nothing is written
    h.advance(ACTIVE_TICK_MS * 5);
    expect(h.saved).toHaveLength(2);
  });

  it('nudges the store retry on every pass', () => {
    const h = harness([]);
    h.sync.start();
    h.advance(IDLE_TICK_MS * 3);
    expect(h.retries()).toBe(3);
  });

  it('stop() stops ticking', () => {
    const h = harness([reader()]);
    h.sync.start();
    h.sync.stop();
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
    expect(h.sync.lookup(reader())).toEqual(LATER_POINT);
  });

  it('reports a broken reader and keeps going', () => {
    const h = harness([reader({ key: 'BAD' }), reader({ key: 'GOOD' })], {
      savedPositionOf: (r) => {
        if ((r as FakeReader).key === 'BAD') throw new Error('compartment');
        return (r as FakeReader).saved;
      },
    });
    h.sync.sample();
    expect(h.errors).toHaveLength(1);
    expect(h.saved.map((e) => e.key)).toEqual(['GOOD']);
  });

  it('does not save an unchanged position twice', () => {
    const h = harness([reader()]);
    h.sync.sample();
    h.sync.sample();
    expect(h.saved).toHaveLength(1);
  });

  it('starts from the loaded rows', () => {
    const h = harness([], {}, [{ lib: 1, key: 'OLD00000', pos: PDF_POINT, ts: 5 }]);
    expect(h.sync.lookup(reader({ key: 'OLD00000' }))).toEqual(PDF_POINT);
  });

  // Rows from the database are already normal; the legacy-pref fallback
  // (the database failed to open) can carry pre-#14 rect lists
  it('normalizes initial entries on the way in, without writing anything', () => {
    const fat = {
      pageIndex: 7,
      rects: Array.from({ length: 500 }, (_, i) => [i, i, i + 1, i + 1]),
    };
    const h = harness([], {}, [{ lib: 1, key: 'FATPDF00', pos: fat, ts: 5 }]);
    h.sync.start();
    h.advance(IDLE_TICK_MS * 3);
    expect(h.sync.lookup(reader({ key: 'FATPDF00' }))).toEqual({ pageIndex: 7, rects: [[0.5, 0.5, 0.5, 0.5]] });
    expect(h.saved).toEqual([]);
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
    expect(h.saved).toEqual([]);
    expect(h.errors).toHaveLength(1);
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

  // The close hook: one last read while the closing reader is still alive —
  // the fix for resuming one sentence early when the tab closed inside the
  // tick window (notes/NOTES.md 2026-08-26)
  it('captureClose() saves the closing reader at once', () => {
    const readers = [reader()];
    const h = harness(readers);
    h.sync.start();
    h.advance(IDLE_TICK_MS);
    // The sentence changed after the last tick — exactly the race
    readers[0].saved = LATER_POS;
    h.sync.captureClose(readers[0]);
    expect(h.saved[h.saved.length - 1].pos).toEqual(LATER_POINT);
  });

  it('captureClose() on a dead reader loses only the final read', () => {
    const readers = [reader()];
    const h = harness(readers);
    h.sync.start();
    h.advance(IDLE_TICK_MS);
    expect(h.saved).toHaveLength(1);
    expect(() => h.sync.captureClose({ dead: true })).not.toThrow();
    expect(h.saved).toHaveLength(1);
  });

  it('captureClose() on a reader that never played stores nothing', () => {
    const h = harness([reader({ active: false })]);
    h.sync.captureClose(reader({ active: false }));
    expect(h.saved).toEqual([]);
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
    expect(h.sync.lookup(reader())).toEqual(PDF_POINT);
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
    expect(h.saved[h.saved.length - 1].pos).toEqual(LATER_POINT);
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
    expect(h.sync.lookup(reader())).toEqual(PDF_POINT);
    // Played again (the tab was reopened): recording resumes
    readers[0].active = true;
    readers[0].saved = LATER_POS;
    h.advance(IDLE_TICK_MS);
    expect(h.sync.lookup(reader())).toEqual(LATER_POINT);
  });

  it('still never imports from a reader that has not played this session', () => {
    const readers = [reader({ active: false })];
    const h = harness(readers);
    h.sync.start();
    h.advance(IDLE_TICK_MS * 2);
    expect(h.sync.lookup(reader())).toBeNull();
  });

  it('stop() takes a last look before the store drains', () => {
    const readers = [reader()];
    const h = harness(readers);
    h.sync.start();
    h.advance(IDLE_TICK_MS);
    readers[0].saved = LATER_POS;
    h.sync.stop();
    expect(h.saved[h.saved.length - 1].pos).toEqual(LATER_POINT);
  });

  it('stop() still reads a deactivated reader that played this session', () => {
    const readers = [reader()];
    const h = harness(readers);
    h.sync.start();
    h.advance(IDLE_TICK_MS);
    readers[0].active = false;
    readers[0].saved = LATER_POS;
    h.sync.stop();
    expect(h.saved[h.saved.length - 1].pos).toEqual(LATER_POINT);
  });

  it('lookup() returns null for an attachment with nothing stored', () => {
    const h = harness([reader()]);
    h.sync.sample();
    expect(h.sync.lookup(reader())).toEqual(PDF_POINT);
    expect(h.sync.lookup(reader({ key: 'OTHER' }))).toBeNull();
  });

  // The samePosition comparison must see like against like: the store holds
  // the normalized point, the reader hands out the raw rect list, and the
  // same sentence must not look like a change (#14's "normalize before
  // samePosition compares" trap)
  it('does not save when the raw position normalizes to what is stored', () => {
    const h = harness([reader()], {}, [{ lib: 1, key: 'ABCD1234', pos: PDF_POINT, ts: 5 }]);
    h.sync.sample();
    expect(h.saved).toEqual([]);
  });

  it('reports a save that throws instead of throwing', () => {
    const h = harness([reader()], {
      save: () => {
        throw new Error('Database permanently closed');
      },
    });
    expect(() => h.sync.sample()).not.toThrow();
    expect(h.errors).toHaveLength(1);
    // The in-memory copy still advanced; resume in this session still works
    expect(h.sync.lookup(reader())).toEqual(PDF_POINT);
  });
});
