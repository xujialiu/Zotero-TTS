import { describe, expect, it } from 'vitest';
import {
  filterCatalogToFavorites,
  parseFavoriteVoices,
  serializeFavoriteVoices,
  toggleFavoriteVoice,
} from '../../src/read-aloud/favorites';
import { encodeVoiceId } from '../../src/read-aloud/voice-catalog';

const ava = encodeVoiceId('azure', 'en-US-AvaMultilingualNeural');
const alloy = encodeVoiceId('openai', 'alloy');

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

  // Favorites can outlive their provider (switched off, server gone). A
  // filter that matched nothing would silently empty the Local tier; the
  // full list is the useful failure mode.
  it('offers everything when no favorite matches, so the list never comes up empty', () => {
    expect(filterCatalogToFavorites(catalog, [encodeVoiceId('local', 'af_bella')])).toBe(catalog);
  });
});
