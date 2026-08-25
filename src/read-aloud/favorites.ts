import type { CatalogEntry } from './catalog';
import { encodeVoiceId } from './voice-catalog';

/**
 * Favorite voices, as marked in the settings' voice browser. The pref
 * (`readAloud.favoriteVoices`) holds a JSON array of encoded voice ids
 * ("azure::en-US-AvaMultilingualNeural") — the same ids the catalog
 * publishes, so a favorite stays valid across renames of labels and
 * engines. A voice id may contain any character, which rules the usual
 * comma-separated pref out.
 */

export function parseFavoriteVoices(raw: unknown): string[] {
  if (typeof raw !== 'string' || !raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((id): id is string => typeof id === 'string' && id !== ''))];
  } catch {
    return [];
  }
}

export function serializeFavoriteVoices(ids: readonly string[]): string {
  return JSON.stringify(ids);
}

export function toggleFavoriteVoice(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

/**
 * The catalog reduced to the favorites, for the "offer only favorites"
 * switch. With nothing marked, or when no favorite matches any listed
 * voice (its provider switched off, its server gone), the full catalog is
 * returned instead: a filter that silently emptied the Local tier would
 * read as "the plugin broke", and the full list is the useful failure mode.
 */
export function filterCatalogToFavorites(entries: CatalogEntry[], favorites: readonly string[]): CatalogEntry[] {
  if (!favorites.length) return entries;
  const wanted = new Set(favorites);
  const filtered = entries
    .map((entry) => ({ ...entry, voices: entry.voices.filter((voice) => wanted.has(encodeVoiceId(entry.provider, voice.id))) }))
    .filter((entry) => entry.voices.length > 0);
  return filtered.length ? filtered : entries;
}
