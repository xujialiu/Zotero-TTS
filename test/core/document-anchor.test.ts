import { describe, expect, it } from 'vitest';
import { ANCHOR_CONTEXT, anchorHasWords, compareMatches, createTextAnchor, matchAnchor, normalizeAnchorText } from '../../src/core/document-anchor';

/**
 * ADR 0008's text anchor: the thing that decides whether a locator landed where
 * it claims.
 *
 * The cases that matter here are the ones where the text and the anchor
 * **disagree**. A test that only shows an anchor matching the text it was cut
 * from proves nothing, because the failure this exists to prevent is not an
 * error — it is a silent resolution to the wrong node.
 */

const BLOCK = 'Chapter one begins here. The quick brown fox jumps over the lazy dog. And then it stopped.';
const FOX = 'The quick brown fox jumps over the lazy dog.';
const anchorForFox = () => createTextAnchor(BLOCK, BLOCK.indexOf(FOX), BLOCK.indexOf(FOX) + FOX.length);

describe('createTextAnchor', () => {
  it('quotes the Utterance and keeps the document either side of it', () => {
    const anchor = anchorForFox();
    expect(anchor.exact).toBe(FOX);
    expect(anchor.prefix).toBe('Chapter one begins here. ');
    expect(anchor.suffix).toBe(' And then it stopped.');
  });

  it('keeps at most the context length either side', () => {
    const text = `${'a'.repeat(100)}QUOTE${'b'.repeat(100)}`;
    const anchor = createTextAnchor(text, 100, 105);
    expect(anchor.exact).toBe('QUOTE');
    expect(anchor.prefix).toBe('a'.repeat(ANCHOR_CONTEXT));
    expect(anchor.suffix).toBe('b'.repeat(ANCHOR_CONTEXT));
  });

  it('has no context to keep at the ends of the text, and says so with empty strings', () => {
    const anchor = createTextAnchor('Only this.', 0, 10);
    expect(anchor).toEqual({ exact: 'Only this.', prefix: '', suffix: '' });
  });

  it('clamps a span that runs past the text rather than producing undefined', () => {
    expect(createTextAnchor('short', -5, 500).exact).toBe('short');
    expect(createTextAnchor('short', 4, 2).exact).toBe('');
  });

  /**
   * ADR 0008: anchors are normalised on the storing side, to NFC, because that is
   * what Zotero normalises EPUB text to. The plugin has been bitten once by an
   * exact comparison against a document that happened to be NFD.
   */
  it('stores NFC even when the document is NFD', () => {
    const decomposed = 'Il a déjà vu la même chose.';
    const anchor = createTextAnchor(decomposed, 0, decomposed.length);
    expect(anchor.exact).toBe('Il a déjà vu la même chose.');
    expect(anchor.exact).toBe(anchor.exact.normalize('NFC'));
    expect(anchor.exact.length).toBeLessThan(decomposed.length);
  });

  it('normalises the context too, not only the quotation', () => {
    const decomposed = 'é one. two. é three.';
    const anchor = createTextAnchor(decomposed, decomposed.indexOf('two.'), decomposed.indexOf('two.') + 4);
    expect(anchor.prefix).toBe(normalizeAnchorText(anchor.prefix));
    expect(anchor.suffix).toBe(normalizeAnchorText(anchor.suffix));
  });
});

describe('matchAnchor, when the text agrees', () => {
  it('finds the quotation where it came from, exactly', () => {
    expect(matchAnchor(anchorForFox(), BLOCK)).toEqual({
      start: BLOCK.indexOf(FOX),
      end: BLOCK.indexOf(FOX) + FOX.length,
      agreement: 'exact',
      matched: 1,
      context: 8,
      ambiguous: false,
    });
  });

  it('returns offsets into the text it was given, so a Range can be built from them', () => {
    const match = matchAnchor(anchorForFox(), BLOCK);
    expect(BLOCK.slice(match!.start, match!.end)).toBe(FOX);
  });
});

/**
 * The silent-failure cases. Each of these is a document that has moved under a
 * stored anchor in a way that an equality test would get wrong.
 */
describe('matchAnchor, when the text has moved', () => {
  /**
   * The NFC/NFD trap, which is the one ADR 0008 calls out by name. The anchor is
   * stored NFC; this document is NFD; an exact comparison fails and fails
   * silently.
   */
  it('matches an NFC anchor against an NFD document, with offsets into the NFD text', () => {
    const composed = 'Il a déjà vu la même chose. Rien de plus.';
    const anchor = createTextAnchor(composed, 0, 27);
    const decomposed = composed.normalize('NFD');
    const match = matchAnchor(anchor, decomposed);
    expect(match).toMatchObject({ agreement: 'exact', matched: 1 });
    expect(decomposed.slice(match!.start, match!.end).normalize('NFC')).toBe('Il a déjà vu la même chose.');
  });

  it('matches an NFD anchor against an NFC document', () => {
    const decomposed = 'Il a déjà vu la même chose. Rien de plus.';
    // An anchor built by hand rather than through createTextAnchor, which would
    // have composed it: this is the shape a file written by another tool has.
    const anchor = { exact: decomposed.slice(0, 30), prefix: '', suffix: '' };
    const match = matchAnchor(anchor, decomposed.normalize('NFC'));
    expect(match).toMatchObject({ agreement: 'exact' });
    expect(decomposed.normalize('NFC').slice(match!.start, match!.end)).toBe('Il a déjà vu la même chose.');
  });

  /**
   * A Block's text is reported verbatim, the source file's newlines and
   * indentation included (`src/renderer/`). A document re-saved by another tool
   * wraps its lines somewhere else, and every character offset moves.
   */
  it('matches through different whitespace, by words', () => {
    const reflowed = 'Chapter one begins here.\n   The quick  brown fox jumps\n over the lazy dog.\n And then it stopped.';
    const match = matchAnchor(anchorForFox(), reflowed);
    expect(match).toMatchObject({ agreement: 'aligned', matched: 1, ambiguous: false });
    expect(reflowed.slice(match!.start, match!.end)).toBe('The quick  brown fox jumps\n over the lazy dog');
  });

  /**
   * An `aligned` match spans the first matched word to the last, so the
   * quotation's own trailing punctuation is not part of it. Pinned rather than
   * papered over: what was matched is the words, and claiming a wider span would
   * be claiming something that was not checked.
   */
  it('spans words, not punctuation, when the characters did not match', () => {
    const match = matchAnchor(anchorForFox(), 'x The quick brown fox jumps over the lazy dog!');
    expect(match).toMatchObject({ agreement: 'aligned', matched: 1 });
    expect(match!.end).toBe(45);
  });

  it('matches through different punctuation and capitalisation', () => {
    const rewritten = "Chapter one. The quick, brown fox jumps over the lazy dog — and then it stopped.";
    expect(matchAnchor(anchorForFox(), rewritten)).toMatchObject({ agreement: 'aligned', matched: 1 });
  });

  /**
   * The third normal form, and it is load-bearing too. NFC keeps a ligature and a
   * full-width form as themselves, so neither the storing side nor the character
   * search can reconcile them. The token keys of `core/align.ts` are NFKC-folded,
   * which is what does — and NFKC subsumes canonical composition, which is why
   * the word path needs no NFC/NFD handling of its own.
   */
  it('matches a document whose typography NFC does not touch, because the words fold under NFKC', () => {
    const plain = 'The office files were classified at once.';
    const anchor = createTextAnchor(plain, 0, plain.length);
    expect(anchor.exact).toBe(plain); // NFC changed nothing
    expect(matchAnchor(anchor, 'The oﬃce ﬁles were classiﬁed at once.')).toMatchObject({ agreement: 'aligned', matched: 1 });
    expect(matchAnchor(anchor, 'Ｔｈｅ ｏｆｆｉｃｅ files were classified at once.')).toMatchObject({ agreement: 'aligned', matched: 1 });
  });

  it('matches through a typographic apostrophe the document straightened', () => {
    const text = 'She said it was the authors’ own fault, entirely.';
    const anchor = createTextAnchor(text, 0, text.length);
    expect(matchAnchor(anchor, "She said it was the authors' own fault, entirely.")).toMatchObject({ agreement: 'aligned', matched: 1 });
  });

  /** The aligner's own job: some words differ, the place is still the place. */
  it('matches when a few words differ, and reports how much was found', () => {
    const edited = 'Chapter one begins here. The quick brown fox leapt over the sleepy dog. And then it stopped.';
    const match = matchAnchor(anchorForFox(), edited);
    expect(match!.agreement).toBe('aligned');
    expect(match!.matched).toBeGreaterThan(0.7);
    expect(match!.matched).toBeLessThan(1);
    expect(edited.slice(match!.start, match!.end)).toContain('fox leapt over the sleepy dog');
  });
});

/**
 * The refusals. Every one of these would be a bookmark landing somewhere it was
 * not, which philosophy rule 1 and ADR 0008 say is worse than no bookmark.
 */
describe('matchAnchor, when it must refuse', () => {
  it('finds nothing in text that shares no words', () => {
    expect(matchAnchor(anchorForFox(), 'Something else entirely, about nothing at all.')).toBeNull();
  });

  it('refuses text that shares only the common words', () => {
    // 'the', 'over' and 'and' are all in the anchor; a longest common
    // subsequence will happily pair them across this whole sentence.
    expect(matchAnchor(anchorForFox(), 'And over the hills, over the water, and over the years, the end.')).toBeNull();
  });

  it('refuses a fragment of the quotation, because too little of it is there', () => {
    expect(matchAnchor(anchorForFox(), 'The quick brown fox.')).toBeNull();
  });

  it('refuses a scatter of the quotation across a chapter, however many words pair', () => {
    const smeared = [
      'The morning was quick to arrive.',
      'A brown envelope lay on the table.',
      'The fox was gone.',
      'Nobody jumps at a noise like that.',
      'It was over.',
      'The lazy afternoon wore on.',
      'A dog barked.',
    ].join(' ');
    expect(matchAnchor(anchorForFox(), smeared)).toBeNull();
  });

  it('finds nothing for an empty quotation, and nothing in empty text', () => {
    expect(matchAnchor({ exact: '', prefix: '', suffix: '' }, BLOCK)).toBeNull();
    expect(matchAnchor(anchorForFox(), '')).toBeNull();
  });

  /**
   * A scene break written `* * *` is an Utterance and is not **Speakable**
   * (CONTEXT.md). It has no words, so only an exact character match can ever
   * find it — which is a real limit, and `anchorHasWords` is how a caller can
   * report it as one rather than as "the passage is gone".
   */
  it('can only find an Utterance that is not Speakable by its characters', () => {
    const text = 'One. * * * Two.';
    const anchor = createTextAnchor(text, 5, 10);
    expect(anchorHasWords(anchor)).toBe(false);
    expect(matchAnchor(anchor, text)).toMatchObject({ start: 5, end: 10, agreement: 'exact' });
    expect(matchAnchor(anchor, 'One. *** Two.')).toBeNull();
  });
});

describe('matchAnchor, when the text says the same thing twice', () => {
  it('uses the stored context to choose between two identical quotations', () => {
    const text = 'Before the storm. He said nothing. After the storm. He said nothing. The end.';
    const second = text.lastIndexOf('He said nothing.');
    const anchor = createTextAnchor(text, second, second + 16);
    const match = matchAnchor(anchor, text);
    expect(match).toMatchObject({ start: second, ambiguous: false });
    expect(match!.context).toBeGreaterThan(0);
  });

  it('reports ambiguity when the context cannot choose either', () => {
    const text = 'He said nothing. He said nothing.';
    const anchor = { exact: 'He said nothing.', prefix: '', suffix: '' };
    expect(matchAnchor(anchor, text)).toMatchObject({ start: 0, ambiguous: true });
  });

  it('does not let a weaker kind of match outrank a stronger one elsewhere in the text', () => {
    // 'the lazy dog' is present exactly once and approximately once. The exact
    // one has to win, wherever it is.
    const text = 'the lazy dogs of summer. And then: the lazy dog.';
    const anchor = { exact: 'the lazy dog.', prefix: '', suffix: '' };
    expect(matchAnchor(anchor, text)).toMatchObject({ start: text.lastIndexOf('the lazy dog.'), agreement: 'exact' });
  });
});

describe('compareMatches', () => {
  const match = (over: Partial<ReturnType<typeof matchAnchor>> = {}) => ({
    start: 0,
    end: 1,
    agreement: 'exact' as const,
    matched: 1,
    context: 0,
    ambiguous: false,
    ...over,
  });

  it('prefers exact characters, then more of the quotation, then more context', () => {
    expect(compareMatches(match(), match({ agreement: 'aligned' }))).toBeLessThan(0);
    expect(compareMatches(match({ matched: 0.8 }), match({ matched: 0.9 }))).toBeGreaterThan(0);
    expect(compareMatches(match({ context: 3 }), match({ context: 1 }))).toBeLessThan(0);
  });

  it('calls two matches with nothing to choose between them equal, which is what makes a position ambiguous', () => {
    expect(compareMatches(match({ start: 0 }), match({ start: 90 }))).toBe(0);
  });
});
