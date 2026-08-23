import { describe, expect, it } from 'vitest';
import { DEFAULTS, PREF_PREFIX, type PrefsBackend } from '../../src/core/settings';
import { HIGHLIGHT_IDS, initHighlightRows, previewStyle } from '../../src/ui/highlight-rows';

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

const IDS: string[] = [...HIGHLIGHT_IDS.inputs, HIGHLIGHT_IDS.previewSentence, HIGHLIGHT_IDS.previewWordSentence, HIGHLIGHT_IDS.previewWord, HIGHLIGHT_IDS.defaults];
const key = (name: string) => `${PREF_PREFIX}highlight.${name}`;

function setup(initial: Record<string, unknown> = {}) {
  const els = new Map(IDS.map((id) => [id, new FakeElement()]));
  const doc = { getElementById: (id: string) => els.get(id) ?? null };
  const prefs = fakePrefs(initial);
  const rows = initHighlightRows(doc, prefs);
  return {
    rows,
    prefs,
    el: (id: string) => els.get(id)!,
    sentence: () => els.get(HIGHLIGHT_IDS.previewSentence)!.style,
    wordSentence: () => els.get(HIGHLIGHT_IDS.previewWordSentence)!.style,
    word: () => els.get(HIGHLIGHT_IDS.previewWord)!.style,
  };
}

const CYAN_WORD = 'background-color: rgba(0, 255, 255, 0.18); mix-blend-mode: multiply;';
const PINK_SENTENCE = 'background-color: rgba(255, 128, 192, 0.121); mix-blend-mode: multiply;';
const ZOTERO_WORD = 'background-color: rgba(64, 114, 229, 0.18); mix-blend-mode: multiply;';
const ZOTERO_SENTENCE = 'background-color: rgba(64, 114, 229, 0.121); mix-blend-mode: multiply;';

describe('previewStyle', () => {
  it("folds the reader's rectangle opacity into the colour and multiplies it onto the page", () => {
    // 45% -> 0x73 = 115/255 = 0.451, drawn at 0.4 -> 0.18
    expect(previewStyle('#00ffff', 45)).toBe(CYAN_WORD);
    expect(previewStyle('#ff80c0', 30)).toBe(PINK_SENTENCE);
    expect(previewStyle('#4072e5', 45)).toBe(ZOTERO_WORD);
  });

  it('paints nothing for a colour that is not one', () => {
    expect(previewStyle('bright red', 45)).toBe('');
    expect(previewStyle('', 45)).toBe('');
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
    expect(t.sentence()).toBe(PINK_SENTENCE);
    expect(t.word()).toBe(CYAN_WORD);
    expect(t.wordSentence()).toBe(PINK_SENTENCE);
  });

  it('shows no sentence under the word while the switch is off', () => {
    const t = setup({ ...cyanPink, [key('sentenceUnderWord')]: false });
    expect(t.word()).toBe(CYAN_WORD);
    expect(t.wordSentence()).toBe('');
    expect(t.sentence()).toBe(PINK_SENTENCE);
  });

  it("starts from Zotero's own colours when nothing is stored", () => {
    const t = setup();
    expect(t.word()).toBe(ZOTERO_WORD);
    expect(t.sentence()).toBe(ZOTERO_SENTENCE);
    expect(t.wordSentence()).toBe('');
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

  it("restores Zotero's colours into the prefs and repaints", () => {
    const t = setup(cyanPink);
    t.el(HIGHLIGHT_IDS.defaults).fire('command');
    for (const [k, v] of Object.entries(DEFAULTS.highlight)) expect(t.prefs.store[key(k)], k).toBe(v);
    expect(t.word()).toBe(ZOTERO_WORD);
    expect(t.sentence()).toBe(ZOTERO_SENTENCE);
    expect(t.wordSentence()).toBe('');
  });

  it('leaves an invalid colour unpainted and exposes refresh() for a restore from a backup', () => {
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
