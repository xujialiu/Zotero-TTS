import { describe, expect, it } from 'vitest';
import {
  HIGHLIGHT_ACTIONS,
  HIGHLIGHT_LEVEL_OBSERVER,
  HIGHLIGHT_LEVEL_PREF,
  HIGHLIGHT_SWITCH_OBSERVERS,
  HIGHLIGHT_SWITCH_PREFS,
  describeLevels,
  readHighlightLevels,
  settleLevels,
  toggleWord,
  writeHighlightLevels,
  zoteroLevelFor,
} from '../../src/core/highlight-level';
import { PREF_PREFIX } from '../../src/core/settings';

const prefs = (values: Record<string, unknown>) => ({ get: (key: string) => values[key] });

describe('the highlight levels (issue #114)', () => {
  it("names Zotero's pref, the plugin's two switches, and the key's one action", () => {
    expect(HIGHLIGHT_LEVEL_PREF).toBe('extensions.zotero.reader.readAloud.highlightGranularity');
    expect(HIGHLIGHT_LEVEL_OBSERVER).toBe('reader.readAloud.highlightGranularity');
    expect(HIGHLIGHT_SWITCH_PREFS).toEqual({ sentence: `${PREF_PREFIX}highlight.sentence`, word: `${PREF_PREFIX}highlight.word` });
    expect(HIGHLIGHT_SWITCH_OBSERVERS).toEqual({ sentence: 'zotero-tts.highlight.sentence', word: 'zotero-tts.highlight.word' });
    expect(HIGHLIGHT_ACTIONS).toEqual(['toggleWordHighlight']);
  });

  it('reads the two switches, anything unreadable as on, and never both off', () => {
    expect(readHighlightLevels(prefs({}))).toEqual({ sentence: true, word: true });
    expect(readHighlightLevels(prefs({ [HIGHLIGHT_SWITCH_PREFS.word]: false }))).toEqual({ sentence: true, word: false });
    expect(readHighlightLevels(prefs({ [HIGHLIGHT_SWITCH_PREFS.sentence]: false }))).toEqual({ sentence: false, word: true });
    expect(readHighlightLevels(prefs({ [HIGHLIGHT_SWITCH_PREFS.sentence]: 'no', [HIGHLIGHT_SWITCH_PREFS.word]: 0 }))).toEqual({ sentence: true, word: true });
    // A hand-edited profile with both off reads as the sentence, Zotero's own default
    expect(readHighlightLevels(prefs({ [HIGHLIGHT_SWITCH_PREFS.sentence]: false, [HIGHLIGHT_SWITCH_PREFS.word]: false }))).toEqual({ sentence: true, word: false });
  });

  it('settles both off to the sentence and leaves every other pair alone', () => {
    expect(settleLevels({ sentence: false, word: false })).toEqual({ sentence: true, word: false });
    expect(settleLevels({ sentence: true, word: true })).toEqual({ sentence: true, word: true });
    expect(settleLevels({ sentence: true, word: false })).toEqual({ sentence: true, word: false });
    expect(settleLevels({ sentence: false, word: true })).toEqual({ sentence: false, word: true });
  });

  it('writes both switches under their prefs', () => {
    const store: Record<string, unknown> = {};
    writeHighlightLevels({ set: (k, v) => void (store[k] = v) }, { sentence: false, word: true });
    expect(store).toEqual({ [HIGHLIGHT_SWITCH_PREFS.sentence]: false, [HIGHLIGHT_SWITCH_PREFS.word]: true });
  });

  it('the key turns the word on and off, and off never leaves nothing: the sentence comes on', () => {
    expect(toggleWord({ sentence: true, word: true })).toEqual({ sentence: true, word: false });
    expect(toggleWord({ sentence: true, word: false })).toEqual({ sentence: true, word: true });
    expect(toggleWord({ sentence: false, word: true })).toEqual({ sentence: true, word: false });
    // Both off is not a state: settled to the sentence first, then the word comes on
    expect(toggleWord({ sentence: false, word: false })).toEqual({ sentence: true, word: true });
  });

  it("gives Zotero the word level whenever the Word switch is on, else the sentence, and never paragraph", () => {
    expect(zoteroLevelFor({ sentence: true, word: true })).toBe('word');
    expect(zoteroLevelFor({ sentence: false, word: true })).toBe('word');
    expect(zoteroLevelFor({ sentence: true, word: false })).toBe('sentence');
    expect(zoteroLevelFor({ sentence: false, word: false })).toBe('sentence');
  });

  it('describes the pair for the toast', () => {
    expect(describeLevels({ sentence: true, word: true })).toBe('both');
    expect(describeLevels({ sentence: true, word: false })).toBe('sentence');
    expect(describeLevels({ sentence: false, word: true })).toBe('word');
    expect(describeLevels({ sentence: false, word: false })).toBe('sentence');
  });
});
