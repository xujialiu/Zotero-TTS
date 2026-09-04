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

/** The "offer only favorite voices" pref as Zotero.Prefs.registerObserver wants it: relative to `extensions.zotero.` (pinned by a test). */
export const FAVORITES_ONLY_OBSERVER = 'zotero-tts.readAloud.favoritesOnly';

/** The favorites themselves, named the same way: what the player's ♥ marks follow (read-aloud/favorite-marks.ts). */
export const FAVORITES_OBSERVER = 'zotero-tts.readAloud.favoriteVoices';

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
 * switch: only the marked voices are kept, and a provider left without any
 * is dropped. With nothing marked at all the catalog is returned untouched.
 *
 * The filter is strict — "only favorites" means only favorites, in every
 * tier. The guard against a popup with nothing in it lives in
 * read-aloud/remote-interface.ts, where Zotero's own tiers are in view too:
 * only when nothing marked is listed *anywhere* is everything offered again.
 */
export function filterCatalogToFavorites(entries: CatalogEntry[], favorites: readonly string[]): CatalogEntry[] {
  if (!favorites.length) return entries;
  const wanted = new Set(favorites);
  return entries
    .map((entry) => ({ ...entry, voices: entry.voices.filter((voice) => wanted.has(encodeVoiceId(entry.provider, voice.id))) }))
    .filter((entry) => entry.voices.length > 0);
}

/**
 * Zotero's own voices response (the format=2 shape its `parseVoicesResponse`
 * reads), reduced to the favorites — so a heart on a Standard or Premium
 * voice trims the popup exactly as a heart on one of the plugin's does.
 *
 * Strict, like the catalog filter beside it: a tier none of whose voices is
 * marked comes back empty, which is what "offer only favorite voices" says —
 * Zotero's Voice Mode dropdown then shows that tier disabled. Filtered
 * locales are emitted as the plain array form, which Zotero's parser
 * tolerates explicitly (`Array.isArray(localeConfig)`); the
 * `{ default, other }` form it also accepts is read, never rebuilt.
 */
export function filterVoicesResponseToFavorites<T extends Record<string, unknown>>(
  response: T,
  favorites: readonly string[],
): T {
  if (!favorites.length) return response;
  const wanted = new Set(favorites);
  const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object';
  const ids = (entry: unknown): string[] => {
    const list = Array.isArray(entry)
      ? entry
      : isRecord(entry)
        ? [...(Array.isArray(entry.default) ? entry.default : []), ...(Array.isArray(entry.other) ? entry.other : [])]
        : [];
    return list.filter((id): id is string => typeof id === 'string');
  };

  const out: Record<string, unknown> = { ...response };
  for (const [tier, configs] of Object.entries(response)) {
    if (!Array.isArray(configs)) continue;
    const filtered: unknown[] = [];
    for (const config of configs) {
      if (!isRecord(config) || !isRecord(config.locales) || !isRecord(config.voices)) continue;
      const published = config.voices;
      const voices: Record<string, unknown> = {};
      const locales: Record<string, string[]> = {};
      for (const [locale, entry] of Object.entries(config.locales)) {
        const kept = ids(entry).filter((id) => wanted.has(id) && !!published[id]);
        if (!kept.length) continue;
        locales[locale] = kept;
        for (const id of kept) voices[id] = published[id];
      }
      if (!Object.keys(locales).length) continue;
      filtered.push({ ...config, voices, locales });
    }
    out[tier] = filtered;
  }
  return out as T;
}

/** How many voices a format=2 response publishes; the emptiness check behind the guard above. */
export function countVoicesResponse(response: unknown): number {
  const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object';
  if (!isRecord(response)) return 0;
  let n = 0;
  for (const configs of Object.values(response)) {
    if (!Array.isArray(configs)) continue;
    for (const config of configs) {
      if (isRecord(config) && isRecord(config.voices)) n += Object.keys(config.voices).length;
    }
  }
  return n;
}
