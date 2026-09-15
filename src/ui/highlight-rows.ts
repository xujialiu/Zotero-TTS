import { HIGHLIGHT_SWITCH_OBSERVERS, HIGHLIGHT_SWITCH_PREFS, readHighlightLevels } from '../core/highlight-level';
import { LIGHT_THEME, type ColorScheme, type ResolvedReaderTheme } from '../core/reader-theme';
import { DEFAULTS, loadSettings, PREF_PREFIX, type PrefsBackend } from '../core/settings';
import { highlightColor } from '../read-aloud/highlight-style';

/**
 * The Highlight group's two switches, its preview and its Restore button.
 * Each level — the sentence, the word — has a row: a `preference=`-bound
 * checkbox that turns it on or off (issue #114), then its color and
 * opacity. The inputs write the prefs themselves (Zotero's listeners,
 * attached when the pane was built, run before these), so the rows only
 * listen for their events, and for the switch prefs changing behind the
 * pane's back — the key, a restore from a backup, the settings sync — to
 * repaint the preview and grey what a switch leaves unused: the color and
 * opacity of a level that is off, and the last switch still on, which
 * cannot be turned off (both off is not a state; core/highlight-level.ts).
 *
 * The preview is a sample sentence in the reader's current theme (the one
 * the PDF and EPUB views share, core/reader-theme.ts), with the highlights
 * blended as the PDF view blends its rectangles: in a light theme the
 * color at its opacity, drawn at 0.4 and multiplied onto the page; in a
 * dark theme drawn at 0.3 and added (`plus-lighter`). Here that is one
 * rgba background with the 0.4 or 0.3 folded in and the blend mode on the
 * span, which leaves the text as the reader's rectangle over it would.
 * With both switches on the sentence is drawn as the piece before and the
 * piece after the word, never under it, so the word is the color that was
 * picked — as the reader draws it (read-aloud/highlight-style.ts); with
 * the Word switch off the whole sentence takes the sentence color, and
 * with the Sentence switch off the word stands alone.
 */

export const HIGHLIGHT_IDS = {
  switches: { sentence: 'ztts-highlight-sentence', word: 'ztts-highlight-word' },
  rows: {
    sentence: ['ztts-highlight-sentenceColor', 'ztts-highlight-sentenceAlpha'],
    word: ['ztts-highlight-wordColor', 'ztts-highlight-wordAlpha'],
  },
  inputs: [
    'ztts-highlight-sentence',
    'ztts-highlight-word',
    'ztts-highlight-sentenceColor',
    'ztts-highlight-sentenceAlpha',
    'ztts-highlight-wordColor',
    'ztts-highlight-wordAlpha',
  ],
  preview: 'ztts-highlight-preview',
  previewWordBefore: 'ztts-highlight-preview-word-before',
  previewWordAfter: 'ztts-highlight-preview-word-after',
  previewWord: 'ztts-highlight-preview-word',
  defaults: 'ztts-highlight-defaults',
} as const;

/** How the PDF view draws a highlight rectangle, by the theme's scheme. */
export const PAGE_RECT: Record<ColorScheme, { opacity: number; blend: string }> = {
  light: { opacity: 0.4, blend: 'multiply' },
  dark: { opacity: 0.3, blend: 'plus-lighter' },
};

/** Inline style for a preview span, or '' when the color is not one. */
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

/** Inline style for the sample page: the theme's colors on the box. */
export function previewBoxStyle(theme: { background: string; foreground: string }): string {
  return `${PREVIEW_BOX_STYLE} background: ${theme.background}; color: ${theme.foreground};`;
}

interface ElementLike {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  addEventListener(type: string, listener: () => void): void;
}

interface RowsDocument {
  getElementById(id: string): ElementLike | null;
}

export interface HighlightRowsDeps {
  /** The reader's current theme; read on every repaint. Absent means the default light theme. */
  theme?(): ResolvedReaderTheme;
  /** `Zotero.Prefs.registerObserver` on a name relative to `extensions.zotero.`; returns the unregister. Absent means no repaint on a change made elsewhere. */
  watch?(name: string, onChange: () => void): () => void;
}

export interface HighlightRows {
  refresh(): void;
  dispose(): void;
}

export function initHighlightRows(doc: RowsDocument, prefs: PrefsBackend, deps: HighlightRowsDeps = {}): HighlightRows {
  const paint = (id: string, style: string) => doc.getElementById(id)?.setAttribute('style', style);
  const setDisabled = (id: string, disabled: boolean) => {
    const el = doc.getElementById(id);
    if (!el) return;
    if (disabled) el.setAttribute('disabled', 'true');
    else el.removeAttribute('disabled');
  };

  const refresh = () => {
    const h = loadSettings(prefs).highlight;
    const levels = readHighlightLevels(prefs);
    // Both off in the prefs — a hand-edited profile — reads as the sentence: write it back so the checkbox agrees
    if (!h.sentence && !h.word) prefs.set(HIGHLIGHT_SWITCH_PREFS.sentence, true);
    const theme = deps.theme?.() ?? { ...LIGHT_THEME, scheme: 'light' as const };
    paint(HIGHLIGHT_IDS.preview, previewBoxStyle(theme));
    const sentence = previewStyle(h.sentenceColor, h.sentenceAlpha, theme.scheme);
    const word = previewStyle(h.wordColor, h.wordAlpha, theme.scheme);
    paint(HIGHLIGHT_IDS.previewWordBefore, levels.sentence ? sentence : '');
    paint(HIGHLIGHT_IDS.previewWordAfter, levels.sentence ? sentence : '');
    paint(HIGHLIGHT_IDS.previewWord, levels.word ? word : sentence);
    // The last switch on cannot be turned off; a level that is off has no use for its color
    setDisabled(HIGHLIGHT_IDS.switches.sentence, levels.sentence && !levels.word);
    setDisabled(HIGHLIGHT_IDS.switches.word, levels.word && !levels.sentence);
    for (const id of HIGHLIGHT_IDS.rows.sentence) setDisabled(id, !levels.sentence);
    for (const id of HIGHLIGHT_IDS.rows.word) setDisabled(id, !levels.word);
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
  const unwatch: Array<() => void> = [];
  if (deps.watch) {
    for (const name of Object.values(HIGHLIGHT_SWITCH_OBSERVERS)) unwatch.push(deps.watch(name, refresh));
  }
  refresh();

  return {
    refresh,
    dispose: () => {
      for (const off of unwatch.splice(0)) off();
    },
  };
}
