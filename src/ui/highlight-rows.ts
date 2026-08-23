import { LIGHT_THEME, type ColorScheme, type ResolvedReaderTheme } from '../core/reader-theme';
import { DEFAULTS, loadSettings, PREF_PREFIX, type PrefsBackend } from '../core/settings';
import { highlightColor } from '../read-aloud/highlight-style';

/**
 * The Highlight group's preview and its Restore button. The colour inputs
 * and the switch are preference=-bound and write the prefs themselves
 * (Zotero's listeners, attached when the pane was built, run before
 * these), so the rows only listen for their events to repaint the preview
 * from the prefs, and the button puts Zotero's own colours back.
 *
 * The preview is a sample page in the reader's current theme (the one the
 * PDF and EPUB views share, core/reader-theme.ts), with the highlights
 * blended as the PDF view blends its rectangles: in a light theme the
 * colour at its opacity, drawn at 0.4 and multiplied onto the page; in a
 * dark theme drawn at 0.3 and added (`plus-lighter`). Here that is one
 * rgba background with the 0.4 or 0.3 folded in and the blend mode on the
 * span, which leaves the text as the reader's rectangle over it would.
 * The word sits inside the sentence, so its colour blends onto the
 * sentence's, as in the reader.
 */

export const HIGHLIGHT_IDS = {
  inputs: [
    'ztts-highlight-wordColor',
    'ztts-highlight-wordAlpha',
    'ztts-highlight-sentenceColor',
    'ztts-highlight-sentenceAlpha',
    'ztts-highlight-sentenceUnderWord',
  ],
  preview: 'ztts-highlight-preview',
  previewSentence: 'ztts-highlight-preview-sentence',
  previewWordSentence: 'ztts-highlight-preview-word-sentence',
  previewWord: 'ztts-highlight-preview-word',
  defaults: 'ztts-highlight-defaults',
} as const;

/** How the PDF view draws a highlight rectangle, by the theme's scheme. */
export const PAGE_RECT: Record<ColorScheme, { opacity: number; blend: string }> = {
  light: { opacity: 0.4, blend: 'multiply' },
  dark: { opacity: 0.3, blend: 'plus-lighter' },
};

/** Inline style for a preview span, or '' when the colour is not one. */
export function previewStyle(hex: string, alphaPercent: number, scheme: ColorScheme = 'light'): string {
  const color = highlightColor(hex, alphaPercent);
  if (!color) return '';
  const channel = (at: number) => parseInt(color.slice(at, at + 2), 16);
  const rect = PAGE_RECT[scheme];
  const alpha = Math.round((channel(7) / 255) * rect.opacity * 1000) / 1000;
  return `background-color: rgba(${channel(1)}, ${channel(3)}, ${channel(5)}, ${alpha}); mix-blend-mode: ${rect.blend};`;
}

const PREVIEW_BOX_STYLE =
  "border: 1px solid rgba(128, 128, 128, 0.4); border-radius: 4px; padding: 8px 12px; margin: 6px 0; max-width: 40em; font-family: Georgia, 'Times New Roman', serif; font-size: 13px; line-height: 1.7;";

/** Inline style for the sample page: the theme's colours on the box. */
export function previewBoxStyle(theme: { background: string; foreground: string }): string {
  return `${PREVIEW_BOX_STYLE} background: ${theme.background}; color: ${theme.foreground};`;
}

interface ElementLike {
  setAttribute(name: string, value: string): void;
  addEventListener(type: string, listener: () => void): void;
}

interface RowsDocument {
  getElementById(id: string): ElementLike | null;
}

export interface HighlightRowsDeps {
  /** The reader's current theme; read on every repaint. Absent means the default light theme. */
  theme?(): ResolvedReaderTheme;
}

export function initHighlightRows(doc: RowsDocument, prefs: PrefsBackend, deps: HighlightRowsDeps = {}): { refresh(): void } {
  const paint = (id: string, style: string) => doc.getElementById(id)?.setAttribute('style', style);

  const refresh = () => {
    const h = loadSettings(prefs).highlight;
    const theme = deps.theme?.() ?? { ...LIGHT_THEME, scheme: 'light' as const };
    paint(HIGHLIGHT_IDS.preview, previewBoxStyle(theme));
    const sentence = previewStyle(h.sentenceColor, h.sentenceAlpha, theme.scheme);
    paint(HIGHLIGHT_IDS.previewSentence, sentence);
    paint(HIGHLIGHT_IDS.previewWordSentence, h.sentenceUnderWord ? sentence : '');
    paint(HIGHLIGHT_IDS.previewWord, previewStyle(h.wordColor, h.wordAlpha, theme.scheme));
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
