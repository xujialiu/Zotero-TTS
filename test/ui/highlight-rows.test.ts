import { describe, expect, it } from 'vitest';
import { DEFAULT_THEMES, LIGHT_THEME, type ResolvedReaderTheme } from '../../src/core/reader-theme';
import { DEFAULTS, PREF_PREFIX, type PrefsBackend } from '../../src/core/settings';
import { HIGHLIGHT_IDS, initHighlightRows, previewBoxStyle, previewStyle } from '../../src/ui/highlight-rows';

function fakePrefs(initial: Record<string, unknown> = {}): PrefsBackend & { store: Record<string, unknown> } {
  const store = { ...initial };
  return { store, get: (k) => store[k], set: (k, v) => void (store[k] = v) };
}

class FakeElement {
  attrs = new Map<string, string>();
  listeners = new Map<string, Array<() => void>>();
  setAttribute(k: string, v: string) {
    this.attrs.set(k, String(v));
  }
  addEventListener(type: string, fn: () => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type)!.push(fn);
  }
  fire(type: string) {
    for (const fn of this.listeners.get(type) ?? []) fn();
  }
  get style() {
    return this.attrs.get('style');
  }
}

const IDS: string[] = [
  ...HIGHLIGHT_IDS.inputs,
  HIGHLIGHT_IDS.preview,
  HIGHLIGHT_IDS.previewSentence,
  HIGHLIGHT_IDS.previewWordSentence,
  HIGHLIGHT_IDS.previewWord,
  HIGHLIGHT_IDS.defaults,
];
const key = (name: string) => `${PREF_PREFIX}highlight.${name}`;

const LIGHT: ResolvedReaderTheme = { ...LIGHT_THEME, scheme: 'light' };
const DARK: ResolvedReaderTheme = { ...DEFAULT_THEMES[0], scheme: 'dark' };

function setup(initial: Record<string, unknown> = {}, theme: ResolvedReaderTheme | undefined = LIGHT) {
  const els = new Map(IDS.map((id) => [id, new FakeElement()]));
  const doc = { getElementById: (id: string) => els.get(id) ?? null };
  const prefs = fakePrefs(initial);
  let current = theme;
  const rows = initHighlightRows(doc, prefs, theme ? { theme: () => current! } : {});
  return {
    rows,
    prefs,
    setTheme: (t: ResolvedReaderTheme) => void (current = t),
    el: (id: string) => els.get(id)!,
    box: () => els.get(HIGHLIGHT_IDS.preview)!.style,
    sentence: () => els.get(HIGHLIGHT_IDS.previewSentence)!.style,
    wordSentence: () => els.get(HIGHLIGHT_IDS.previewWordSentence)!.style,
    word: () => els.get(HIGHLIGHT_IDS.previewWord)!.style,
  };
}

const CYAN_WORD = 'background-color: rgba(0, 255, 255, 0.18); mix-blend-mode: multiply;';
const PINK_SENTENCE = 'background-color: rgba(255, 128, 192, 0.121); mix-blend-mode: multiply;';
const ZOTERO_WORD = 'background-color: rgba(64, 114, 229, 0.18); mix-blend-mode: multiply;';
// The plugin's defaults: 100% -> 0xff, drawn at 0.4
const DEFAULT_WORD = 'background-color: rgba(0, 255, 0, 0.4); mix-blend-mode: multiply;';
const DEFAULT_SENTENCE = 'background-color: rgba(255, 255, 0, 0.4); mix-blend-mode: multiply;';
const CYAN_WORD_DARK = 'background-color: rgba(0, 255, 255, 0.135); mix-blend-mode: plus-lighter;';
const PINK_SENTENCE_DARK = 'background-color: rgba(255, 128, 192, 0.091); mix-blend-mode: plus-lighter;';

describe('previewStyle', () => {
  it("folds the reader's rectangle opacity into the color and multiplies it onto a light page", () => {
    // 45% -> 0x73 = 115/255 = 0.451, drawn at 0.4 -> 0.18
    expect(previewStyle('#00ffff', 45)).toBe(CYAN_WORD);
    expect(previewStyle('#ff80c0', 30)).toBe(PINK_SENTENCE);
    expect(previewStyle('#4072e5', 45, 'light')).toBe(ZOTERO_WORD);
  });

  it('draws at 0.3 and adds the color on a dark page, as the reader does', () => {
    expect(previewStyle('#00ffff', 45, 'dark')).toBe(CYAN_WORD_DARK);
    expect(previewStyle('#ff80c0', 30, 'dark')).toBe(PINK_SENTENCE_DARK);
  });

  it('paints nothing for a color that is not one', () => {
    expect(previewStyle('bright red', 45)).toBe('');
    expect(previewStyle('', 45, 'dark')).toBe('');
  });

  it("gives the sample page the theme's colors", () => {
    expect(previewBoxStyle(DARK)).toMatch(/ background: #2E3440; color: #D8DEE9;$/);
    expect(previewBoxStyle(LIGHT)).toMatch(/ background: #ffffff; color: #121212;$/);
  });
});

describe('initHighlightRows', () => {
  const cyanPink = {
    [key('wordColor')]: '#00ffff',
    [key('wordAlpha')]: 45,
    [key('sentenceColor')]: '#ff80c0',
    [key('sentenceAlpha')]: 30,
    [key('sentenceUnderWord')]: true,
  };

  it('paints the sample from the prefs: the sentence, and the word with the sentence under it', () => {
    const t = setup(cyanPink);
    expect(t.box()).toMatch(/background: #ffffff; color: #121212;$/);
    expect(t.sentence()).toBe(PINK_SENTENCE);
    expect(t.word()).toBe(CYAN_WORD);
    expect(t.wordSentence()).toBe(PINK_SENTENCE);
  });

  it("paints the sample in the reader's theme, blended for a dark page when the theme is dark", () => {
    const t = setup(cyanPink, DARK);
    expect(t.box()).toMatch(/background: #2E3440; color: #D8DEE9;$/);
    expect(t.word()).toBe(CYAN_WORD_DARK);
    expect(t.sentence()).toBe(PINK_SENTENCE_DARK);
    expect(t.wordSentence()).toBe(PINK_SENTENCE_DARK);
  });

  it('re-reads the theme on every repaint', () => {
    const t = setup(cyanPink);
    t.setTheme(DARK);
    t.rows.refresh();
    expect(t.box()).toMatch(/background: #2E3440;/);
    expect(t.word()).toBe(CYAN_WORD_DARK);
  });

  it('assumes the default light theme when none is supplied', () => {
    const t = setup(cyanPink, undefined);
    expect(t.box()).toMatch(/background: #ffffff; color: #121212;$/);
    expect(t.word()).toBe(CYAN_WORD);
  });

  it('shows no sentence under the word while the switch is off', () => {
    const t = setup({ ...cyanPink, [key('sentenceUnderWord')]: false });
    expect(t.word()).toBe(CYAN_WORD);
    expect(t.wordSentence()).toBe('');
    expect(t.sentence()).toBe(PINK_SENTENCE);
  });

  it('starts from the defaults when nothing is stored: a green word on a yellow sentence, the sentence kept under the word', () => {
    const t = setup();
    expect(t.word()).toBe(DEFAULT_WORD);
    expect(t.sentence()).toBe(DEFAULT_SENTENCE);
    expect(t.wordSentence()).toBe(DEFAULT_SENTENCE);
  });

  it('repaints when an input or the switch fires, after Zotero has written the pref', () => {
    const t = setup(cyanPink);
    t.prefs.set(key('wordColor'), '#ff0000');
    t.el('ztts-highlight-wordColor').fire('input');
    expect(t.word()).toBe('background-color: rgba(255, 0, 0, 0.18); mix-blend-mode: multiply;');
    t.prefs.set(key('sentenceAlpha'), 100);
    t.el('ztts-highlight-sentenceAlpha').fire('change');
    expect(t.sentence()).toBe('background-color: rgba(255, 128, 192, 0.4); mix-blend-mode: multiply;');
    t.prefs.set(key('sentenceUnderWord'), false);
    t.el('ztts-highlight-sentenceUnderWord').fire('command');
    expect(t.wordSentence()).toBe('');
  });

  it('restores the defaults into the prefs, the switch included, and repaints', () => {
    const t = setup({ ...cyanPink, [key('sentenceUnderWord')]: false });
    t.el(HIGHLIGHT_IDS.defaults).fire('command');
    for (const [k, v] of Object.entries(DEFAULTS.highlight)) expect(t.prefs.store[key(k)], k).toBe(v);
    expect(t.word()).toBe(DEFAULT_WORD);
    expect(t.sentence()).toBe(DEFAULT_SENTENCE);
    expect(t.wordSentence()).toBe(DEFAULT_SENTENCE);
  });

  it('leaves an invalid color unpainted and exposes refresh() for a restore from a backup', () => {
    const t = setup({ ...cyanPink, [key('wordColor')]: 'nope' });
    expect(t.word()).toBe('');
    t.prefs.set(key('wordColor'), '#00ff00');
    t.rows.refresh();
    expect(t.word()).toBe('background-color: rgba(0, 255, 0, 0.18); mix-blend-mode: multiply;');
  });

  it('tolerates a pane that lacks the rows', () => {
    expect(() => initHighlightRows({ getElementById: () => null }, fakePrefs())).not.toThrow();
  });
});
