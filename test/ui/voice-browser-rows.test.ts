import { describe, expect, it, vi } from 'vitest';
import type { ProviderId } from '../../src/core/providers/types';
import { PREF_PREFIX, type PrefsBackend } from '../../src/core/settings';
import { READ_ALOUD_VOICES_PREF } from '../../src/core/read-aloud-speed';
import { sampleTextForLocale } from '../../src/core/sample-text';
import type { CatalogEntry } from '../../src/read-aloud/catalog';
import type { SpeedManagerLike } from '../../src/read-aloud/default-speed';
import { parseFavoriteVoices } from '../../src/read-aloud/favorites';
import { READ_ALOUD_MEMORY_PREF, readMemory } from '../../src/read-aloud/read-aloud-memory';
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
const FAVORITES_ONLY_PREF = PREF_PREFIX + 'readAloud.favoritesOnly';
// The two "everywhere" switches of the Reading group
const SAME_VOICE_PREF = PREF_PREFIX + 'readAloud.sameForAllDocuments';
const GLOBAL_SPEED_PREF = PREF_PREFIX + 'readAloud.globalSpeed';

function fakePrefs(initial: Record<string, unknown> = {}): PrefsBackend & { store: Record<string, unknown> } {
  const store = { ...initial };
  return { store, get: (k) => store[k], set: (k, v) => void (store[k] = v) };
}

class FakeElement {
  attrs = new Map<string, string>();
  listeners = new Map<string, Array<() => unknown>>();
  children: FakeElement[] = [];
  textContent = '';
  /** An <input>'s value; the slider is one. */
  value = '';
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

// Names as read-aloud/language-dropdown.ts asks for them: the base tag where
// the tier holds one region of the language, the full tag where several
const LOCALE_NAMES: Record<string, string> = {
  mul: 'Multiple languages',
  zh: 'Chinese',
  en: 'English',
  'en-US': 'English (United States)',
  'en-GB': 'English (United Kingdom)',
  de: 'German',
};

function setup(
  options: {
    prefs?: Record<string, unknown>;
    catalog?: CatalogEntry[] | Error;
    zotero?: ZoteroVoice[] | Error;
    /** The ReadAloudManager of every open reader. */
    managers?: SpeedManagerLike[];
    /** The "one speed everywhere" switch; on unless said otherwise (a pref, so a test can flip it too). */
    globalSpeed?: boolean;
    /** The "one voice everywhere" switch; on unless said otherwise (a pref, so a test can flip it too). */
    sameVoice?: boolean;
    /** The "offer only favorite voices" switch (a pref, so a test can flip it); off unless said otherwise. */
    favoritesOnly?: boolean;
    /** The tabs Read Aloud is open in; none unless said otherwise. */
    readingTabs?: string[];
  } = {},
) {
  const els = new Map((Object.values(VOICE_BROWSER_IDS) as string[]).map((id) => [id, new FakeElement()]));
  const doc = {
    getElementById: (id: string) => els.get(id) ?? null,
    createElementNS: (_ns: string, tag: string) => new FakeElement(tag),
  };
  const prefs = fakePrefs({
    ...(options.favoritesOnly ? { [FAVORITES_ONLY_PREF]: true } : {}),
    ...(options.sameVoice === false ? { [SAME_VOICE_PREF]: false } : {}),
    ...(options.globalSpeed === false ? { [GLOBAL_SPEED_PREF]: false } : {}),
    ...options.prefs,
  });
  // Zotero.Prefs in miniature: an observer of a pref fires synchronously inside set()
  const watchers: Array<() => void> = [];
  const favoritesOnlyWatchers: Array<() => void> = [];
  const switchWatchers: Array<() => void> = [];
  const rawSet = prefs.set;
  prefs.set = (k, v) => {
    rawSet(k, v);
    if (k === READ_ALOUD_MEMORY_PREF) for (const fn of [...watchers]) fn();
    if (k === FAVORITES_ONLY_PREF) for (const fn of [...favoritesOnlyWatchers]) fn();
    if (k === SAME_VOICE_PREF || k === GLOBAL_SPEED_PREF) for (const fn of [...switchWatchers]) fn();
  };
  const player = { play: vi.fn(async (_audio: Blob, _rate: number, _onDone: () => void) => {}), stop: vi.fn(), setRate: vi.fn() };
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
    readAloudManagers: vi.fn(() => options.managers ?? []),
    globalSpeed: vi.fn(() => prefs.store[GLOBAL_SPEED_PREF] !== false),
    sameVoice: vi.fn(() => prefs.store[SAME_VOICE_PREF] !== false),
    watchSwitches: vi.fn((onChange: () => void) => {
      switchWatchers.push(onChange);
      return () => void switchWatchers.splice(switchWatchers.indexOf(onChange), 1);
    }),
    log: vi.fn(),
    watchMemory: vi.fn((onChange: () => void) => {
      watchers.push(onChange);
      return () => void watchers.splice(watchers.indexOf(onChange), 1);
    }),
    spreadVoice: vi.fn((_choice: { id: string; lang: string } | null) => {}),
    favoritesOnly: vi.fn(() => prefs.store[FAVORITES_ONLY_PREF] === true),
    watchFavoritesOnly: vi.fn((onChange: () => void) => {
      favoritesOnlyWatchers.push(onChange);
      return () => void favoritesOnlyWatchers.splice(favoritesOnlyWatchers.indexOf(onChange), 1);
    }),
    readingTabs: vi.fn(() => options.readingTabs ?? []),
    warn: vi.fn((_message: string) => {}),
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
    watchers,
    favoritesOnlyWatchers,
    switchWatchers,
    status: () => el(VOICE_BROWSER_IDS.status).textContent,
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
    /** The column entries and the default voice's row are painted with the system's selection colors. */
    selectedTier: () => el(VOICE_BROWSER_IDS.tiers).children.find((b) => b.attrs.get('style')?.includes('SelectedItem'))?.textContent,
    selectedLocale: () => el(VOICE_BROWSER_IDS.locales).children.find((b) => b.attrs.get('style')?.includes('SelectedItem'))?.textContent,
    highlighted: () =>
      el(VOICE_BROWSER_IDS.voices)
        .children.filter((r) => r.attrs.get('style')?.includes('SelectedItem'))
        .map((r) => r.children[2].textContent),
    /** Click a column entry by its label, whatever its position. */
    pickTier: (label: string) => el(VOICE_BROWSER_IDS.tiers).children.find((b) => b.textContent.startsWith(label))!.fire('click'),
    pickLocale: (name: string) => el(VOICE_BROWSER_IDS.locales).children.find((b) => b.textContent.startsWith(name))!.fire('click'),
    speedSlider: () => el(VOICE_BROWSER_IDS.speed).value,
    speedLabel: () => el(VOICE_BROWSER_IDS.speedValue).textContent,
    /** Drag the slider: the input's value changes and it fires `input`, as a range input does. */
    dragSpeed: async (value: string) => {
      el(VOICE_BROWSER_IDS.speed).value = value;
      await el(VOICE_BROWSER_IDS.speed).fire('input');
    },
    /** Drag and release: the `input` ticks, then the one `change` a range input fires on release (or per key press). */
    releaseSpeed: async (value: string) => {
      el(VOICE_BROWSER_IDS.speed).value = value;
      await el(VOICE_BROWSER_IDS.speed).fire('input');
      await el(VOICE_BROWSER_IDS.speed).fire('change');
    },
    memory: () => readMemory(prefs),
    zoteroVoices: () => (prefs.store[READ_ALOUD_VOICES_PREF] ? JSON.parse(prefs.store[READ_ALOUD_VOICES_PREF] as string) : undefined),
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
    expect(t.locales()).toEqual(['Multiple languages (2)', 'Chinese (1)', 'English (2)']);
    expect(t.labels()).toEqual(['Azure-Ava Multilingual', 'OpenAI-alloy']);
  });

  it('starts on the first tier that has voices when the plugin publishes none', async () => {
    const t = setup({ catalog: [] });
    await t.rows.load();
    expect(t.locales()).toEqual(['English (2)', 'German (1)']);
    expect(t.labels()).toEqual(['Andrew', 'Ava']);
  });

  it('switches languages and voices when a tier is clicked', async () => {
    const t = setup();
    await t.rows.load();
    await t.pickTier('Premium');
    expect(t.locales()).toEqual(['English (1)']);
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
    expect(t.locales()[0]).toBe('English (2)');
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
    expect(t.locales()).toEqual(['Multiple languages (2)', 'Chinese (1)', 'English (2)']);
    expect(t.status()).toBe('Default voice: Zotero’s own choice per language | 1.0×');
  });

  // The column is the popup's dropdown for the tier: an entry carries its
  // region only where the tier holds the language in several regions
  // (LanguageRegionSelect), so Zotero's tiers, English in one region, say
  // "English" where the plugin's, in two, says "English (United States)"
  it('names a language with its region only where the tier lists it in several, as the popup does', async () => {
    const t = setup({
      catalog: [...CATALOG, { provider: 'azure', voices: [{ id: 'en-GB-SoniaNeural', label: 'Sonia', locale: 'en-GB' }] }],
      prefs: { [READ_ALOUD_MEMORY_PREF]: JSON.stringify({ speed: null, voice: { id: encodeVoiceId('azure', 'en-US-JennyNeural'), lang: 'en' } }) },
    });
    await t.rows.load();
    expect(t.locales()).toEqual(['Multiple languages (2)', 'Chinese (1)', 'English (United Kingdom) (1)', 'English (United States) (2)']);
    expect(t.status()).toBe('Default voice: Local | English (United States) | Azure-Jenny | 1.0×');
    await t.pickTier('Standard');
    expect(t.locales()).toEqual(['English (2)', 'German (1)']);
  });

  // Zotero's normalizeLanguage drops the Chinese regions: the popup has one
  // "Chinese" offering every Chinese voice, and so has the column; a row
  // keeps its own locale, whose region the pick remembers
  it('files every Chinese region under one Chinese entry, as the popup does', async () => {
    const t = setup({
      catalog: [...CATALOG, { provider: 'azure', voices: [{ id: 'zh-TW-YunJheNeural', label: '雲哲', locale: 'zh-TW' }] }],
    });
    await t.rows.load();
    expect(t.locales()).toEqual(['Multiple languages (2)', 'Chinese (2)', 'English (2)']);
    await t.pickLocale('Chinese');
    expect(t.labels()).toEqual(['Azure-晓晓', 'Azure-雲哲']);
    await t.label(1).fire('click');
    expect(t.memory().voice).toEqual({ id: encodeVoiceId('azure', 'zh-TW-YunJheNeural'), lang: 'zh' });
    expect(t.zoteroVoices().zh.region).toBe('TW');
    expect(t.selectedLocale()).toBe('Chinese (2)');
    expect(t.status()).toBe('Default voice: Local | Chinese | Azure-雲哲 | 1.0×');
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
    expect(t.status()).toBe('Default voice: Zotero’s own choice per language | 1.0× — not signed in');
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

  // The pane lists again on every provider switch; two in a row must end
  // with the second one's voices in the columns, not the first's
  it('lists once more after a load() asked for while one was running', async () => {
    const t = setup();
    let release!: (catalog: CatalogEntry[]) => void;
    t.deps.listCatalog.mockImplementationOnce(() => new Promise<CatalogEntry[]>((resolve) => (release = resolve)));
    const running = t.rows.load();
    await t.rows.load();
    expect(t.deps.listCatalog).toHaveBeenCalledTimes(1);
    release([]);
    await running;
    expect(t.deps.listCatalog).toHaveBeenCalledTimes(2);
    expect(t.tiers()).toEqual(['Standard (3)', 'Premium (1)', 'Local (5)']);
  });

  it('works without the Zotero deps at all', async () => {
    const t = setup();
    const rows = initVoiceBrowserRows(
      { getElementById: (id: string) => t.el(id) ?? null, createElementNS: (_ns: string, tag: string) => new FakeElement(tag) },
      { ...t.deps, listZoteroVoices: undefined, sampleZoteroVoice: undefined, readAloudManagers: undefined, log: undefined },
    );
    await rows.load();
    expect(t.status()).toMatch(/^Default voice: /);
    expect(t.tiers()).toEqual(['Standard (0)', 'Premium (0)', 'Local (5)']);
    await t.releaseSpeed('1.8');
    expect(t.memory().speed).toBe(1.8);
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
    t.player.play.mock.calls[0][2]();
    await t.play(0).fire('click');
    expect(t.deps.sampleZoteroVoice).toHaveBeenCalledTimes(1);
    expect(t.player.play).toHaveBeenCalledTimes(2);
  });

  it('returns the button to play when the sample ends', async () => {
    const t = setup();
    await t.rows.load();
    await t.play(0).fire('click');
    const onDone = t.player.play.mock.calls[0][2];
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
    t.player.play.mock.calls[0][2]();
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

describe('the speed slider', () => {
  // The slider is Zotero's own popup slider (0.5–3.0 by 0.1, "1.0×"), set
  // to the speed Read Aloud will start with: the one remembered across
  // documents, else the one Zotero itself last persisted, else 1.
  it('starts at the speed remembered across documents', async () => {
    const t = setup({ prefs: { [READ_ALOUD_MEMORY_PREF]: JSON.stringify({ speed: 1.5, voice: null }) } });
    expect(t.speedSlider()).toBe('1.5');
    expect(t.speedLabel()).toBe('1.5×');
  });

  it("falls back to Zotero's own persisted speed, then to 1", async () => {
    const t = setup({ prefs: { [READ_ALOUD_VOICES_PREF]: JSON.stringify({ en: { voice: 'x', speed: 2 } }) } });
    expect(t.speedSlider()).toBe('2');
    expect(t.speedLabel()).toBe('2.0×');
    expect(setup().speedLabel()).toBe('1.0×');
  });

  it('plays the sample at the speed on the slider', async () => {
    const t = setup();
    await t.rows.load();
    await t.dragSpeed('1.8');
    expect(t.speedLabel()).toBe('1.8×');
    await t.play(0).fire('click');
    expect(t.player.play.mock.calls[0][1]).toBe(1.8);
  });

  it('changes the speed of the sample being played', async () => {
    const t = setup();
    await t.rows.load();
    await t.play(0).fire('click');
    await t.dragSpeed('1.3');
    expect(t.player.setRate).toHaveBeenCalledWith(1.3);
  });

  it("keeps a stray value on Zotero's range", async () => {
    const t = setup();
    await t.dragSpeed('9');
    expect(t.speedSlider()).toBe('3');
    expect(t.speedLabel()).toBe('3.0×');
    await t.dragSpeed('nonsense');
    expect(t.speedLabel()).toBe('1.0×');
  });

  it('is synthesized at the natural pace whatever the speed: the cache is keyed without it', async () => {
    const t = setup();
    await t.rows.load();
    await t.dragSpeed('2');
    await t.play(0).fire('click');
    t.player.play.mock.calls[0][2]();
    await t.dragSpeed('0.5');
    await t.play(0).fire('click');
    expect(t.deps.synthesizeSample).toHaveBeenCalledTimes(1);
    expect(t.player.play.mock.calls[1][1]).toBe(0.5);
  });

  it('re-reads the remembered speed on refresh', async () => {
    const t = setup();
    await t.dragSpeed('2.5');
    t.prefs.set(READ_ALOUD_MEMORY_PREF, JSON.stringify({ speed: 1.2, voice: null }));
    t.rows.refresh();
    expect(t.speedSlider()).toBe('1.2');
    expect(t.speedLabel()).toBe('1.2×');
  });

  it('tolerates a pane without the slider', async () => {
    const els = new Map(
      (Object.values(VOICE_BROWSER_IDS) as string[]).filter((id) => id !== VOICE_BROWSER_IDS.speed && id !== VOICE_BROWSER_IDS.speedValue).map((id) => [id, new FakeElement()]),
    );
    const doc = { getElementById: (id: string) => els.get(id) ?? null, createElementNS: (_ns: string, tag: string) => new FakeElement(tag) };
    const t = setup();
    const rows = initVoiceBrowserRows(doc, t.deps);
    await rows.load();
    await els.get(VOICE_BROWSER_IDS.voices)!.children[0].children[0].fire('click');
    expect(t.player.play.mock.calls[0][1]).toBe(1);
  });
});

describe('the slider as the default speed', () => {
  // Releasing the slider — `change`; the popup persists on pointer-up too —
  // makes its value the speed Read Aloud starts with, everywhere at once
  // (read-aloud/default-speed.ts): the memory kept across documents, and
  // Zotero's own entry for every language it has seen.
  it('makes the released value the default: the memory and Zotero’s every language', async () => {
    const t = setup({
      prefs: {
        [READ_ALOUD_VOICES_PREF]: JSON.stringify({ en: { voice: 'x', speed: 1 }, zh: { speed: 1 } }),
        [READ_ALOUD_MEMORY_PREF]: JSON.stringify({ speed: 1, voice: { id: 'openai::alloy', lang: 'mul' } }),
      },
    });
    await t.releaseSpeed('1.8');
    expect(t.speedLabel()).toBe('1.8×');
    expect(t.memory()).toEqual({ speed: 1.8, voice: { id: 'openai::alloy', lang: 'mul' } });
    expect(t.zoteroVoices()).toEqual({ en: { voice: 'x', speed: 1.8 }, zh: { speed: 1.8 } });
  });

  it('writes nothing while the slider is still being dragged', async () => {
    const t = setup();
    await t.dragSpeed('1.8');
    expect(t.prefs.store[READ_ALOUD_MEMORY_PREF]).toBeUndefined();
    expect(t.zoteroVoices()).toBeUndefined();
  });

  it('changes the pace of a reader that is playing at once, and never persists through an idle one', async () => {
    const playing = { active: true, selectedVoiceID: 'v', setSpeed: vi.fn() };
    const idle = { active: false, selectedVoiceID: 'v', setSpeed: vi.fn() };
    const t = setup({ managers: [playing, idle] });
    await t.releaseSpeed('1.8');
    expect(playing.setSpeed).toHaveBeenCalledWith(1.8, true);
    expect(idle.setSpeed).toHaveBeenCalledWith(1.8, false);
    // The readers are looked up on release, not when the pane opened
    expect(t.deps.readAloudManagers).toHaveBeenCalledTimes(1);
  });

  it('reports a reader that throws and still stores the speed', async () => {
    const broken = {
      active: true,
      selectedVoiceID: 'v',
      setSpeed: vi.fn(() => {
        throw new Error('gone');
      }),
    };
    const t = setup({ managers: [broken] });
    await t.releaseSpeed('1.8');
    expect(t.deps.log).toHaveBeenCalledWith(expect.any(Error));
    expect(t.memory().speed).toBe(1.8);
  });

  it('commits a value the slider clamped, so a key press past the end stores the end', async () => {
    const t = setup();
    await t.releaseSpeed('9');
    expect(t.memory().speed).toBe(3);
    expect(t.speedLabel()).toBe('3.0×');
  });

  // Off, Zotero keeps a speed per document language, and the slider is
  // what it was in 1.7.1: the samples' pace
  it('drives the samples only while global speed is off', async () => {
    const playing = { active: true, selectedVoiceID: 'v', setSpeed: vi.fn() };
    const t = setup({ globalSpeed: false, managers: [playing] });
    await t.rows.load();
    await t.releaseSpeed('1.8');
    expect(t.speedLabel()).toBe('1.8×');
    await t.play(0).fire('click');
    expect(t.player.play.mock.calls[0][1]).toBe(1.8);
    expect(t.prefs.store[READ_ALOUD_MEMORY_PREF]).toBeUndefined();
    expect(t.zoteroVoices()).toBeUndefined();
    expect(playing.setSpeed).not.toHaveBeenCalled();
    // The switch is read on release, so flipping it applies at once
    expect(t.deps.globalSpeed).toHaveBeenCalled();
  });
});

describe('the slider follows the memory', () => {
  // The popup's slider and the shortcuts move the memory (memory-sync
  // learns them); the pane observes the pref and follows without a
  // reopen — and so does a sample that is playing.
  it('moves the slider and the playing sample when the memory changes elsewhere', async () => {
    const t = setup({ prefs: { [READ_ALOUD_MEMORY_PREF]: JSON.stringify({ speed: 1.8, voice: null }) } });
    await t.rows.load();
    await t.play(0).fire('click');
    t.prefs.set(READ_ALOUD_MEMORY_PREF, JSON.stringify({ speed: 2.1, voice: null }));
    expect(t.speedSlider()).toBe('2.1');
    expect(t.speedLabel()).toBe('2.1×');
    expect(t.player.setRate).toHaveBeenCalledWith(2.1);
  });

  it('takes its own write in stride', async () => {
    const t = setup();
    await t.releaseSpeed('1.8');
    expect(t.speedLabel()).toBe('1.8×');
    // The `input` tick and the `change` re-reading the slider set the rate;
    // the write coming back through the observer found the slider there already
    expect(t.player.setRate.mock.calls).toEqual([[1.8], [1.8]]);
  });

  it('stops following, and playing, when the pane is disposed', async () => {
    const t = setup();
    expect(t.watchers).toHaveLength(1);
    t.rows.dispose();
    expect(t.watchers).toHaveLength(0);
    expect(t.player.stop).toHaveBeenCalled();
    t.prefs.set(READ_ALOUD_MEMORY_PREF, JSON.stringify({ speed: 2.1, voice: null }));
    expect(t.speedLabel()).toBe('1.0×');
  });

  it('works without an observer to register', async () => {
    const t = setup();
    const rows = initVoiceBrowserRows(
      { getElementById: (id: string) => t.el(id) ?? null, createElementNS: (_ns: string, tag: string) => new FakeElement(tag) },
      { ...t.deps, watchMemory: undefined },
    );
    expect(() => rows.dispose()).not.toThrow();
  });
});

describe('the default voice', () => {
  // The voice Read Aloud starts with is the one remembered across documents
  // (read-aloud/read-aloud-memory.ts: `{ id, lang }`, the popup's last pick
  // under the key Zotero persists it by). The browser opens on its row,
  // paints it like a selected column entry, and names it in the status line.
  const remembered = (id: string, lang: string, speed: number | null = null) => ({
    [READ_ALOUD_MEMORY_PREF]: JSON.stringify({ speed, voice: { id, lang } }),
  });
  const xiaoxiao = encodeVoiceId('azure', 'zh-CN-XiaoxiaoNeural');

  it('opens on the remembered voice’s tier and language, with its row highlighted', async () => {
    const t = setup({ prefs: remembered(xiaoxiao, 'zh', 1.8) });
    await t.rows.load();
    expect(t.selectedTier()).toBe('Local (5)');
    expect(t.selectedLocale()).toBe('Chinese (1)');
    expect(t.highlighted()).toEqual(['Azure-晓晓']);
    expect(t.label(0).attrs.get('title')).toMatch(/default/i);
    expect(t.status()).toBe('Default voice: Local | Chinese | Azure-晓晓 | 1.8×');
  });

  it('finds one of Zotero’s own voices by its Zotero id', async () => {
    const t = setup({ prefs: remembered('zotero-premium-aria', 'en') });
    await t.rows.load();
    expect(t.selectedTier()).toBe('Premium (1)');
    expect(t.selectedLocale()).toBe('English (1)');
    expect(t.highlighted()).toEqual(['Aria']);
    expect(t.status()).toBe('Default voice: Premium | English | Aria | 1.0×');
  });

  it('finds a voice chosen under Multiple languages, and only that one', async () => {
    const t = setup({ prefs: remembered(encodeVoiceId('openai', 'alloy'), 'mul') });
    await t.rows.load();
    expect(t.selectedLocale()).toBe('Multiple languages (2)');
    expect(t.highlighted()).toEqual(['OpenAI-alloy']);
    expect(t.label(1).attrs.get('title')).toMatch(/click to clear/i);
    expect(t.label(0).attrs.get('title')).toMatch(/make it the default/i);
  });

  // The removed multilingualEverywhere switch had multilingual voices chosen
  // under concrete languages; such a choice is still applied everywhere
  // (read-aloud-memory.ts isMultilingualVoiceId), so its row is the default
  it('finds a multilingual voice remembered under a concrete language', async () => {
    const t = setup({ prefs: remembered(encodeVoiceId('azure', 'en-US-AvaMultilingualNeural'), 'en') });
    await t.rows.load();
    expect(t.selectedLocale()).toBe('Multiple languages (2)');
    expect(t.highlighted()).toEqual(['Azure-Ava Multilingual']);
  });

  // A single-language voice is the default only for documents in the
  // language it was chosen under; under another key it is nobody's default
  it('does not mark a single-language voice remembered under another language', async () => {
    const t = setup({ prefs: remembered(encodeVoiceId('local', 'af_bella'), 'zh') });
    await t.rows.load();
    await t.pickLocale('English');
    expect(t.highlighted()).toEqual([]);
    expect(t.status()).toBe('Default voice: local::af_bella (not listed now) | 1.0×');
  });

  it('says so when the remembered voice is not listed, and opens as usual', async () => {
    const t = setup({ prefs: remembered(encodeVoiceId('azure', 'fr-FR-DeniseNeural'), 'fr', 1.2) });
    await t.rows.load();
    expect(t.selectedTier()).toBe('Local (5)');
    expect(t.selectedLocale()).toBe('Multiple languages (2)');
    expect(t.highlighted()).toEqual([]);
    expect(t.status()).toBe('Default voice: azure::fr-FR-DeniseNeural (not listed now) | 1.2×');
  });

  it('reads as Zotero’s own choice when no voice is remembered', async () => {
    const t = setup({ prefs: { [READ_ALOUD_MEMORY_PREF]: JSON.stringify({ speed: 2, voice: null }) } });
    await t.rows.load();
    expect(t.highlighted()).toEqual([]);
    expect(t.status()).toBe('Default voice: Zotero’s own choice per language | 2.0×');
  });

  it('keeps the highlight and the status line while browsing elsewhere and back', async () => {
    const t = setup({ prefs: remembered(xiaoxiao, 'zh') });
    await t.rows.load();
    await t.pickTier('Standard');
    expect(t.highlighted()).toEqual([]);
    expect(t.status()).toBe('Default voice: Local | Chinese | Azure-晓晓 | 1.0×');
    await t.pickTier('Local');
    await t.pickLocale('Chinese');
    expect(t.highlighted()).toEqual(['Azure-晓晓']);
  });

  it('keeps the tier and language being browsed across a new listing', async () => {
    const t = setup({ prefs: remembered(xiaoxiao, 'zh') });
    await t.rows.load();
    await t.pickTier('Standard');
    await t.pickLocale('German');
    await t.rows.load();
    expect(t.selectedTier()).toBe('Standard (3)');
    expect(t.selectedLocale()).toBe('German (1)');
  });

  it('shows the speed on the slider', async () => {
    const t = setup({ prefs: remembered(xiaoxiao, 'zh', 1.8) });
    await t.rows.load();
    await t.dragSpeed('2.5');
    expect(t.status()).toBe('Default voice: Local | Chinese | Azure-晓晓 | 2.5×');
  });

  // The popup's slider and the shortcuts move the memory; the slider
  // follows (the slider follows the memory, above) and so must the line
  it('follows the speed the memory takes elsewhere', async () => {
    const t = setup({ prefs: remembered(xiaoxiao, 'zh', 1.8) });
    await t.rows.load();
    t.prefs.set(READ_ALOUD_MEMORY_PREF, JSON.stringify({ speed: 2.1, voice: { id: xiaoxiao, lang: 'zh' } }));
    expect(t.status()).toBe('Default voice: Local | Chinese | Azure-晓晓 | 2.1×');
  });

  // Off, Zotero keeps a speed per document language and the slider only
  // paces the samples — so its value is not the default speed
  it('names no default speed while global speed is off', async () => {
    const t = setup({ prefs: remembered(xiaoxiao, 'zh', 1.8), globalSpeed: false });
    await t.rows.load();
    expect(t.status()).toBe('Default voice: Local | Chinese | Azure-晓晓');
    await t.dragSpeed('2.5');
    expect(t.speedLabel()).toBe('2.5×');
    expect(t.status()).toBe('Default voice: Local | Chinese | Azure-晓晓');
  });

  // Off, Zotero keeps a voice per document language and the remembered
  // voice is applied nowhere — the row stays highlighted as the last pick,
  // but the line names the speed alone
  it('names no default voice while one voice everywhere is off', async () => {
    const t = setup({ prefs: remembered(xiaoxiao, 'zh', 1.8), sameVoice: false });
    await t.rows.load();
    expect(t.status()).toBe('Default speed: 1.8×');
    expect(t.highlighted()).toEqual(['Azure-晓晓']);
    await t.dragSpeed('2.5');
    expect(t.status()).toBe('Default speed: 2.5×');
  });

  it('names no default at all while both switches are off, and still reports a listing that failed', async () => {
    const t = setup({ prefs: remembered(xiaoxiao, 'zh', 1.8), sameVoice: false, globalSpeed: false, zotero: new Error('not signed in') });
    await t.rows.load();
    expect(t.status()).toBe('No default voice or speed: Zotero keeps both per language — not signed in');
  });

  // The warning is about the voice the line names; a line without one has nothing to warn about
  it('does not warn about a default that is not a favorite while one voice everywhere is off', async () => {
    const t = setup({ prefs: remembered(xiaoxiao, 'zh', 1.8), sameVoice: false, favoritesOnly: true });
    await t.rows.load();
    expect(t.status()).toBe('Default speed: 1.8×');
  });

  // Both switches are checkboxes of the same pane: the line follows them at once
  it('repaints the line as soon as either switch flips', async () => {
    const t = setup({ prefs: remembered(xiaoxiao, 'zh', 1.8) });
    await t.rows.load();
    expect(t.status()).toBe('Default voice: Local | Chinese | Azure-晓晓 | 1.8×');
    t.prefs.set(SAME_VOICE_PREF, false);
    expect(t.status()).toBe('Default speed: 1.8×');
    t.prefs.set(GLOBAL_SPEED_PREF, false);
    expect(t.status()).toBe('No default voice or speed: Zotero keeps both per language');
    t.prefs.set(SAME_VOICE_PREF, true);
    expect(t.status()).toBe('Default voice: Local | Chinese | Azure-晓晓');
    t.prefs.set(GLOBAL_SPEED_PREF, true);
    expect(t.status()).toBe('Default voice: Local | Chinese | Azure-晓晓 | 1.8×');
  });

  it('stops watching the switches when disposed', () => {
    const t = setup();
    expect(t.switchWatchers).toHaveLength(1);
    t.rows.dispose();
    expect(t.switchWatchers).toHaveLength(0);
  });

  it('reports a listing that failed beside the default', async () => {
    const t = setup({ prefs: remembered(xiaoxiao, 'zh'), zotero: new Error('not signed in') });
    await t.rows.load();
    expect(t.status()).toBe('Default voice: Local | Chinese | Azure-晓晓 | 1.0× — not signed in');
    await t.dragSpeed('1.5');
    expect(t.status()).toBe('Default voice: Local | Chinese | Azure-晓晓 | 1.5× — not signed in');
  });

  // A settings restore may bring another memory; the rows and the status
  // follow it, the tier and language being browsed stay
  it('follows the memory on refresh without moving the selection', async () => {
    const t = setup({ prefs: remembered(xiaoxiao, 'zh') });
    await t.rows.load();
    await t.pickLocale('English');
    t.prefs.set(READ_ALOUD_MEMORY_PREF, JSON.stringify({ speed: 1.3, voice: { id: encodeVoiceId('local', 'af_bella'), lang: 'en' } }));
    t.rows.refresh();
    expect(t.selectedLocale()).toBe('English (2)');
    expect(t.highlighted()).toEqual(['Kokoro-af_bella']);
    expect(t.status()).toBe('Default voice: Local | English | Kokoro-af_bella | 1.3×');
  });

  it('leaves the status line alone on refresh before the voices are listed', () => {
    const t = setup({ prefs: remembered(xiaoxiao, 'zh') });
    t.rows.refresh();
    expect(t.status()).toBe('');
  });
});

describe('the highlight follows the memory', () => {
  const remembered = (id: string, lang: string, speed: number | null = null) => ({
    [READ_ALOUD_MEMORY_PREF]: JSON.stringify({ speed, voice: { id, lang } }),
  });
  const xiaoxiao = encodeVoiceId('azure', 'zh-CN-XiaoxiaoNeural');
  const alloy = encodeVoiceId('openai', 'alloy');
  const picked = (t: ReturnType<typeof setup>, voice: { id: string; lang: string } | null, speed: number | null = null) =>
    t.prefs.set(READ_ALOUD_MEMORY_PREF, JSON.stringify({ speed, voice }));

  // The popup of some tab picked another voice and memory-sync learned it.
  // The pane, open beside it, moves the highlight there and opens the
  // columns on it, the way the first listing opens on the default.
  it('moves the highlight and the columns to a voice picked elsewhere', async () => {
    const t = setup({ prefs: remembered(xiaoxiao, 'zh', 1.8) });
    await t.rows.load();
    picked(t, { id: alloy, lang: 'mul' }, 1.8);
    expect(t.selectedTier()).toBe('Local (5)');
    expect(t.selectedLocale()).toBe('Multiple languages (2)');
    expect(t.highlighted()).toEqual(['OpenAI-alloy']);
    expect(t.status()).toBe('Default voice: Local | Multiple languages | OpenAI-alloy | 1.8×');
  });

  it('follows to one of Zotero’s own voices, in its tier', async () => {
    const t = setup({ prefs: remembered(xiaoxiao, 'zh') });
    await t.rows.load();
    picked(t, { id: 'zotero-standard-ben', lang: 'de' });
    expect(t.selectedTier()).toBe('Standard (3)');
    expect(t.selectedLocale()).toBe('German (1)');
    expect(t.highlighted()).toEqual(['Ben']);
  });

  it('drops the highlight and stays put when the default is cleared', async () => {
    const t = setup({ prefs: remembered(xiaoxiao, 'zh') });
    await t.rows.load();
    picked(t, null);
    expect(t.selectedLocale()).toBe('Chinese (1)');
    expect(t.highlighted()).toEqual([]);
    expect(t.status()).toBe('Default voice: Zotero’s own choice per language | 1.0×');
  });

  it('stays put when the new default is not listed, and says so', async () => {
    const t = setup({ prefs: remembered(xiaoxiao, 'zh') });
    await t.rows.load();
    picked(t, { id: 'azure::fr-FR-DeniseNeural', lang: 'fr' });
    expect(t.selectedLocale()).toBe('Chinese (1)');
    expect(t.highlighted()).toEqual([]);
    expect(t.status()).toBe('Default voice: azure::fr-FR-DeniseNeural (not listed now) | 1.0×');
  });

  it('leaves the columns where they are when only the speed moved', async () => {
    const t = setup({ prefs: remembered(xiaoxiao, 'zh', 1.8) });
    await t.rows.load();
    await t.pickTier('Standard');
    picked(t, { id: xiaoxiao, lang: 'zh' }, 2.1);
    expect(t.selectedTier()).toBe('Standard (3)');
    expect(t.speedLabel()).toBe('2.1×');
    expect(t.status()).toBe('Default voice: Local | Chinese | Azure-晓晓 | 2.1×');
  });

  it('keeps a playing sample’s stop glyph across the move', async () => {
    const t = setup({ prefs: remembered(xiaoxiao, 'zh') });
    await t.rows.load();
    await t.play(0).fire('click');
    // Starting a sample stops whatever played before; the move must not stop this one
    const stops = t.player.stop.mock.calls.length;
    picked(t, { id: alloy, lang: 'mul' });
    expect(t.player.stop.mock.calls.length).toBe(stops);
    await t.pickLocale('Chinese');
    expect(t.play(0).textContent).toBe(GLYPHS.stop);
  });

  it('takes a change made before the voices are listed into account once they are', async () => {
    const t = setup({ prefs: remembered(xiaoxiao, 'zh') });
    picked(t, { id: alloy, lang: 'mul' });
    await t.rows.load();
    expect(t.selectedLocale()).toBe('Multiple languages (2)');
    expect(t.highlighted()).toEqual(['OpenAI-alloy']);
  });
});

describe('a row click sets the default', () => {
  const remembered = (id: string, lang: string, speed: number | null = null) => ({
    [READ_ALOUD_MEMORY_PREF]: JSON.stringify({ speed, voice: { id, lang } }),
  });
  const xiaoxiao = encodeVoiceId('azure', 'zh-CN-XiaoxiaoNeural');
  const alloy = encodeVoiceId('openai', 'alloy');
  const bella = encodeVoiceId('local', 'af_bella');

  // The memory, Zotero's entry for the voice's language as its own pick
  // would write it (read-aloud/default-voice.ts), and the tabs that are
  // reading through memory-sync; the row is the default now, and says so
  it('makes the clicked voice the default: the memory, Zotero’s entry for its language, and the open tabs', async () => {
    const t = setup();
    await t.rows.load();
    await t.pickLocale('Chinese');
    await t.label(0).fire('click');
    expect(t.memory().voice).toEqual({ id: xiaoxiao, lang: 'zh' });
    expect(t.zoteroVoices().zh).toEqual({ region: 'CN', voice: xiaoxiao, tierVoices: { local: xiaoxiao } });
    expect(t.deps.spreadVoice).toHaveBeenCalledWith({ id: xiaoxiao, lang: 'zh' });
    expect(t.highlighted()).toEqual(['Azure-晓晓']);
    expect(t.label(0).attrs.get('title')).toMatch(/click to clear/i);
    expect(t.status()).toBe('Default voice: Local | Chinese | Azure-晓晓 | 1.0×');
  });

  it('files a multilingual voice under Multiple languages, with no region', async () => {
    const t = setup();
    await t.rows.load();
    expect(t.labels()).toEqual(['Azure-Ava Multilingual', 'OpenAI-alloy']);
    await t.label(1).fire('click');
    expect(t.memory().voice).toEqual({ id: alloy, lang: 'mul' });
    expect(t.zoteroVoices().mul).toEqual({ region: null, voice: alloy, tierVoices: { local: alloy } });
    expect(t.deps.spreadVoice).toHaveBeenCalledWith({ id: alloy, lang: 'mul' });
  });

  it('files one of Zotero’s own voices under its tier', async () => {
    const t = setup();
    await t.rows.load();
    await t.pickTier('Premium');
    await t.label(0).fire('click');
    expect(t.memory().voice).toEqual({ id: 'zotero-premium-aria', lang: 'en' });
    expect(t.zoteroVoices().en).toEqual({ region: 'US', voice: 'zotero-premium-aria', tierVoices: { premium: 'zotero-premium-aria' } });
    expect(t.highlighted()).toEqual(['Aria']);
  });

  // Zotero's own entry survives: its speed, and the other tiers' voices; the
  // picked tier goes to the end, where Zotero's fallback looks first
  it('keeps the entry’s speed and other tiers, and pushes the picked tier to the end', async () => {
    const t = setup({
      prefs: { [READ_ALOUD_VOICES_PREF]: JSON.stringify({ en: { region: 'GB', voice: 'x', speed: 1.7, tierVoices: { local: 'k', standard: 's' } } }) },
    });
    await t.rows.load();
    await t.pickLocale('English');
    expect(t.labels()).toEqual(['Azure-Jenny', 'Kokoro-af_bella']);
    await t.label(1).fire('click');
    expect(t.zoteroVoices().en).toEqual({ region: 'US', voice: bella, speed: 1.7, tierVoices: { standard: 's', local: bella } });
    expect(Object.keys(t.zoteroVoices().en.tierVoices)).toEqual(['standard', 'local']);
  });

  it('starts an entry Zotero has not written at the remembered speed', async () => {
    const t = setup({ prefs: { [READ_ALOUD_MEMORY_PREF]: JSON.stringify({ speed: 1.8, voice: null }) } });
    await t.rows.load();
    await t.pickLocale('Chinese');
    await t.label(0).fire('click');
    expect(t.zoteroVoices().zh.speed).toBe(1.8);
  });

  it('clears the default when its row is clicked again, leaving Zotero’s entry and the tabs alone', async () => {
    const t = setup({ prefs: remembered(xiaoxiao, 'zh') });
    await t.rows.load();
    expect(t.highlighted()).toEqual(['Azure-晓晓']);
    await t.label(0).fire('click');
    expect(t.memory().voice).toBeNull();
    expect(t.zoteroVoices()).toBeUndefined();
    expect(t.deps.spreadVoice).toHaveBeenCalledWith(null);
    expect(t.highlighted()).toEqual([]);
    expect(t.label(0).attrs.get('title')).toMatch(/make it the default/i);
    expect(t.status()).toBe('Default voice: Zotero’s own choice per language | 1.0×');
    expect(t.selectedLocale()).toBe('Chinese (1)');
  });

  it('keeps the columns on the clicked row, and moves the highlight from the old default', async () => {
    const t = setup({ prefs: remembered(xiaoxiao, 'zh') });
    await t.rows.load();
    await t.pickTier('Standard');
    expect(t.labels()).toEqual(['Andrew', 'Ava']);
    await t.label(0).fire('click');
    expect(t.selectedTier()).toBe('Standard (3)');
    expect(t.selectedLocale()).toBe('English (2)');
    expect(t.highlighted()).toEqual(['Andrew']);
    await t.pickTier('Local');
    await t.pickLocale('Chinese');
    expect(t.highlighted()).toEqual([]);
  });

  it('works without a memory observer, and without a way to reach the tabs', async () => {
    const t = setup();
    const rows = initVoiceBrowserRows(
      { getElementById: (id: string) => t.el(id) ?? null, createElementNS: (_ns: string, tag: string) => new FakeElement(tag) },
      { ...t.deps, watchMemory: undefined, spreadVoice: undefined },
    );
    await rows.load();
    await t.pickLocale('Chinese');
    await t.label(0).fire('click');
    expect(t.memory().voice).toEqual({ id: xiaoxiao, lang: 'zh' });
    expect(t.highlighted()).toEqual(['Azure-晓晓']);
    expect(t.status()).toBe('Default voice: Local | Chinese | Azure-晓晓 | 1.0×');
  });
});

describe('only a favorite can be the default while the switch is on', () => {
  const remembered = (id: string, lang: string) => ({ [READ_ALOUD_MEMORY_PREF]: JSON.stringify({ speed: null, voice: { id, lang } }) });
  const favorites = (...ids: string[]) => ({ [FAVORITES_PREF]: JSON.stringify(ids) });
  const xiaoxiao = encodeVoiceId('azure', 'zh-CN-XiaoxiaoNeural');
  const alloy = encodeVoiceId('openai', 'alloy');
  const WARNING = ' — not a favorite, while only favorites are offered: Read Aloud cannot start with it';

  // The popup offers only the favorites then; another default would never be offered
  it('grays a row that is not a favorite, which does not react, and says why', async () => {
    const t = setup({ favoritesOnly: true, prefs: favorites(alloy) });
    await t.rows.load();
    await t.pickLocale('Chinese');
    expect(t.label(0).attrs.get('style')).toContain('opacity: 0.5');
    expect(t.label(0).attrs.get('title')).toMatch(/only a favorite/i);
    await t.label(0).fire('click');
    expect(t.memory().voice).toBeNull();
    expect(t.deps.spreadVoice).not.toHaveBeenCalled();
  });

  it('lets a favorite be picked', async () => {
    const t = setup({ favoritesOnly: true, prefs: favorites(xiaoxiao) });
    await t.rows.load();
    await t.pickLocale('Chinese');
    expect(t.label(0).attrs.get('style')).not.toContain('opacity');
    expect(t.label(0).attrs.get('title')).toMatch(/make it the default/i);
    await t.label(0).fire('click');
    expect(t.memory().voice).toEqual({ id: xiaoxiao, lang: 'zh' });
  });

  it('lets a default that is no favorite be cleared, and warns about it meanwhile', async () => {
    const t = setup({ favoritesOnly: true, prefs: remembered(xiaoxiao, 'zh') });
    await t.rows.load();
    expect(t.status()).toBe('Default voice: Local | Chinese | Azure-晓晓 | 1.0×' + WARNING);
    expect(t.label(0).attrs.get('title')).toMatch(/click to clear/i);
    await t.label(0).fire('click');
    expect(t.memory().voice).toBeNull();
    expect(t.status()).toBe('Default voice: Zotero’s own choice per language | 1.0×');
  });

  it('clears the default when its heart is unmarked, and the status line says so', async () => {
    const t = setup({ favoritesOnly: true, prefs: { ...remembered(xiaoxiao, 'zh'), ...favorites(xiaoxiao, alloy) } });
    await t.rows.load();
    await t.heart(0).fire('click');
    expect(parseFavoriteVoices(t.prefs.store[FAVORITES_PREF])).toEqual([alloy]);
    expect(t.memory().voice).toBeNull();
    expect(t.deps.spreadVoice).toHaveBeenCalledWith(null);
    expect(t.highlighted()).toEqual([]);
    expect(t.status()).toBe('Default cleared: Azure-晓晓 is no longer a favorite, and only favorites are offered');
    // The row is grayed now like any other non-favorite
    expect(t.label(0).attrs.get('title')).toMatch(/only a favorite/i);
  });

  it('keeps the default when its heart is unmarked while the switch is off', async () => {
    const t = setup({ prefs: { ...remembered(xiaoxiao, 'zh'), ...favorites(xiaoxiao) } });
    await t.rows.load();
    await t.heart(0).fire('click');
    expect(t.memory().voice).toEqual({ id: xiaoxiao, lang: 'zh' });
    expect(t.highlighted()).toEqual(['Azure-晓晓']);
    expect(t.status()).toBe('Default voice: Local | Chinese | Azure-晓晓 | 1.0×');
  });

  it('warns when the switch goes on with a default that is no favorite, grays the rows, and stops once it is marked', async () => {
    const t = setup({ prefs: { ...remembered(xiaoxiao, 'zh'), ...favorites(alloy) } });
    await t.rows.load();
    await t.pickLocale('Multiple');
    expect(t.status()).toBe('Default voice: Local | Chinese | Azure-晓晓 | 1.0×');
    expect(t.label(0).attrs.get('title')).toMatch(/make it the default/i);
    t.prefs.set(FAVORITES_ONLY_PREF, true);
    expect(t.status()).toBe('Default voice: Local | Chinese | Azure-晓晓 | 1.0×' + WARNING);
    expect(t.label(0).attrs.get('title')).toMatch(/only a favorite/i);
    expect(t.label(1).attrs.get('title')).toMatch(/make it the default/i);
    await t.pickLocale('Chinese');
    await t.heart(0).fire('click');
    expect(t.status()).toBe('Default voice: Local | Chinese | Azure-晓晓 | 1.0×');
    t.prefs.set(FAVORITES_ONLY_PREF, false);
    await t.pickLocale('Multiple');
    expect(t.label(0).attrs.get('title')).toMatch(/make it the default/i);
  });

  it('stops watching the switch when disposed', () => {
    const t = setup();
    expect(t.favoritesOnlyWatchers).toHaveLength(1);
    t.rows.dispose();
    expect(t.favoritesOnlyWatchers).toHaveLength(0);
  });

  it('works without the switch deps at all', async () => {
    const t = setup({ prefs: favorites(alloy) });
    const rows = initVoiceBrowserRows(
      { getElementById: (id: string) => t.el(id) ?? null, createElementNS: (_ns: string, tag: string) => new FakeElement(tag) },
      { ...t.deps, favoritesOnly: undefined, watchFavoritesOnly: undefined },
    );
    await rows.load();
    await t.pickLocale('Chinese');
    await t.label(0).fire('click');
    expect(t.memory().voice).toEqual({ id: xiaoxiao, lang: 'zh' });
    expect(() => rows.dispose()).not.toThrow();
  });
});

describe('marking a favorite while a tab is reading', () => {
  const favorites = (...ids: string[]) => ({ [FAVORITES_PREF]: JSON.stringify(ids) });
  const xiaoxiao = encodeVoiceId('azure', 'zh-CN-XiaoxiaoNeural');

  // Only favorites are offered, so the mark would add the voice to the
  // popup — which the reading tab lists only when Read Aloud reopens there
  it('is refused, and the user is told which tabs, while only favorites are offered', async () => {
    const t = setup({ favoritesOnly: true, readingTabs: ['Deep learning'] });
    await t.rows.load();
    await t.pickLocale('Chinese');
    await t.heart(0).fire('click');
    expect(t.prefs.store[FAVORITES_PREF]).toBeUndefined();
    expect(t.heart(0).textContent).toBe(GLYPHS.notFavorite);
    expect(t.deps.warn).toHaveBeenCalledWith(expect.stringContaining('Deep learning'));
  });

  // Unmarking takes the voice out of the popup, and unmarking the last one
  // listed puts every voice back into it: both edit the list (issue #11)
  it('is refused for unmarking too, the heart left as it was', async () => {
    const t = setup({ favoritesOnly: true, readingTabs: ['Deep learning'], prefs: favorites(xiaoxiao) });
    await t.rows.load();
    await t.pickLocale('Chinese');
    await t.heart(0).fire('click');
    expect(parseFavoriteVoices(t.prefs.store[FAVORITES_PREF])).toEqual([xiaoxiao]);
    expect(t.heart(0).textContent).toBe(GLYPHS.favorite);
    expect(t.deps.warn).toHaveBeenCalledWith(expect.stringContaining('Deep learning'));
  });

  it('goes through while the switch is off — the popup offers every voice regardless', async () => {
    const t = setup({ readingTabs: ['Deep learning'] });
    await t.rows.load();
    await t.pickLocale('Chinese');
    await t.heart(0).fire('click');
    expect(parseFavoriteVoices(t.prefs.store[FAVORITES_PREF])).toEqual([xiaoxiao]);
    expect(t.deps.warn).not.toHaveBeenCalled();
  });

  it('goes through while nothing is reading', async () => {
    const t = setup({ favoritesOnly: true });
    await t.rows.load();
    await t.pickLocale('Chinese');
    await t.heart(0).fire('click');
    expect(parseFavoriteVoices(t.prefs.store[FAVORITES_PREF])).toEqual([xiaoxiao]);
    expect(t.deps.warn).not.toHaveBeenCalled();
  });

  it('works without the guard deps at all', async () => {
    const t = setup({ favoritesOnly: true, readingTabs: ['Deep learning'] });
    const rows = initVoiceBrowserRows(
      { getElementById: (id: string) => t.el(id) ?? null, createElementNS: (_ns: string, tag: string) => new FakeElement(tag) },
      { ...t.deps, readingTabs: undefined, warn: undefined },
    );
    await rows.load();
    await t.pickLocale('Chinese');
    await t.heart(0).fire('click');
    expect(parseFavoriteVoices(t.prefs.store[FAVORITES_PREF])).toEqual([xiaoxiao]);
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
    const el = new FakeElement('audio') as FakeElement & {
      src?: string;
      playbackRate: number;
      defaultPlaybackRate: number;
      preservesPitch?: boolean;
      play: () => Promise<void>;
      pause: () => void;
      removeAttribute: (k: string) => void;
    };
    el.play = vi.fn(async () => {});
    el.pause = vi.fn();
    el.removeAttribute = vi.fn();
    el.playbackRate = 1;
    el.defaultPlaybackRate = 1;
    // What a real element does: setting src runs the media element load
    // algorithm, whose step 7 sets playbackRate back to defaultPlaybackRate.
    // The first build set the rate before the source and played at 1×.
    let src: string | undefined;
    Object.defineProperty(el, 'src', {
      get: () => src,
      set: (value: string) => {
        src = value;
        el.playbackRate = el.defaultPlaybackRate;
      },
    });
    return el;
  }

  function playerWithElements() {
    const created: ReturnType<typeof fakeAudio>[] = [];
    const player = createSamplePlayer(() => {
      const el = fakeAudio();
      created.push(el);
      return el as unknown as HTMLAudioElement;
    });
    return { created, player };
  }

  it('plays the blob through a fresh element and reports the end once', async () => {
    const { created, player } = playerWithElements();
    const onDone = vi.fn();
    await player.play(new Blob(['x'], { type: 'audio/wav' }), 1, onDone);
    expect(created[0].src).toMatch(/^data:audio\/wav/);
    expect(created[0].play).toHaveBeenCalledOnce();
    await created[0].fire('ended');
    await created[0].fire('ended');
    expect(onDone).toHaveBeenCalledOnce();
  });

  // Read Aloud time-stretches its audio with the pitch kept (the reader's
  // stretchAudioBuffer); the element's playbackRate with preservesPitch is
  // the same operation, so a sample sounds as reading at that speed will.
  it('plays at the given rate with the pitch preserved, the rate surviving the load of the source', async () => {
    const { created, player } = playerWithElements();
    await player.play(new Blob(['x']), 1.5, vi.fn());
    expect(created[0].playbackRate).toBe(1.5);
    // The default too, so a reload of the element would come back at the same rate
    expect(created[0].defaultPlaybackRate).toBe(1.5);
    expect(created[0].preservesPitch).toBe(true);
  });

  it('setRate changes the element that is playing, and nothing once stopped', async () => {
    const { created, player } = playerWithElements();
    await player.play(new Blob(['x']), 1, vi.fn());
    player.setRate(2);
    expect(created[0].playbackRate).toBe(2);
    player.stop();
    player.setRate(3);
    expect(created[0].playbackRate).toBe(2);
  });

  it('stop() silences the element and reports the end', async () => {
    const { created, player } = playerWithElements();
    const onDone = vi.fn();
    await player.play(new Blob(['x']), 1, onDone);
    player.stop();
    expect(created[0].pause).toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledOnce();
    player.stop();
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('a second play stops the first', async () => {
    const { created, player } = playerWithElements();
    const first = vi.fn();
    const second = vi.fn();
    await player.play(new Blob(['x']), 1, first);
    await player.play(new Blob(['y']), 1, second);
    expect(created[0].pause).toHaveBeenCalled();
    expect(first).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();
  });
});

// The pane's refusal of *Offer only favorite voices* over a default that is
// not a favorite names the voice as the browser does (ui/voice-list-switches.ts,
// issue #35); a voice not listed now is named by its id there, as the status line names it
describe('labelOf', () => {
  it('names a listed voice by its label, the plugin’s and Zotero’s own alike, and nothing for one not listed', async () => {
    const t = setup();
    expect(t.rows.labelOf('local::af_bella')).toBeNull();
    await t.rows.load();
    expect(t.rows.labelOf('local::af_bella')).toBe('Kokoro-af_bella');
    expect(t.rows.labelOf('zotero-standard-ava')).toBe('Ava');
    expect(t.rows.labelOf('local::gone')).toBeNull();
  });
});
