/**
 * The level Zotero's Read Aloud highlights at — the word being spoken, the
 * sentence, or the paragraph (issue #67). It is Zotero's own setting,
 * `reader.readAloud.highlightGranularity` (Settings → General → Read Aloud
 * → Highlight current): one global, persistent pref that every open reader
 * observes, so a write repaints every tab's current segment inside the
 * write itself, playing or paused (notes/NOTES_2026-09-08.md, 22:30). The
 * key turns the word highlight on and off; off is the sentence, Zotero's
 * default. Paragraph is left to Zotero's settings: from it the first press
 * goes to word, and the key never cycles back through it.
 */

export const HIGHLIGHT_LEVEL_PREF = 'extensions.zotero.reader.readAloud.highlightGranularity';

export type HighlightLevel = 'word' | 'sentence' | 'paragraph';
export const HIGHLIGHT_LEVELS: readonly HighlightLevel[] = ['word', 'sentence', 'paragraph'];

export type HighlightAction = 'toggleWordHighlight';
export const HIGHLIGHT_ACTIONS: readonly HighlightAction[] = ['toggleWordHighlight'];

/**
 * What a reader's active word timestamp is: a real word, the whole-segment
 * stand-in of a voice without word timing (read-aloud/remote-interface.ts
 * `wholeSegmentTimestamp`), or none — the gap between segments, an idle
 * reader. At word, a stand-in means the sentence is what is drawn.
 */
export type WordTiming = 'real' | 'stand-in' | 'none';

export function isHighlightLevel(value: unknown): value is HighlightLevel {
  return (HIGHLIGHT_LEVELS as readonly unknown[]).includes(value);
}

/** The pref as Zotero reads it: anything but the three levels is the sentence, its default and what its reader falls back to. */
export function readHighlightLevel(prefs: { get(key: string): unknown }): HighlightLevel {
  const value = prefs.get(HIGHLIGHT_LEVEL_PREF);
  return isHighlightLevel(value) ? value : 'sentence';
}

/** Word on from anywhere else; word off is the sentence. */
export function nextHighlightLevel(current: unknown): HighlightLevel {
  return current === 'word' ? 'sentence' : 'word';
}
