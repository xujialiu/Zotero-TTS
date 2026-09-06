import { describe, expect, it } from 'vitest';
import {
  clampVolume,
  gainOf,
  nextVolume,
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
  it('is a percentage of Zotero’s own output: 0–200 in steps of 10, 100 being Zotero unchanged', () => {
    expect([VOLUME_MIN, VOLUME_MAX, VOLUME_STEP, VOLUME_DEFAULT]).toEqual([0, 200, 10, 100]);
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
    expect(clampVolume(250)).toBe(200);
    expect(clampVolume(-10)).toBe(0);
    for (const bad of [NaN, Infinity, undefined, null, '80', {}]) expect(clampVolume(bad)).toBe(100);
  });

  it('steps by 10 and stops at the ends', () => {
    expect(nextVolume(100, 'volumeUp')).toBe(110);
    expect(nextVolume(100, 'volumeDown')).toBe(90);
    expect(nextVolume(85, 'volumeUp')).toBe(95);
    expect(nextVolume(200, 'volumeUp')).toBe(200);
    expect(nextVolume(195, 'volumeUp')).toBe(200);
    expect(nextVolume(0, 'volumeDown')).toBe(0);
    expect(nextVolume(5, 'volumeDown')).toBe(0);
  });

  it('steps from 100 when the current level is not a number', () => {
    expect(nextVolume(NaN, 'volumeUp')).toBe(110);
    expect(nextVolume(undefined, 'volumeDown')).toBe(90);
  });

  it('turns the percentage into the gain the chain carries: 1 at 100', () => {
    expect(gainOf(100)).toBe(1);
    expect(gainOf(80)).toBe(0.8);
    expect(gainOf(0)).toBe(0);
    expect(gainOf(200)).toBe(2);
    expect(gainOf(NaN)).toBe(1);
  });
});
