/**
 * Text that is in the PDF but not on the page.
 *
 * LaTeX toolchains embed the source of every equation into the text layer so
 * it can be copied — `<latexit sha1_base64="…">AAAB6Hic…` — drawn at font
 * size zero in a fully transparent color. Nobody ever sees it; Read Aloud
 * reads it anyway, because it takes the text layer whole and caps no
 * segment's length. On one arXiv paper that turns five "sentences" into
 * 2305–4980 characters of base64 apiece, where the longest real sentence is
 * 618.
 *
 * That is Zotero's to fix, and it costs Zotero's own Local voices nothing:
 * `speechSynthesis.speak()` streams to the sound card, so twelve minutes of
 * base64 is merely tedious. Every buffering path pays for it — ours, and
 * Zotero's own cloud voices. Measured: one such segment is 757 seconds of
 * audio, a 24 MB WAV, roughly 145 MB once decoded, and the prefetcher warms
 * several at a time. That is what took the reader's page canvases down.
 *
 * So the plugin declines to speak text that has no extent on the page. The
 * test is the segment's own geometry, which the reader hands us: a PDF
 * segment carries `sourcePosition.rects`, one rectangle per run of
 * characters, and a run drawn at size zero degenerates to a point
 * (`[496.5, 367, 496.5, 367]`). Measured over all 453 segments of that
 * paper, the split is total — no segment sits between the two groups:
 *
 * | zero-area share | segments |
 * |---|---|
 * | ≥ 0.9 | 5 — every one of the base64 blobs (0.9974–0.9982) |
 * | 0.1–0.9 | none |
 * | exactly 0 | 448 — everything a reader can see |
 *
 * A share, not an area, because a share carries no units: it survives a
 * different page size, font size or zoom, where "ink per character" (0.21
 * for the blobs against 4.08 for the faintest real segment) would have to be
 * calibrated per document.
 *
 * The rule is deliberately not a length cap. Length is a proxy: it would
 * refuse a legitimately long sentence and accept a short invisible one,
 * while this refuses exactly what cannot be seen. A visible segment that is
 * merely enormous — a page of OCR with no sentence break — is left alone
 * until there is evidence such a thing exists.
 */

/** At or above this share of zero-area rectangles, a segment is not on the page. Any threshold from 0.5 to 0.99 splits the measured document identically. */
export const INVISIBLE_RECT_SHARE = 0.9;

/**
 * The share of a segment's rectangles that enclose no area, or null when
 * there is nothing to judge by — no rectangles at all, or none well-formed.
 * Null is what makes this safe outside PDFs: an EPUB or snapshot reader
 * positions segments some other way, and its segments are simply never
 * refused.
 *
 * The rectangles belong to the reader's compartment, so they are read by
 * index and only numbers are taken out of them; `map`/`reduce` would run
 * over there and may not touch anything of ours (see index.ts,
 * upcomingSegmentTexts).
 */
export function invisibleRectShare(rects: unknown): number | null {
  const list = rects as ArrayLike<ArrayLike<number>> | null | undefined;
  const length = list && typeof list.length === 'number' ? list.length : 0;
  if (!list || !length) return null;
  let counted = 0;
  let zero = 0;
  for (let i = 0; i < length; i++) {
    const rect = list[i];
    if (!rect || typeof rect.length !== 'number' || rect.length < 4) continue;
    const width = Math.abs(Number(rect[2]) - Number(rect[0]));
    const height = Math.abs(Number(rect[3]) - Number(rect[1]));
    if (!Number.isFinite(width) || !Number.isFinite(height)) continue;
    counted += 1;
    if (width * height === 0) zero += 1;
  }
  return counted ? zero / counted : null;
}

/**
 * Whether this segment is text nobody can see. False for anything the
 * geometry cannot settle — a segment with no rectangles, a sample, a
 * non-PDF view — so the only segments ever refused are the ones proven
 * invisible.
 */
export function isInvisibleSegment(segment: unknown, threshold = INVISIBLE_RECT_SHARE): boolean {
  if (!segment || typeof segment !== 'object') return false;
  let rects: unknown;
  try {
    rects = (segment as { sourcePosition?: { rects?: unknown } }).sourcePosition?.rects;
  } catch {
    // A reader-side object that will not be read is not an invisible one
    return false;
  }
  const share = invisibleRectShare(rects);
  return share !== null && share >= threshold;
}
