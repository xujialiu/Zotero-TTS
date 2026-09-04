import { describe, expect, it } from 'vitest';
import { PREF_PREFIX } from '../../src/core/settings';
import {
  countVoicesResponse,
  FAVORITES_OBSERVER,
  FAVORITES_ONLY_OBSERVER,
  filterCatalogToFavorites,
  filterVoicesResponseToFavorites,
  parseFavoriteVoices,
  serializeFavoriteVoices,
  toggleFavoriteVoice,
} from '../../src/read-aloud/favorites';
import { encodeVoiceId } from '../../src/read-aloud/voice-catalog';

const ava = encodeVoiceId('azure', 'en-US-AvaMultilingualNeural');
const alloy = encodeVoiceId('openai', 'alloy');

describe('FAVORITES_ONLY_OBSERVER', () => {
  it('names the switch the way Zotero.Prefs.registerObserver wants it: relative to extensions.zotero.', () => {
    expect('extensions.zotero.' + FAVORITES_ONLY_OBSERVER).toBe(PREF_PREFIX + 'readAloud.favoritesOnly');
  });
});

describe('FAVORITES_OBSERVER', () => {
  it('names the favorites the same way, so the marks in the player can follow them', () => {
    expect('extensions.zotero.' + FAVORITES_OBSERVER).toBe(PREF_PREFIX + 'readAloud.favoriteVoices');
  });
});

describe('parseFavoriteVoices', () => {
  it('reads the JSON array the pref holds', () => {
    expect(parseFavoriteVoices(JSON.stringify([ava, alloy]))).toEqual([ava, alloy]);
  });

  it('returns no favorites for an empty or unset pref', () => {
    expect(parseFavoriteVoices('')).toEqual([]);
    expect(parseFavoriteVoices(undefined)).toEqual([]);
  });

  it('survives a corrupted pref instead of throwing', () => {
    expect(parseFavoriteVoices('not json')).toEqual([]);
    expect(parseFavoriteVoices('{"a":1}')).toEqual([]);
    expect(parseFavoriteVoices(JSON.stringify([ava, 42, null]))).toEqual([ava]);
  });

  it('drops duplicates', () => {
    expect(parseFavoriteVoices(JSON.stringify([ava, ava]))).toEqual([ava]);
  });
});

describe('toggleFavoriteVoice', () => {
  it('adds a voice that is not a favorite yet and removes one that is', () => {
    const added = toggleFavoriteVoice([], ava);
    expect(added).toEqual([ava]);
    expect(toggleFavoriteVoice(added, ava)).toEqual([]);
  });

  it('round-trips through the pref string', () => {
    const ids = toggleFavoriteVoice(toggleFavoriteVoice([], ava), alloy);
    expect(parseFavoriteVoices(serializeFavoriteVoices(ids))).toEqual([ava, alloy]);
  });
});

describe('filterCatalogToFavorites', () => {
  const catalog = [
    {
      provider: 'azure' as const,
      voices: [
        { id: 'en-US-AvaMultilingualNeural', label: 'Ava Multilingual', locale: 'mul' },
        { id: 'zh-CN-XiaoxiaoNeural', label: '晓晓', locale: 'zh-CN' },
      ],
    },
    { provider: 'openai' as const, name: 'OpenAI', voices: [{ id: 'alloy', label: 'alloy', locale: 'mul' }] },
  ];

  it('keeps only the favorite voices and drops providers left empty', () => {
    const filtered = filterCatalogToFavorites(catalog, [ava]);
    expect(filtered).toEqual([
      { provider: 'azure', voices: [{ id: 'en-US-AvaMultilingualNeural', label: 'Ava Multilingual', locale: 'mul' }] },
    ]);
  });

  it('keeps the provider display name on filtered entries', () => {
    const filtered = filterCatalogToFavorites(catalog, [alloy]);
    expect(filtered).toEqual([{ provider: 'openai', name: 'OpenAI', voices: [{ id: 'alloy', label: 'alloy', locale: 'mul' }] }]);
  });

  it('offers everything while nothing is marked', () => {
    expect(filterCatalogToFavorites(catalog, [])).toBe(catalog);
  });

  // Strict: "only favorites" means only favorites. Favorites can outlive
  // their provider (switched off, server gone) and empty the tier — the
  // guard against that is in remote-interface.ts, which sees Zotero's tiers
  // as well and only then offers everything again.
  it('keeps nothing when no favorite matches', () => {
    expect(filterCatalogToFavorites(catalog, [encodeVoiceId('local', 'af_bella')])).toEqual([]);
  });
});

describe('filterVoicesResponseToFavorites', () => {
  const response = () => ({
    standard: [
      {
        voices: { 'std-ava': { label: 'Ava' }, 'std-andrew': { label: 'Andrew' } },
        locales: { 'en-US': ['std-ava', 'std-andrew'], 'de-DE': ['std-ava'] },
        segmentGranularity: 'sentence',
        cacheVersion: '7',
      },
    ],
    premium: [
      {
        voices: { 'prm-aria': { label: 'Aria' } },
        locales: { 'en-US': { default: ['prm-aria'], other: [] } },
        segmentGranularity: 'sentence',
        cacheVersion: '7',
      },
    ],
  });

  it('keeps only the favorites of a tier, in its voices and in its locales', () => {
    const filtered = filterVoicesResponseToFavorites(response(), ['std-ava']);
    expect(filtered.standard).toEqual([
      {
        voices: { 'std-ava': { label: 'Ava' } },
        locales: { 'en-US': ['std-ava'], 'de-DE': ['std-ava'] },
        segmentGranularity: 'sentence',
        cacheVersion: '7',
      },
    ]);
  });

  it('reads the { default, other } locale form and emits the plain array form', () => {
    const filtered = filterVoicesResponseToFavorites(response(), ['prm-aria']);
    expect((filtered.premium[0] as any).locales).toEqual({ 'en-US': ['prm-aria'] });
  });

  it('drops locales and configs a favorite leaves empty', () => {
    const filtered = filterVoicesResponseToFavorites(response(), ['std-andrew']);
    expect((filtered.standard[0] as any).locales).toEqual({ 'en-US': ['std-andrew'] });
  });

  // "Offer only favorite voices" means only those: a tier nobody marked
  // comes up empty, and Zotero's Voice Mode then shows it disabled.
  it('empties a tier without a single favorite', () => {
    expect(filterVoicesResponseToFavorites(response(), ['std-ava']).premium).toEqual([]);
  });

  it('offers everything while nothing is marked', () => {
    const original = response();
    expect(filterVoicesResponseToFavorites(original, [])).toBe(original);
  });

  it('survives a response of any other shape instead of throwing', () => {
    expect(filterVoicesResponseToFavorites({ standard: 'nope' } as any, ['std-ava'])).toEqual({ standard: 'nope' });
    expect(filterVoicesResponseToFavorites({ standard: [null] } as any, ['std-ava'])).toEqual({ standard: [] });
  });

  it('counts the voices a response publishes', () => {
    expect(countVoicesResponse(response())).toBe(3);
    expect(countVoicesResponse(filterVoicesResponseToFavorites(response(), ['std-ava']))).toBe(1);
    expect(countVoicesResponse(null)).toBe(0);
    expect(countVoicesResponse({ standard: 'nope' })).toBe(0);
  });
});
