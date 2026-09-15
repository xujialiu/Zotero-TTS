import { PREF_PREFIX } from './settings';

/**
 * What Read Aloud highlights — the sentence being spoken, the word inside
 * it, or both — as two switches of the plugin's own (issue #114): the
 * Highlight section's `Sentence` and `Word`, both on by default, never
 * both off. Until issue #114 the choice was Zotero's own setting,
 * `reader.readAloud.highlightGranularity` (Settings → General → Read Aloud
 * → Highlight current), and the key of issue #67 flipped it in place.
 *
 * Zotero still draws the highlight, so its pref is kept equal to what the
 * switches say (highlight-pin.ts): `word` while the Word switch is on,
 * `sentence` otherwise, never `paragraph` — the level the plugin has no
 * color for, no key for, and no use for in a player of its own. Whether
 * the sentence is drawn under the word is the plugin's own drawing
 * (read-aloud/highlight-style.ts), read from the Sentence switch.
 */

/** Zotero's pref in full, and as `Zotero.Prefs.registerObserver` wants it — relative to `extensions.zotero.`. */
export const HIGHLIGHT_LEVEL_PREF = 'extensions.zotero.reader.readAloud.highlightGranularity';
export const HIGHLIGHT_LEVEL_OBSERVER = 'reader.readAloud.highlightGranularity';

/** The plugin's two switches: their prefs in full, and their observer names. */
export const HIGHLIGHT_SWITCH_PREFS = {
  sentence: `${PREF_PREFIX}highlight.sentence`,
  word: `${PREF_PREFIX}highlight.word`,
} as const;
export const HIGHLIGHT_SWITCH_OBSERVERS = {
  sentence: 'zotero-tts.highlight.sentence',
  word: 'zotero-tts.highlight.word',
} as const;

export interface HighlightLevels {
  sentence: boolean;
  word: boolean;
}

/** The two values of Zotero's pref the plugin ever writes. */
export type ZoteroHighlightLevel = 'word' | 'sentence';

/** What the pair amounts to on screen, for the key's toast. */
export type HighlightSummary = 'both' | 'sentence' | 'word';

export type HighlightAction = 'toggleWordHighlight';
export const HIGHLIGHT_ACTIONS: readonly HighlightAction[] = ['toggleWordHighlight'];

/**
 * What a reader's active word timestamp is: a real word, the whole-segment
 * stand-in of a voice without word timing (read-aloud/remote-interface.ts
 * `wholeSegmentTimestamp`), or none — the gap between segments, an idle
 * reader. With the Word switch on, a stand-in means the sentence is what
 * is drawn.
 */
export type WordTiming = 'real' | 'stand-in' | 'none';

/** Both off is not a state: it reads as the sentence, Zotero's own default. */
export function settleLevels(levels: HighlightLevels): HighlightLevels {
  return levels.sentence || levels.word ? { sentence: levels.sentence, word: levels.word } : { sentence: true, word: false };
}

/** The switches as stored; a value that is not a boolean reads as on, the default. */
export function readHighlightLevels(prefs: { get(key: string): unknown }): HighlightLevels {
  const read = (key: string): boolean => {
    const value = prefs.get(key);
    return typeof value === 'boolean' ? value : true;
  };
  return settleLevels({ sentence: read(HIGHLIGHT_SWITCH_PREFS.sentence), word: read(HIGHLIGHT_SWITCH_PREFS.word) });
}

export function writeHighlightLevels(prefs: { set(key: string, value: unknown): void }, levels: HighlightLevels): void {
  prefs.set(HIGHLIGHT_SWITCH_PREFS.sentence, levels.sentence);
  prefs.set(HIGHLIGHT_SWITCH_PREFS.word, levels.word);
}

/** The key: the Word switch flipped; off never leaves nothing, the sentence comes on. */
export function toggleWord(levels: HighlightLevels): HighlightLevels {
  const current = settleLevels(levels);
  const word = !current.word;
  return { sentence: current.sentence || !word, word };
}

/** The level Zotero is kept at: its word highlight whenever the Word switch is on. */
export function zoteroLevelFor(levels: HighlightLevels): ZoteroHighlightLevel {
  return levels.word ? 'word' : 'sentence';
}

export function describeLevels(levels: HighlightLevels): HighlightSummary {
  const current = settleLevels(levels);
  return current.word ? (current.sentence ? 'both' : 'word') : 'sentence';
}
