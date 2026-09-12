import { describe, expect, it } from 'vitest';
import { followTarget, type Box, type FollowInput } from '../../src/read-aloud/sentence-in-view';
import { DEFAULTS, loadSettings, PREF_PREFIX } from '../../src/core/settings';
import { createBackup, parseBackup, applyBackup } from '../../src/core/settings-backup';
import { neverSynced, parseSharedSettings, serializeSharedSettings } from '../../src/core/settings-sync';

const viewport = { scrollTop: 1000, scrollLeft: 0, clientHeight: 1000, clientWidth: 800, scrollHeight: 8000, scrollWidth: 1600 };
const decide = (whole: Box, extra: Partial<FollowInput> = {}) => followTarget({ head: whole, whole, part: null, viewport, mode: 'outside', ...extra });

describe('auto-scroll modes', () => {
  it('does not scroll early at either edge, including the last visible pixel', () => {
    for (const box of [[10, 1000, 700, 1040], [10, 1950, 700, 2000]] as Box[]) {
      expect(decide(box)).toMatchObject({ reason: 'none', handled: true });
    }
  });
  it('centers a fitting sentence only on entry in sentence mode', () => {
    const box: Box = [10, 1750, 700, 1800];
    expect(decide(box, { mode: 'sentence', entered: true }).top).toBe(1275);
    expect(decide(box, { mode: 'sentence', entered: false }).reason).toBe('none');
    expect(decide(box, { mode: 'outside', entered: true }).reason).toBe('none');
  });
  it('centers actual clipping and adjusts horizontal clipping without premature vertical motion', () => {
    expect(decide([10, 1800, 700, 2001]).top).toBe(1400.5);
    expect(decide([820, 1500, 900, 1520])).toMatchObject({ left: 110 });
    expect(decide([820, 1500, 900, 1520]).top).toBeUndefined();
  });
  it('explicit return centers even a visible sentence in outside mode', () => {
    expect(decide([10, 1750, 700, 1800], { force: true }).top).toBe(1275);
  });
  it('starts an oversized sentence at its first line, then follows real words only outside', () => {
    const whole: Box = [10, 1000, 700, 2800];
    const head: Box = [10, 1600, 700, 1620];
    expect(decide(whole, { head, entered: true, part: [10, 2600, 60, 2620] }).top).toBe(1576);
    expect(decide(whole, { head, part: [10, 1990, 60, 2000] }).reason).toBe('none');
    expect(decide(whole, { head, part: [10, 2000, 60, 2020] }).top).toBe(1510);
    expect(decide(whole, { head, part: null, entered: false }).reason).toBe('none');
  });
  it('fits a sentence as tall as the viewport without imposing hidden margins', () => {
    expect(decide([0, 1000, 700, 2000])).toMatchObject({ fits: true, reason: 'none' });
  });
});

describe('auto-scroll preference', () => {
  it('defaults to sentence, validates stored values and survives backup/restore', () => {
    const data = new Map<string, unknown>();
    const prefs = { get: (k: string) => data.get(k), set: (k: string, v: unknown) => { data.set(k, v); } };
    expect(DEFAULTS.readAloud.autoScrollMode).toBe('sentence');
    expect(loadSettings(prefs).readAloud.autoScrollMode).toBe('sentence');
    data.set(PREF_PREFIX + 'readAloud.autoScrollMode', 'unsupported');
    expect(loadSettings(prefs).readAloud.autoScrollMode).toBe('sentence');
    data.set(PREF_PREFIX + 'readAloud.autoScrollMode', 'outside');
    const backup = parseBackup(JSON.stringify(createBackup(prefs)));
    expect(backup.settings['readAloud.autoScrollMode']).toBe('outside');
    data.clear();
    applyBackup(prefs, backup);
    expect(loadSettings(prefs).readAloud.autoScrollMode).toBe('outside');
    expect(neverSynced('readAloud.autoScrollMode')).toBe(false);
    const item = { key: 'readAloud.autoScrollMode', value: 'sentence', ts: 1, by: 'test' };
    expect(parseSharedSettings(serializeSharedSettings([item]))).toEqual([item]);
  });
});
