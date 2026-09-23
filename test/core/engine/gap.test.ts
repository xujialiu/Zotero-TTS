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
  // Premium Voice 1 today: sentenceDelay 300, +200 before a paragraph
  const premium = { nativeSentence: 300 };

  it('hands Zotero its own number through, unscaled, while both switches are off', () => {
    expect(computeGap({ ...premium, scheduled: 300, paragraph: false, speed: 1, settings: zoteros })).toBe(300);
    expect(computeGap({ ...premium, scheduled: 500, paragraph: true, speed: 1, settings: zoteros })).toBe(500);
    expect(computeGap({ ...premium, scheduled: 500, paragraph: true, speed: 2, settings: zoteros })).toBe(500);
    expect(computeGap({ nativeSentence: 0, scheduled: 200, paragraph: true, speed: 3, settings: zoteros })).toBe(200);
  });

  it('at the defaults runs sentence to sentence and keeps 200 before a paragraph at 1×', () => {
    expect(computeGap({ ...premium, scheduled: 300, paragraph: false, speed: 1, settings: defaults })).toBe(0);
    expect(computeGap({ ...premium, scheduled: 500, paragraph: true, speed: 1, settings: defaults })).toBe(200);
    expect(computeGap({ nativeSentence: 0, scheduled: 0, paragraph: false, speed: 1, settings: defaults })).toBe(0);
    expect(computeGap({ nativeSentence: 0, scheduled: 200, paragraph: true, speed: 1, settings: defaults })).toBe(200);
  });

  it('divides an enabled part by the speed, rounded to whole milliseconds', () => {
    const on = settings([true, 1000], [true, 400]);
    expect(computeGap({ ...premium, scheduled: 300, paragraph: false, speed: 2, settings: on })).toBe(500);
    expect(computeGap({ ...premium, scheduled: 500, paragraph: true, speed: 2, settings: on })).toBe(700);
    expect(computeGap({ nativeSentence: 0, scheduled: 200, paragraph: true, speed: 1.5, settings: defaults })).toBe(133);
    expect(computeGap({ nativeSentence: 0, scheduled: 0, paragraph: false, speed: 1.7, settings: settings([true, 300], [false, 0]) })).toBe(176);
  });

  it('mixes: one part the setting, the other Zotero’s own', () => {
    // Sentence set, paragraph left to Zotero: the extra is what Zotero added, unscaled
    expect(computeGap({ ...premium, scheduled: 500, paragraph: true, speed: 2, settings: settings([true, 0], [false, 0]) })).toBe(200);
    // Paragraph set, sentence left to Zotero: the voice's own 300, unscaled, plus the setting scaled
    expect(computeGap({ ...premium, scheduled: 500, paragraph: true, speed: 2, settings: settings([false, 0], [true, 400]) })).toBe(500);
    expect(computeGap({ ...premium, scheduled: 300, paragraph: false, speed: 2, settings: settings([false, 0], [true, 400]) })).toBe(300);
  });

  it('counts a speed that is not a positive number as 1×, and a delay that is not a number as none', () => {
    const on = settings([true, 300], [true, 200]);
    for (const speed of [0, -1, NaN, Infinity, undefined as unknown as number]) {
      expect(computeGap({ nativeSentence: 0, scheduled: 0, paragraph: false, speed, settings: on })).toBe(300);
    }
    expect(computeGap({ nativeSentence: NaN, scheduled: NaN, paragraph: true, speed: 1, settings: zoteros })).toBe(0);
    expect(computeGap({ nativeSentence: -50, scheduled: -50, paragraph: false, speed: 1, settings: zoteros })).toBe(0);
    expect(computeGap({ nativeSentence: 0, scheduled: 0, paragraph: false, speed: 1, settings: settings([true, NaN], [true, -5]) })).toBe(0);
  });
});
