import { describe, expect, it, vi } from 'vitest';
import type { ProviderId } from '../../src/core/providers/types';
import { PREF_PREFIX, type PrefsBackend } from '../../src/core/settings';
import { sampleTextForLocale } from '../../src/core/sample-text';
import type { CatalogEntry } from '../../src/read-aloud/catalog';
import { parseFavoriteVoices } from '../../src/read-aloud/favorites';
import { encodeVoiceId } from '../../src/read-aloud/voice-catalog';
import type { ZoteroVoice } from '../../src/read-aloud/zotero-voices';
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

// Zotero's own cloud voices, as its tts/voices catalog publishes them
const ZOTERO_VOICES: ZoteroVoice[] = [
  { id: 'zotero-premium-aria', label: 'Aria', locale: 'en-US', tier: 'premium' },
  { id: 'zotero-standard-ava', label: 'Ava', locale: 'en-US', tier: 'standard' },
  { id: 'zotero-standard-andrew', label: 'Andrew', locale: 'en-US', tier: 'standard' },
  { id: 'zotero-standard-ben', label: 'Ben', locale: 'de-DE', tier: 'standard' },
];

const LOCALE_NAMES: Record<string, string> = {
  mul: 'Multiple languages',
  'zh-CN': 'Chinese (China)',
  'en-US': 'English (United States)',
  'de-DE': 'German (Germany)',
};

function setup(
  options: { prefs?: Record<string, unknown>; catalog?: CatalogEntry[] | Error; zotero?: ZoteroVoice[] | Error } = {},
) {
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
    listZoteroVoices: vi.fn(async () => {
      if (options.zotero instanceof Error) throw options.zotero;
      return options.zotero ?? ZOTERO_VOICES;
    }),
    sampleZoteroVoice: vi.fn(async (voiceId: string) => new Blob([`zotero:${voiceId}`])),
    player,
    localeName: (code: string) => LOCALE_NAMES[code] ?? code,
  } satisfies VoiceBrowserDeps;
  const rows = initVoiceBrowserRows(doc, deps);
  const el = (id: string) => els.get(id)!;
  const texts = (nodes: FakeElement[]) => nodes.map((n) => n.textContent);
  return {
    prefs,
    deps,
    player,
    rows,
    el,
    status: () => el(VOICE_BROWSER_IDS.status).attrs.get('value'),
    tierButtons: () => el(VOICE_BROWSER_IDS.tiers).children,
    tiers: () => texts(el(VOICE_BROWSER_IDS.tiers).children),
    localeButtons: () => el(VOICE_BROWSER_IDS.locales).children,
    locales: () => texts(el(VOICE_BROWSER_IDS.locales).children),
    voiceRows: () => el(VOICE_BROWSER_IDS.voices).children,
    labels: () => el(VOICE_BROWSER_IDS.voices).children.map((r) => r.children[2].textContent),
    // A row is [play, heart, label]
    play: (i: number) => el(VOICE_BROWSER_IDS.voices).children[i].children[0],
    heart: (i: number) => el(VOICE_BROWSER_IDS.voices).children[i].children[1],
    label: (i: number) => el(VOICE_BROWSER_IDS.voices).children[i].children[2],
    /** Click a column entry by its label, whatever its position. */
    pickTier: (label: string) => el(VOICE_BROWSER_IDS.tiers).children.find((b) => b.textContent.startsWith(label))!.fire('click'),
    pickLocale: (name: string) => el(VOICE_BROWSER_IDS.locales).children.find((b) => b.textContent.startsWith(name))!.fire('click'),
  };
}

describe('the tier column', () => {
  // Three tiers, in the order of Zotero's own Voice Mode dropdown, always all
  // three: an empty one reads "(0)" instead of disappearing and shifting the
  // others under the pointer.
  it('lists the three tiers with their voice counts', async () => {
    const t = setup();
    await t.rows.load();
    expect(t.tiers()).toEqual(['Standard (3)', 'Premium (1)', 'Local (5)']);
  });

  it('starts on the plugin’s own tier, since this is the plugin’s pane', async () => {
    const t = setup();
    await t.rows.load();
    expect(t.locales()).toEqual(['Multiple languages (2)', 'Chinese (China) (1)', 'English (United States) (2)']);
    expect(t.labels()).toEqual(['Azure-Ava Multilingual', 'OpenAI-alloy']);
  });

  it('starts on the first tier that has voices when the plugin publishes none', async () => {
    const t = setup({ catalog: [] });
    await t.rows.load();
    expect(t.locales()).toEqual(['English (United States) (2)', 'German (Germany) (1)']);
    expect(t.labels()).toEqual(['Andrew', 'Ava']);
  });

  it('switches languages and voices when a tier is clicked', async () => {
    const t = setup();
    await t.rows.load();
    await t.pickTier('Premium');
    expect(t.locales()).toEqual(['English (United States) (1)']);
    expect(t.labels()).toEqual(['Aria']);
  });

  // Standard and Premium mostly speak the same languages; landing back on the
  // tier's first language after every switch would make comparing two tiers
  // in one language tedious.
  it('keeps the chosen language across a tier switch when the new tier has it', async () => {
    const t = setup();
    await t.rows.load();
    await t.pickLocale('English');
    await t.pickTier('Standard');
    expect(t.labels()).toEqual(['Andrew', 'Ava']);
    await t.pickTier('Premium');
    expect(t.labels()).toEqual(['Aria']);
  });

  it('falls back to the new tier’s first language when it lacks the chosen one', async () => {
    const t = setup();
    await t.rows.load();
    expect(t.labels()).toEqual(['Azure-Ava Multilingual', 'OpenAI-alloy']);
    await t.pickTier('Standard');
    expect(t.locales()[0]).toBe('English (United States) (2)');
    expect(t.labels()).toEqual(['Andrew', 'Ava']);
  });

  it('shows an empty tier as empty, without breaking', async () => {
    const t = setup({ zotero: [] });
    await t.rows.load();
    expect(t.tiers()).toEqual(['Standard (0)', 'Premium (0)', 'Local (5)']);
    await t.pickTier('Premium');
    expect(t.locales()).toEqual([]);
    expect(t.labels()).toEqual([]);
  });
});

describe('loading the catalog', () => {
  it('groups a tier’s voices by locale, Multilingual first, the rest by display name', async () => {
    const t = setup();
    await t.rows.load();
    expect(t.locales()).toEqual(['Multiple languages (2)', 'Chinese (China) (1)', 'English (United States) (2)']);
    expect(t.status()).toContain('9 voices');
  });

  it('shows the voices sorted by label, the plugin’s named without the TTS- prefix', async () => {
    const t = setup();
    await t.rows.load();
    await t.pickLocale('English');
    expect(t.labels()).toEqual(['Azure-Jenny', 'Kokoro-af_bella']);
  });

  it('reports a catalog that could not be listed', async () => {
    const t = setup({ catalog: new Error('server down'), zotero: [] });
    await t.rows.load();
    expect(t.status()).toContain('server down');
    expect(t.localeButtons()).toEqual([]);
  });

  // Either side may fail alone: a provider that cannot list must not hide
  // Zotero's voices, and Zotero being unreachable must not hide the plugin's.
  it('keeps the plugin’s voices and says so when Zotero’s cannot be listed', async () => {
    const t = setup({ zotero: new Error('not signed in') });
    await t.rows.load();
    expect(t.tiers()).toEqual(['Standard (0)', 'Premium (0)', 'Local (5)']);
    expect(t.status()).toContain('not signed in');
    expect(t.status()).toContain('5 voices');
  });

  it('keeps Zotero’s voices and says so when the plugin catalog fails', async () => {
    const t = setup({ catalog: new Error('server down') });
    await t.rows.load();
    expect(t.tiers()).toEqual(['Standard (3)', 'Premium (1)', 'Local (0)']);
    expect(t.labels()).toEqual(['Andrew', 'Ava']);
  });

  it('points at the provider sections when there are no voices at all', async () => {
    const t = setup({ catalog: [], zotero: [] });
    await t.rows.load();
    expect(t.status()).toMatch(/provider/i);
  });

  it('reloads on the button', async () => {
    const t = setup();
    await t.rows.load();
    await t.el(VOICE_BROWSER_IDS.reload).fire('command');
    expect(t.deps.listCatalog).toHaveBeenCalledTimes(2);
  });

  it('works without the Zotero deps at all', async () => {
    const t = setup();
    const rows = initVoiceBrowserRows(
      { getElementById: (id: string) => t.el(id) ?? null, createElementNS: (_ns: string, tag: string) => new FakeElement(tag) },
      { ...t.deps, listZoteroVoices: undefined, sampleZoteroVoice: undefined },
    );
    await rows.load();
    expect(t.status()).toContain('5 voices');
    expect(t.tiers()).toEqual(['Standard (0)', 'Premium (0)', 'Local (5)']);
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
    await t.pickLocale('English');
    expect(t.heart(0).textContent).toBe(GLYPHS.favorite);
    expect(t.heart(1).textContent).toBe(GLYPHS.notFavorite);
  });

  it('toggles the pref when a heart is clicked', async () => {
    const t = setup();
    await t.rows.load();
    await t.pickLocale('English');
    await t.heart(0).fire('click');
    expect(parseFavoriteVoices(t.prefs.store[FAVORITES_PREF])).toEqual([jenny]);
    expect(t.heart(0).textContent).toBe(GLYPHS.favorite);
    await t.heart(0).fire('click');
    expect(parseFavoriteVoices(t.prefs.store[FAVORITES_PREF])).toEqual([]);
    expect(t.heart(0).textContent).toBe(GLYPHS.notFavorite);
  });

  // Zotero's voices are marked by their own ids, which never decode as ours
  // (read-aloud/voice-catalog.ts) — the same ids the popup and getAudio use.
  it('marks one of Zotero’s own voices by its Zotero id', async () => {
    const t = setup();
    await t.rows.load();
    await t.pickTier('Premium');
    await t.heart(0).fire('click');
    expect(parseFavoriteVoices(t.prefs.store[FAVORITES_PREF])).toEqual(['zotero-premium-aria']);
    expect(t.heart(0).textContent).toBe(GLYPHS.favorite);
  });

  it('repaints from the pref on refresh, for a settings restore', async () => {
    const t = setup();
    await t.rows.load();
    await t.pickLocale('English');
    t.prefs.set(FAVORITES_PREF, JSON.stringify([jenny]));
    t.rows.refresh();
    expect(t.heart(0).textContent).toBe(GLYPHS.favorite);
  });
});

describe('playing a sample', () => {
  it('synthesizes the locale’s sample text with the voice and plays it', async () => {
    const t = setup();
    await t.rows.load();
    await t.pickLocale('Chinese');
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

  // Zotero's voices are sampled through Zotero's own free sample endpoint,
  // which speaks a text of its own — core/sample-text.ts is the plugin's.
  it('plays one of Zotero’s own voices through Zotero’s sample', async () => {
    const t = setup();
    await t.rows.load();
    await t.pickTier('Premium');
    await t.play(0).fire('click');
    expect(t.deps.sampleZoteroVoice).toHaveBeenCalledWith('zotero-premium-aria');
    expect(t.deps.synthesizeSample).not.toHaveBeenCalled();
    expect(await t.player.play.mock.calls[0][0].text()).toBe('zotero:zotero-premium-aria');
    expect(t.play(0).textContent).toBe(GLYPHS.stop);
  });

  it('replays a Zotero sample from the session cache', async () => {
    const t = setup();
    await t.rows.load();
    await t.pickTier('Premium');
    await t.play(0).fire('click');
    t.player.play.mock.calls[0][1]();
    await t.play(0).fire('click');
    expect(t.deps.sampleZoteroVoice).toHaveBeenCalledTimes(1);
    expect(t.player.play).toHaveBeenCalledTimes(2);
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
    await t.pickLocale('Chinese');
    await t.pickLocale('Multiple');
    expect(t.play(0).textContent).toBe(GLYPHS.stop);
  });

  it('keeps playing across a tier switch and back', async () => {
    const t = setup();
    await t.rows.load();
    await t.play(0).fire('click');
    const stopped = t.player.stop.mock.calls.length;
    await t.pickTier('Premium');
    expect(t.player.stop.mock.calls.length).toBe(stopped);
    // Back on the tier the sample belongs to — the language is kept across
    // the switch, so its own one has to be picked again
    await t.pickTier('Local');
    await t.pickLocale('Multiple');
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
