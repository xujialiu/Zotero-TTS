import { describe, expect, it } from 'vitest';
import {
  clampVolume,
  gainOf,
  nextVolume,
  settleVolumePref,
  VOLUME_ACTIONS,
  VOLUME_DEFAULT,
  VOLUME_MAX,
  VOLUME_MIN,
  VOLUME_OBSERVER,
  VOLUME_PREF,
  VOLUME_STEP,
} from '../../src/core/read-aloud-volume';
import { PREF_PREFIX } from '../../src/core/settings';

describe('the volume model', () => {
  // 100 is Zotero's own level and the most: a gain above 1 lands ahead of
  // Zotero's compressor and is taken back there (issue #66)
  it('is a percentage of Zotero’s own output: 0–100 in steps of 10, 100 being Zotero unchanged', () => {
    expect([VOLUME_MIN, VOLUME_MAX, VOLUME_STEP, VOLUME_DEFAULT]).toEqual([0, 100, 10, 100]);
    expect(VOLUME_ACTIONS).toEqual(['volumeDown', 'volumeUp']);
  });

  it('names the pref the keys and the pane share, in both spellings Zotero wants', () => {
    expect(VOLUME_PREF).toBe(PREF_PREFIX + 'readAloud.volume');
    // Zotero.Prefs.registerObserver takes names relative to extensions.zotero.
    expect('extensions.zotero.' + VOLUME_OBSERVER).toBe(VOLUME_PREF);
  });

  it('clamps to whole percents within the range, and reads anything that is not a number as 100', () => {
    expect(clampVolume(80)).toBe(80);
    expect(clampVolume(84.6)).toBe(85);
    // What 1.11.1's 0–200 field could store
    expect(clampVolume(150)).toBe(100);
    expect(clampVolume(250)).toBe(100);
    expect(clampVolume(-10)).toBe(0);
    for (const bad of [NaN, Infinity, undefined, null, '80', {}]) expect(clampVolume(bad)).toBe(100);
  });

  it('steps by 10 and stops at the ends', () => {
    expect(nextVolume(90, 'volumeUp')).toBe(100);
    expect(nextVolume(100, 'volumeDown')).toBe(90);
    expect(nextVolume(85, 'volumeUp')).toBe(95);
    expect(nextVolume(100, 'volumeUp')).toBe(100);
    expect(nextVolume(95, 'volumeUp')).toBe(100);
    expect(nextVolume(150, 'volumeUp')).toBe(100);
    expect(nextVolume(0, 'volumeDown')).toBe(0);
    expect(nextVolume(5, 'volumeDown')).toBe(0);
  });

  it('steps from 100 when the current level is not a number', () => {
    expect(nextVolume(NaN, 'volumeUp')).toBe(100);
    expect(nextVolume(undefined, 'volumeDown')).toBe(90);
  });

  it('turns the percentage into the gain the chain carries: 1 at 100, and never more', () => {
    expect(gainOf(100)).toBe(1);
    expect(gainOf(80)).toBe(0.8);
    expect(gainOf(0)).toBe(0);
    expect(gainOf(200)).toBe(1);
    expect(gainOf(NaN)).toBe(1);
  });
});

/**
 * A level 1.11.1 stored above 100 is brought into the range once at
 * startup, so the pane's field shows the number that plays (issue #66):
 * `loadSettings` already reads such a pref clamped, but a bound field
 * shows the raw pref, and a 150 it shows is a 100 it plays.
 */
describe('settleVolumePref', () => {
  function fakePrefs(initial: Record<string, unknown> = {}) {
    const store: Record<string, unknown> = { ...initial };
    const writes: unknown[] = [];
    return {
      store,
      writes,
      get: (key: string) => store[key],
      set: (key: string, value: unknown) => {
        store[key] = value;
        writes.push(value);
      },
    };
  }

  it('writes a stored level above 100 back as 100, and says so', () => {
    const prefs = fakePrefs({ [VOLUME_PREF]: 150 });
    expect(settleVolumePref(prefs)).toEqual({ from: 150, to: 100 });
    expect(prefs.store[VOLUME_PREF]).toBe(100);
    expect(prefs.writes).toEqual([100]);
  });

  it('brings a level below 0 or off the whole percent into the range the same way', () => {
    expect(settleVolumePref(fakePrefs({ [VOLUME_PREF]: -5 }))).toEqual({ from: -5, to: 0 });
    expect(settleVolumePref(fakePrefs({ [VOLUME_PREF]: 84.6 }))).toEqual({ from: 84.6, to: 85 });
  });

  it('leaves a level within the range, an unset pref and a pref that is not a number alone', () => {
    for (const initial of [{ [VOLUME_PREF]: 80 }, { [VOLUME_PREF]: 100 }, { [VOLUME_PREF]: 0 }, {}, { [VOLUME_PREF]: '150' }, { [VOLUME_PREF]: NaN }]) {
      const prefs = fakePrefs(initial);
      expect(settleVolumePref(prefs)).toBeNull();
      expect(prefs.writes).toEqual([]);
    }
  });

  it('lets a failing write throw, for the caller to log', () => {
    const prefs = fakePrefs({ [VOLUME_PREF]: 150 });
    prefs.set = () => {
      throw new Error('locked');
    };
    expect(() => settleVolumePref(prefs)).toThrow('locked');
  });
});
