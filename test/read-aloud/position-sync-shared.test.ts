import { describe, expect, it } from 'vitest';
import { createPositionSync, type PositionSyncDeps } from '../../src/read-aloud/position-sync';
import type { SharedCapture } from '../../src/read-aloud/sdt-anchor';

/**
 * The two things the sampler does for the Positions File (docs/spec/SYNC-FORMAT.md):
 * hands over the shared half of every sentence it records, and announces a
 * pause or a close once (6.8). The sampling itself is position-sync.test.ts's.
 */

const CFI = (n: number) => ({ type: 'FragmentSelector', value: `epubcfi(/6/34!/4/2/4/2/${n}/1,:0,:94)` });

function harness() {
  const readers: { lib: number; key: string; manager: { active: boolean; paused: boolean }; saved: unknown; capture: SharedCapture | null }[] = [];
  const shared: { lib: number; key: string; exact: string; ts: number }[] = [];
  let stops = 0;
  let clock = 100;
  const deps: PositionSyncDeps = {
    initial: [],
    save: () => {},
    retryWrites: () => {},
    readers: () => readers,
    attachmentOf: (r) => ({ lib: (r as (typeof readers)[number]).lib, key: (r as (typeof readers)[number]).key }),
    managerOf: (r) => (r as (typeof readers)[number]).manager,
    savedPositionOf: (r) => (r as (typeof readers)[number]).saved,
    sharedCaptureOf: (r) => (r as (typeof readers)[number]).capture,
    recordedShared: (attachment, capture, ts) => void shared.push({ lib: attachment.lib, key: attachment.key, exact: capture.anchor.exact, ts }),
    onPauseOrStop: () => void stops++,
    setTimeout: () => null,
    clearTimeout: () => {},
    now: () => clock,
    error: () => {},
  };
  const sync = createPositionSync(deps);
  return {
    sync,
    readers,
    shared,
    stops: () => stops,
    tick: (ms: number) => void (clock += ms),
    add: (key: string): (typeof readers)[number] => {
      const reader: (typeof readers)[number] = { lib: 1, key, manager: { active: true, paused: false }, saved: CFI(4), capture: { locator: 'epubcfi(/6/34!/4/2/4/2/4)', anchor: { exact: 'one', prefix: '', suffix: '' } } };
      readers.push(reader);
      return reader;
    },
  };
}

describe('the sampler and the Positions File', () => {
  it('hands over the shared half of every new sentence, at the entry stamp, and nothing for an unchanged one', () => {
    const h = harness();
    const reader = h.add('EPUB0001');
    h.sync.sample();
    h.sync.sample();
    expect(h.shared).toEqual([{ lib: 1, key: 'EPUB0001', exact: 'one', ts: 100 }]);
    reader.saved = CFI(6);
    reader.capture = { locator: 'epubcfi(/6/34!/4/2/4/2/6)', anchor: { exact: 'two', prefix: '', suffix: '' } };
    h.tick(10);
    h.sync.sample();
    expect(h.shared).toHaveLength(2);
    expect(h.shared[1]).toMatchObject({ exact: 'two', ts: 110 });
    // A reader with a sentence but no capture (a PDF, say) records the position and no shared half
    reader.saved = CFI(8);
    reader.capture = null;
    h.sync.sample();
    expect(h.shared).toHaveLength(2);
  });

  it('announces a pause, a close and a vanished reader once each, never a mere tick', () => {
    const h = harness();
    const reader = h.add('EPUB0001');
    h.sync.sample();
    h.sync.sample();
    expect(h.stops()).toBe(0);
    reader.manager.paused = true;
    h.sync.sample();
    h.sync.sample();
    expect(h.stops()).toBe(1);
    reader.manager.paused = false;
    h.sync.sample();
    reader.manager.active = false;
    h.sync.sample();
    expect(h.stops()).toBe(2);
    reader.manager.active = true;
    h.sync.sample();
    h.readers.length = 0;
    h.sync.sample();
    h.sync.sample();
    expect(h.stops()).toBe(3);
  });
});
