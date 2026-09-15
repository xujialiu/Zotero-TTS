import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { HIGHLIGHT_SWITCH_OBSERVERS } from '../../src/core/highlight-level';
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
  removeAttribute(k: string) {
    this.attrs.delete(k);
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
  get disabled() {
    return this.attrs.get('disabled') === 'true';
  }
}

const IDS: string[] = [
  ...HIGHLIGHT_IDS.inputs,
  HIGHLIGHT_IDS.preview,
  HIGHLIGHT_IDS.previewWordBefore,
  HIGHLIGHT_IDS.previewWordAfter,
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
  // The switch prefs' observers, as Zotero would register them: the key and a restore write them behind the pane's back
  const watchers = new Map<string, () => void>();
  const unwatch = vi.fn();
  const rows = initHighlightRows(doc, prefs, {
    ...(theme ? { theme: () => current! } : {}),
    watch: (name, onChange) => {
      watchers.set(name, onChange);
      return unwatch;
    },
  });
  return {
    rows,
    prefs,
    watchers,
    unwatch,
    setTheme: (t: ResolvedReaderTheme) => void (current = t),
    el: (id: string) => els.get(id)!,
    box: () => els.get(HIGHLIGHT_IDS.preview)!.style,
    before: () => els.get(HIGHLIGHT_IDS.previewWordBefore)!.style,
    after: () => els.get(HIGHLIGHT_IDS.previewWordAfter)!.style,
    word: () => els.get(HIGHLIGHT_IDS.previewWord)!.style,
    disabled: (id: string) => els.get(id)!.disabled,
  };
}

const CYAN_WORD = 'background-color: rgba(0, 255, 255, 0.18); mix-blend-mode: multiply;';
const PINK_SENTENCE = 'background-color: rgba(255, 128, 192, 0.121); mix-blend-mode: multiply;';
const ZOTERO_WORD = 'background-color: rgba(64, 114, 229, 0.18); mix-blend-mode: multiply;';
// The plugin's defaults: 70% -> 0xb3 = 179/255 = 0.702, drawn at 0.4 -> 0.281
const DEFAULT_WORD = 'background-color: rgba(52, 120, 246, 0.281); mix-blend-mode: multiply;';
const DEFAULT_SENTENCE = 'background-color: rgba(255, 255, 0, 0.281); mix-blend-mode: multiply;';
const CYAN_WORD_DARK = 'background-color: rgba(0, 255, 255, 0.135); mix-blend-mode: plus-lighter;';
const PINK_SENTENCE_DARK = 'background-color: rgba(255, 128, 192, 0.091); mix-blend-mode: plus-lighter;';

const SENTENCE = HIGHLIGHT_IDS.switches.sentence;
const WORD = HIGHLIGHT_IDS.switches.word;

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
  };

  it('names the two switches and their rows', () => {
    expect(HIGHLIGHT_IDS.switches).toEqual({ sentence: 'ztts-highlight-sentence', word: 'ztts-highlight-word' });
    expect(HIGHLIGHT_IDS.rows).toEqual({
      sentence: ['ztts-highlight-sentenceColor', 'ztts-highlight-sentenceAlpha'],
      word: ['ztts-highlight-wordColor', 'ztts-highlight-wordAlpha'],
    });
    expect(HIGHLIGHT_IDS.inputs).toEqual([SENTENCE, WORD, ...HIGHLIGHT_IDS.rows.sentence, ...HIGHLIGHT_IDS.rows.word]);
  });

  it('paints the sample from the prefs with both switches on: the word, with the sentence around it', () => {
    const t = setup(cyanPink);
    expect(t.box()).toMatch(/background: #ffffff; color: #121212;$/);
    expect(t.word()).toBe(CYAN_WORD);
    expect(t.before()).toBe(PINK_SENTENCE);
    expect(t.after()).toBe(PINK_SENTENCE);
    for (const id of HIGHLIGHT_IDS.inputs) expect(t.disabled(id), id).toBe(false);
  });

  it("paints the sample in the reader's theme, blended for a dark page when the theme is dark", () => {
    const t = setup(cyanPink, DARK);
    expect(t.box()).toMatch(/background: #2E3440; color: #D8DEE9;$/);
    expect(t.word()).toBe(CYAN_WORD_DARK);
    expect(t.before()).toBe(PINK_SENTENCE_DARK);
    expect(t.after()).toBe(PINK_SENTENCE_DARK);
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

  it("Sentence off: the word alone, the sentence row greyed, and the Word switch — the last one on — greyed too", () => {
    const t = setup({ ...cyanPink, [key('sentence')]: false });
    expect(t.word()).toBe(CYAN_WORD);
    expect(t.before()).toBe('');
    expect(t.after()).toBe('');
    for (const id of HIGHLIGHT_IDS.rows.sentence) expect(t.disabled(id), id).toBe(true);
    for (const id of HIGHLIGHT_IDS.rows.word) expect(t.disabled(id), id).toBe(false);
    expect(t.disabled(WORD)).toBe(true);
    expect(t.disabled(SENTENCE)).toBe(false);
  });

  it('Word off: the whole sentence in the sentence color, the word row greyed, the Sentence switch greyed', () => {
    const t = setup({ ...cyanPink, [key('word')]: false });
    expect(t.word()).toBe(PINK_SENTENCE);
    expect(t.before()).toBe(PINK_SENTENCE);
    expect(t.after()).toBe(PINK_SENTENCE);
    for (const id of HIGHLIGHT_IDS.rows.word) expect(t.disabled(id), id).toBe(true);
    for (const id of HIGHLIGHT_IDS.rows.sentence) expect(t.disabled(id), id).toBe(false);
    expect(t.disabled(SENTENCE)).toBe(true);
    expect(t.disabled(WORD)).toBe(false);
  });

  it('both off in the prefs — a hand-edited profile — paints and greys as Word off', () => {
    const t = setup({ ...cyanPink, [key('sentence')]: false, [key('word')]: false });
    expect(t.word()).toBe(PINK_SENTENCE);
    expect(t.before()).toBe(PINK_SENTENCE);
    expect(t.disabled(SENTENCE)).toBe(true);
    expect(t.disabled(WORD)).toBe(false);
    // and the Sentence pref is written back on, so its checkbox agrees with the screen
    expect(t.prefs.store[key('sentence')]).toBe(true);
    expect(t.prefs.store[key('word')]).toBe(false);
  });

  it('starts from the defaults when nothing is stored: a blue word on a yellow sentence, both on', () => {
    const t = setup();
    expect(t.word()).toBe(DEFAULT_WORD);
    expect(t.before()).toBe(DEFAULT_SENTENCE);
    expect(t.after()).toBe(DEFAULT_SENTENCE);
    expect(t.disabled(SENTENCE)).toBe(false);
    expect(t.disabled(WORD)).toBe(false);
  });

  it('repaints when an input or a switch fires, after Zotero has written the pref', () => {
    const t = setup(cyanPink);
    t.prefs.set(key('wordColor'), '#ff0000');
    t.el('ztts-highlight-wordColor').fire('input');
    expect(t.word()).toBe('background-color: rgba(255, 0, 0, 0.18); mix-blend-mode: multiply;');
    t.prefs.set(key('sentenceAlpha'), 100);
    t.el('ztts-highlight-sentenceAlpha').fire('change');
    expect(t.before()).toBe('background-color: rgba(255, 128, 192, 0.4); mix-blend-mode: multiply;');
    t.prefs.set(key('sentence'), false);
    t.el(SENTENCE).fire('command');
    expect(t.before()).toBe('');
    expect(t.after()).toBe('');
    expect(t.disabled(WORD)).toBe(true);
  });

  it('repaints when a switch pref changes behind its back — the key, a restore, the sync', () => {
    const t = setup(cyanPink);
    expect([...t.watchers.keys()].sort()).toEqual([HIGHLIGHT_SWITCH_OBSERVERS.sentence, HIGHLIGHT_SWITCH_OBSERVERS.word].sort());
    t.prefs.set(key('word'), false);
    t.watchers.get(HIGHLIGHT_SWITCH_OBSERVERS.word)!();
    expect(t.word()).toBe(PINK_SENTENCE);
    expect(t.disabled(SENTENCE)).toBe(true);
    for (const id of HIGHLIGHT_IDS.rows.word) expect(t.disabled(id), id).toBe(true);
    t.rows.dispose();
    expect(t.unwatch).toHaveBeenCalledTimes(2);
  });

  it('restores the defaults into the prefs, the switches included, and repaints', () => {
    const t = setup({ ...cyanPink, [key('sentence')]: false });
    t.el(HIGHLIGHT_IDS.defaults).fire('command');
    for (const [k, v] of Object.entries(DEFAULTS.highlight)) expect(t.prefs.store[key(k)], k).toBe(v);
    expect(t.word()).toBe(DEFAULT_WORD);
    expect(t.before()).toBe(DEFAULT_SENTENCE);
    expect(t.after()).toBe(DEFAULT_SENTENCE);
    expect(t.disabled(WORD)).toBe(false);
    for (const id of HIGHLIGHT_IDS.rows.sentence) expect(t.disabled(id), id).toBe(false);
  });

  it('leaves an invalid color unpainted and exposes refresh() for a restore from a backup', () => {
    const t = setup({ ...cyanPink, [key('wordColor')]: 'nope' });
    expect(t.word()).toBe('');
    t.prefs.set(key('wordColor'), '#00ff00');
    t.rows.refresh();
    expect(t.word()).toBe('background-color: rgba(0, 255, 0, 0.18); mix-blend-mode: multiply;');
  });

  it('tolerates a pane that lacks the rows, and a pane with no observer wiring', () => {
    expect(() => initHighlightRows({ getElementById: () => null }, fakePrefs())).not.toThrow();
    const rows = initHighlightRows({ getElementById: () => null }, fakePrefs());
    expect(() => rows.dispose()).not.toThrow();
  });

  // An id that only the markup or only this module has leaves the preview
  // silently unpainted; nothing else notices
  it('finds every element it paints in the pane markup, and the old sentence-under-word row is gone', () => {
    const markup = readFileSync(new URL('../../addon/content/preferences.xhtml', import.meta.url), 'utf8');
    for (const id of IDS) expect(markup, id).toContain(`id="${id}"`);
    expect(markup).not.toContain('sentenceUnderWord');
    expect(markup).not.toContain('ztts-highlight-preview-sentence');
  });
});
