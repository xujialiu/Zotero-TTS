import { describe, expect, it, vi } from 'vitest';
import type { ProviderId } from '../../src/core/providers/types';
import { PREF_PREFIX, type PrefsBackend } from '../../src/core/settings';
import { sampleTextForLocale } from '../../src/core/sample-text';
import type { CatalogEntry } from '../../src/read-aloud/catalog';
import { parseFavoriteVoices } from '../../src/read-aloud/favorites';
import { encodeVoiceId } from '../../src/read-aloud/voice-catalog';
import {
  blobToDataURL,
  createSamplePlayer,
  GLYPHS,
  initVoiceBrowserRows,
  VOICE_BROWSER_IDS,
  type VoiceBrowserDeps,
} from '../../src/ui/voice-browser-rows';

const FAVORITES_PREF = PREF_PREFIX + 'readAloud.favoriteVoices';

function fakePrefs(initial: Record<string, unknown> = {}): PrefsBackend & { store: Record<string, unknown> } {
  const store = { ...initial };
  return { store, get: (k) => store[k], set: (k, v) => void (store[k] = v) };
}

class FakeElement {
  attrs = new Map<string, string>();
  listeners = new Map<string, Array<() => unknown>>();
  children: FakeElement[] = [];
  textContent = '';
  constructor(public tag = '') {}
  setAttribute(k: string, v: string) {
    this.attrs.set(k, String(v));
  }
  getAttribute(k: string) {
    return this.attrs.get(k) ?? null;
  }
  addEventListener(type: string, fn: () => unknown) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type)!.push(fn);
  }
  appendChild(child: FakeElement) {
    this.children.push(child);
    return child;
  }
  replaceChildren(...nodes: FakeElement[]) {
    this.children = nodes;
  }
  async fire(type: string) {
    await Promise.all((this.listeners.get(type) ?? []).map((fn) => fn()));
  }
}

const CATALOG: CatalogEntry[] = [
  {
    provider: 'azure',
    voices: [
      { id: 'zh-CN-XiaoxiaoNeural', label: '晓晓', locale: 'zh-CN' },
      { id: 'en-US-AvaMultilingualNeural', label: 'Ava Multilingual', locale: 'mul' },
      { id: 'en-US-JennyNeural', label: 'Jenny', locale: 'en-US' },
    ],
  },
  { provider: 'openai', voices: [{ id: 'alloy', label: 'alloy', locale: 'mul' }] },
  { provider: 'local', name: 'Kokoro', voices: [{ id: 'af_bella', label: 'af_bella', locale: 'en-US' }] },
];

const LOCALE_NAMES: Record<string, string> = {
  mul: 'Multiple languages',
  'zh-CN': 'Chinese (China)',
  'en-US': 'English (United States)',
};

function setup(options: { prefs?: Record<string, unknown>; catalog?: CatalogEntry[] | Error } = {}) {
  const els = new Map((Object.values(VOICE_BROWSER_IDS) as string[]).map((id) => [id, new FakeElement()]));
  const doc = {
    getElementById: (id: string) => els.get(id) ?? null,
    createElementNS: (_ns: string, tag: string) => new FakeElement(tag),
  };
  const prefs = fakePrefs(options.prefs);
  const player = { play: vi.fn(async (_audio: Blob, _onDone: () => void) => {}), stop: vi.fn() };
  const deps = {
    prefs,
    listCatalog: vi.fn(async () => {
      if (options.catalog instanceof Error) throw options.catalog;
      return options.catalog ?? CATALOG;
    }),
    synthesizeSample: vi.fn(async (_provider: ProviderId, _voice: string, text: string) => new Blob([`audio:${text}`])),
    player,
    localeName: (code: string) => LOCALE_NAMES[code] ?? code,
  } satisfies VoiceBrowserDeps;
  const rows = initVoiceBrowserRows(doc, deps);
  const el = (id: string) => els.get(id)!;
  return {
    prefs,
    deps,
    player,
    rows,
    el,
    status: () => el(VOICE_BROWSER_IDS.status).attrs.get('value'),
    localeButtons: () => el(VOICE_BROWSER_IDS.locales).children,
    voiceRows: () => el(VOICE_BROWSER_IDS.voices).children,
    // A row is [play, heart, label]
    play: (i: number) => el(VOICE_BROWSER_IDS.voices).children[i].children[0],
    heart: (i: number) => el(VOICE_BROWSER_IDS.voices).children[i].children[1],
    label: (i: number) => el(VOICE_BROWSER_IDS.voices).children[i].children[2],
  };
}

describe('loading the catalog', () => {
  it('groups voices by locale, Multilingual first, the rest by display name', async () => {
    const t = setup();
    await t.rows.load();
    expect(t.localeButtons().map((b) => b.textContent)).toEqual([
      'Multiple languages (2)',
      'Chinese (China) (1)',
      'English (United States) (2)',
    ]);
    expect(t.status()).toContain('5 voices');
  });

  it('shows the first locale’s voices sorted by label, named without the TTS- prefix', async () => {
    const t = setup();
    await t.rows.load();
    expect(t.voiceRows().map((r) => r.children[2].textContent)).toEqual(['Azure-Ava Multilingual', 'OpenAI-alloy']);
  });

  it('switches the voice list when a locale is clicked', async () => {
    const t = setup();
    await t.rows.load();
    await t.localeButtons()[2].fire('click');
    expect(t.voiceRows().map((r) => r.children[2].textContent)).toEqual(['Azure-Jenny', 'Kokoro-af_bella']);
  });

  it('reports a catalog that could not be listed', async () => {
    const t = setup({ catalog: new Error('server down') });
    await t.rows.load();
    expect(t.status()).toContain('server down');
    expect(t.localeButtons()).toEqual([]);
  });

  it('points at the provider sections when there are no voices', async () => {
    const t = setup({ catalog: [] });
    await t.rows.load();
    expect(t.status()).toMatch(/provider/i);
  });

  it('reloads on the button', async () => {
    const t = setup();
    await t.rows.load();
    await t.el(VOICE_BROWSER_IDS.reload).fire('command');
    expect(t.deps.listCatalog).toHaveBeenCalledTimes(2);
  });

  it('tolerates a pane that lacks the rows', () => {
    const doc = { getElementById: () => null, createElementNS: () => new FakeElement() };
    expect(() => initVoiceBrowserRows(doc, setup().deps)).not.toThrow();
  });
});

describe('favorites', () => {
  const jenny = encodeVoiceId('azure', 'en-US-JennyNeural');

  it('paints the hearts from the pref', async () => {
    const t = setup({ prefs: { [FAVORITES_PREF]: JSON.stringify([jenny]) } });
    await t.rows.load();
    await t.localeButtons()[2].fire('click');
    expect(t.heart(0).textContent).toBe(GLYPHS.favorite);
    expect(t.heart(1).textContent).toBe(GLYPHS.notFavorite);
  });

  it('toggles the pref when a heart is clicked', async () => {
    const t = setup();
    await t.rows.load();
    await t.localeButtons()[2].fire('click');
    await t.heart(0).fire('click');
    expect(parseFavoriteVoices(t.prefs.store[FAVORITES_PREF])).toEqual([jenny]);
    expect(t.heart(0).textContent).toBe(GLYPHS.favorite);
    await t.heart(0).fire('click');
    expect(parseFavoriteVoices(t.prefs.store[FAVORITES_PREF])).toEqual([]);
    expect(t.heart(0).textContent).toBe(GLYPHS.notFavorite);
  });

  it('repaints from the pref on refresh, for a settings restore', async () => {
    const t = setup();
    await t.rows.load();
    await t.localeButtons()[2].fire('click');
    t.prefs.set(FAVORITES_PREF, JSON.stringify([jenny]));
    t.rows.refresh();
    expect(t.heart(0).textContent).toBe(GLYPHS.favorite);
  });
});

describe('playing a sample', () => {
  it('synthesizes the locale’s sample text with the voice and plays it', async () => {
    const t = setup();
    await t.rows.load();
    await t.localeButtons()[1].fire('click');
    await t.play(0).fire('click');
    expect(t.deps.synthesizeSample).toHaveBeenCalledWith('azure', 'zh-CN-XiaoxiaoNeural', sampleTextForLocale('zh-CN'));
    expect(t.player.play).toHaveBeenCalledOnce();
    expect(t.play(0).textContent).toBe(GLYPHS.stop);
  });

  it('gives multilingual voices the English-plus-Chinese sample', async () => {
    const t = setup();
    await t.rows.load();
    await t.play(0).fire('click');
    const text = t.deps.synthesizeSample.mock.calls[0][2];
    expect(text).toMatch(/Hello/);
    expect(text).toMatch(/你好/);
  });

  it('returns the button to play when the sample ends', async () => {
    const t = setup();
    await t.rows.load();
    await t.play(0).fire('click');
    const onDone = t.player.play.mock.calls[0][1];
    onDone();
    expect(t.play(0).textContent).toBe(GLYPHS.play);
  });

  it('stops when the playing voice is clicked again, without a second synthesis', async () => {
    const t = setup();
    await t.rows.load();
    await t.play(0).fire('click');
    await t.play(0).fire('click');
    expect(t.player.stop).toHaveBeenCalled();
    expect(t.deps.synthesizeSample).toHaveBeenCalledTimes(1);
  });

  it('replays from the session cache instead of paying twice', async () => {
    const t = setup();
    await t.rows.load();
    await t.play(0).fire('click');
    t.player.play.mock.calls[0][1]();
    await t.play(0).fire('click');
    expect(t.deps.synthesizeSample).toHaveBeenCalledTimes(1);
    expect(t.player.play).toHaveBeenCalledTimes(2);
  });

  it('stops the current sample when another voice is played', async () => {
    const t = setup();
    await t.rows.load();
    await t.play(0).fire('click');
    await t.play(1).fire('click');
    expect(t.player.stop).toHaveBeenCalled();
    expect(t.play(0).textContent).toBe(GLYPHS.play);
    expect(t.play(1).textContent).toBe(GLYPHS.stop);
  });

  it('says what failed and restores the button', async () => {
    const t = setup();
    t.deps.synthesizeSample.mockRejectedValueOnce(new Error('quota exhausted'));
    await t.rows.load();
    await t.play(0).fire('click');
    expect(t.status()).toContain('quota exhausted');
    expect(t.play(0).textContent).toBe(GLYPHS.play);
  });

  it('keeps the stop glyph on the playing voice across a locale switch and back', async () => {
    const t = setup();
    await t.rows.load();
    await t.play(0).fire('click');
    await t.localeButtons()[1].fire('click');
    await t.localeButtons()[0].fire('click');
    expect(t.play(0).textContent).toBe(GLYPHS.stop);
  });
});

describe('blobToDataURL', () => {
  it('encodes the bytes and the type', async () => {
    const url = await blobToDataURL(new Blob(['hi'], { type: 'audio/wav' }));
    expect(url).toBe(`data:audio/wav;base64,${Buffer.from('hi').toString('base64')}`);
  });

  it('falls back to audio/mpeg when the blob has no type', async () => {
    expect(await blobToDataURL(new Blob(['x']))).toMatch(/^data:audio\/mpeg;base64,/);
  });
});

describe('createSamplePlayer', () => {
  function fakeAudio() {
    const el = new FakeElement('audio') as FakeElement & { src?: string; play: () => Promise<void>; pause: () => void; removeAttribute: (k: string) => void };
    el.play = vi.fn(async () => {});
    el.pause = vi.fn();
    el.removeAttribute = vi.fn();
    return el;
  }

  it('plays the blob through a fresh element and reports the end once', async () => {
    const created: ReturnType<typeof fakeAudio>[] = [];
    const player = createSamplePlayer(() => {
      const el = fakeAudio();
      created.push(el);
      return el as unknown as HTMLAudioElement;
    });
    const onDone = vi.fn();
    await player.play(new Blob(['x'], { type: 'audio/wav' }), onDone);
    expect(created[0].src).toMatch(/^data:audio\/wav/);
    expect(created[0].play).toHaveBeenCalledOnce();
    await created[0].fire('ended');
    await created[0].fire('ended');
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('stop() silences the element and reports the end', async () => {
    const created: ReturnType<typeof fakeAudio>[] = [];
    const player = createSamplePlayer(() => {
      const el = fakeAudio();
      created.push(el);
      return el as unknown as HTMLAudioElement;
    });
    const onDone = vi.fn();
    await player.play(new Blob(['x']), onDone);
    player.stop();
    expect(created[0].pause).toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledOnce();
    player.stop();
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('a second play stops the first', async () => {
    const created: ReturnType<typeof fakeAudio>[] = [];
    const player = createSamplePlayer(() => {
      const el = fakeAudio();
      created.push(el);
      return el as unknown as HTMLAudioElement;
    });
    const first = vi.fn();
    const second = vi.fn();
    await player.play(new Blob(['x']), first);
    await player.play(new Blob(['y']), second);
    expect(created[0].pause).toHaveBeenCalled();
    expect(first).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();
  });
});
