import { describe, expect, it } from 'vitest';
import {
  HIGHLIGHT_ACTIONS,
  HIGHLIGHT_LEVEL_PREF,
  HIGHLIGHT_LEVELS,
  isHighlightLevel,
  nextHighlightLevel,
  readHighlightLevel,
} from '../../src/core/highlight-level';

describe('the highlight level (issue #67)', () => {
  it("is Zotero's own pref, the one its Highlight current setting writes", () => {
    expect(HIGHLIGHT_LEVEL_PREF).toBe('extensions.zotero.reader.readAloud.highlightGranularity');
    expect(HIGHLIGHT_LEVELS).toEqual(['word', 'sentence', 'paragraph']);
    expect(HIGHLIGHT_ACTIONS).toEqual(['toggleWordHighlight']);
  });

  it('recognizes the three levels and nothing else', () => {
    expect(isHighlightLevel('word')).toBe(true);
    expect(isHighlightLevel('sentence')).toBe(true);
    expect(isHighlightLevel('paragraph')).toBe(true);
    expect(isHighlightLevel('Word')).toBe(false);
    expect(isHighlightLevel('')).toBe(false);
    expect(isHighlightLevel(undefined)).toBe(false);
    expect(isHighlightLevel(1)).toBe(false);
  });

  it("reads the pref, and anything it cannot read as sentence — Zotero's own default and fallback", () => {
    const prefs = (value: unknown) => ({ get: (key: string) => (key === HIGHLIGHT_LEVEL_PREF ? value : undefined) });
    expect(readHighlightLevel(prefs('word'))).toBe('word');
    expect(readHighlightLevel(prefs('sentence'))).toBe('sentence');
    expect(readHighlightLevel(prefs('paragraph'))).toBe('paragraph');
    expect(readHighlightLevel(prefs(undefined))).toBe('sentence');
    expect(readHighlightLevel(prefs('words'))).toBe('sentence');
    expect(readHighlightLevel(prefs(null))).toBe('sentence');
  });

  it('turns the word highlight on from any other level, and off to the sentence', () => {
    expect(nextHighlightLevel('word')).toBe('sentence');
    expect(nextHighlightLevel('sentence')).toBe('word');
    // Paragraph is left to Zotero's settings: the key never cycles through it
    expect(nextHighlightLevel('paragraph')).toBe('word');
    expect(nextHighlightLevel(undefined)).toBe('word');
    expect(nextHighlightLevel('garbage')).toBe('word');
  });
});
