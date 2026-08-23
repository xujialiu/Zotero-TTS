import { DEFAULTS, loadSettings, PREF_PREFIX, type PrefsBackend } from '../core/settings';
import { highlightColor } from '../read-aloud/highlight-style';

/**
 * The Highlight group's preview and its Restore button. The colour inputs
 * and the switch are preference=-bound and write the prefs themselves
 * (Zotero's listeners, attached when the pane was built, run before
 * these), so the rows only listen for their events to repaint the preview
 * from the prefs, and the button puts Zotero's own colours back.
 *
 * The preview paints a sample page the way the PDF reader paints a
 * highlight in the light theme: a rectangle of the colour at its opacity,
 * drawn at element opacity 0.4 and blended with `multiply`. Here that is
 * one rgba background with the 0.4 folded in, and `mix-blend-mode:
 * multiply` on the span — which leaves the black text black, as the
 * reader's rectangle over the text does. The word sits inside the
 * sentence, so its colour multiplies onto the sentence's, as in the reader.
 */

export const HIGHLIGHT_IDS = {
  inputs: [
    'ztts-highlight-wordColor',
    'ztts-highlight-wordAlpha',
    'ztts-highlight-sentenceColor',
    'ztts-highlight-sentenceAlpha',
    'ztts-highlight-sentenceUnderWord',
  ],
  previewSentence: 'ztts-highlight-preview-sentence',
  previewWordSentence: 'ztts-highlight-preview-word-sentence',
  previewWord: 'ztts-highlight-preview-word',
  defaults: 'ztts-highlight-defaults',
} as const;

/** The opacity the reader draws its highlight rectangles at in the light theme. */
export const PAGE_RECT_OPACITY = 0.4;

/** Inline style for a preview span, or '' when the colour is not one. */
export function previewStyle(hex: string, alphaPercent: number): string {
  const color = highlightColor(hex, alphaPercent);
  if (!color) return '';
  const channel = (at: number) => parseInt(color.slice(at, at + 2), 16);
  const alpha = Math.round((channel(7) / 255) * PAGE_RECT_OPACITY * 1000) / 1000;
  return `background-color: rgba(${channel(1)}, ${channel(3)}, ${channel(5)}, ${alpha}); mix-blend-mode: multiply;`;
}

interface ElementLike {
  setAttribute(name: string, value: string): void;
  addEventListener(type: string, listener: () => void): void;
}

interface RowsDocument {
  getElementById(id: string): ElementLike | null;
}

export function initHighlightRows(doc: RowsDocument, prefs: PrefsBackend): { refresh(): void } {
  const paint = (id: string, style: string) => doc.getElementById(id)?.setAttribute('style', style);

  const refresh = () => {
    const h = loadSettings(prefs).highlight;
    const sentence = previewStyle(h.sentenceColor, h.sentenceAlpha);
    paint(HIGHLIGHT_IDS.previewSentence, sentence);
    paint(HIGHLIGHT_IDS.previewWordSentence, h.sentenceUnderWord ? sentence : '');
    paint(HIGHLIGHT_IDS.previewWord, previewStyle(h.wordColor, h.wordAlpha));
  };

  for (const id of HIGHLIGHT_IDS.inputs) {
    const el = doc.getElementById(id);
    for (const type of ['input', 'change', 'command']) el?.addEventListener(type, refresh);
  }
  doc.getElementById(HIGHLIGHT_IDS.defaults)?.addEventListener('command', () => {
    for (const [k, v] of Object.entries(DEFAULTS.highlight)) prefs.set(`${PREF_PREFIX}highlight.${k}`, v);
    // The bound inputs redraw themselves from the prefs; the preview does not
    refresh();
  });
  refresh();

  return { refresh };
}
