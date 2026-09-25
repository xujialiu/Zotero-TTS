import { describe, expect, it } from 'vitest';
import { DEFAULTS } from '../../../src/core/settings';
import { computeGap, pauseSettingsOf, type PauseSettings } from '../../../src/core/engine/gap';

const settings = (sentence: [boolean, number], paragraph: [boolean, number]): PauseSettings => ({
  sentence: { enabled: sentence[0], ms: sentence[1] },
  paragraph: { enabled: paragraph[0], ms: paragraph[1] },
});
const zoteros = settings([false, 0], [false, 0]);
const defaults = pauseSettingsOf(DEFAULTS.readAloud);

describe('pauseSettingsOf', () => {
  it('reads the four prefs: on at 0 between sentences, on at 200 before a paragraph', () => {
    expect(defaults).toEqual(settings([true, 0], [true, 200]));
  });
});

describe('computeGap', () => {
  const zeros = settings([false, 0], [false, 0]);

  it('at the defaults runs sentence to sentence and waits 200 before a paragraph at 1×', () => {
    expect(computeGap({ paragraph: false, speed: 1, settings: defaults })).toBe(0);
    expect(computeGap({ paragraph: true, speed: 1, settings: defaults })).toBe(200);
  });

  it('waits the paragraph setting alone before a paragraph, not added to the sentence setting', () => {
    const on = settings([true, 300], [true, 600]);
    expect(computeGap({ paragraph: false, speed: 1, settings: on })).toBe(300);
    expect(computeGap({ paragraph: true, speed: 1, settings: on })).toBe(600);
  });

  it('plays a paragraph pause set below the sentence pause as set', () => {
    const on = settings([true, 500], [true, 200]);
    expect(computeGap({ paragraph: false, speed: 1, settings: on })).toBe(500);
    expect(computeGap({ paragraph: true, speed: 1, settings: on })).toBe(200);
  });

  it('divides the setting by the speed, rounded to whole milliseconds', () => {
    const on = settings([true, 1000], [true, 400]);
    expect(computeGap({ paragraph: false, speed: 2, settings: on })).toBe(500);
    expect(computeGap({ paragraph: true, speed: 2, settings: on })).toBe(200);
    expect(computeGap({ paragraph: true, speed: 1.5, settings: defaults })).toBe(133);
    expect(computeGap({ paragraph: false, speed: 1.7, settings: settings([true, 300], [false, 0]) })).toBe(176);
  });

  it('waits nothing where a switch is off, whatever the other switch and the speed', () => {
    expect(computeGap({ paragraph: false, speed: 1, settings: zeros })).toBe(0);
    expect(computeGap({ paragraph: true, speed: 3, settings: zeros })).toBe(0);
    expect(computeGap({ paragraph: false, speed: 1, settings: settings([false, 1000], [true, 400]) })).toBe(0);
    expect(computeGap({ paragraph: true, speed: 1, settings: settings([false, 1000], [true, 400]) })).toBe(400);
    expect(computeGap({ paragraph: true, speed: 1, settings: settings([true, 1000], [false, 400]) })).toBe(0);
    expect(computeGap({ paragraph: false, speed: 2, settings: settings([true, 1000], [false, 400]) })).toBe(500);
  });

  it('counts a speed that is not a positive number as 1×, and a setting that is not a number as none', () => {
    const on = settings([true, 300], [true, 200]);
    for (const speed of [0, -1, NaN, Infinity, undefined as unknown as number]) {
      expect(computeGap({ paragraph: false, speed, settings: on })).toBe(300);
    }
    expect(computeGap({ paragraph: false, speed: 1, settings: settings([true, NaN], [true, -5]) })).toBe(0);
    expect(computeGap({ paragraph: true, speed: 1, settings: settings([true, NaN], [true, -5]) })).toBe(0);
  });
});
