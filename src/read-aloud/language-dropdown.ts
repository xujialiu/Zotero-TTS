/**
 * The popup's language dropdown, modeled: which entry a voice files under
 * and what the entry is called — so the voice browser's language column
 * (ui/voice-browser-rows.ts) is that dropdown, entry for entry and name
 * for name. Zotero's rules, from the reader bundle:
 *
 * - A voice files under its *normalized* language (`normalizeLanguage`,
 *   reader.js ~38005, which `getSupportedLanguages` applies to every
 *   voice): `cmn` is `zh`, the Chinese regions are dropped (zh-CN, zh-HK
 *   and zh-TW all file under `zh` — Zotero's own tiers do not name them),
 *   and the Arabic ar-XA / ar-SA become `ar-001`. So the dropdown has one
 *   "Chinese", and choosing it offers every Chinese voice
 *   (`isLanguageSupported`: no region asked for, any variant accepted).
 * - An entry is named through `Intl.DisplayNames` with `languageDisplay:
 *   'standard'` — "English (United States)", not the default's "American
 *   English" — and carries its region only where the list holds the base
 *   language in more than one region; "English" alone otherwise
 *   (LanguageRegionSelect, ~38105). The list is the selected tier's
 *   (`manager.languages` filters by `_selectedTier`), so one language
 *   reads "English" in a tier and "English (United States)" in another.
 *
 * The dropdown's order — "Multiple languages" first, the rest by label —
 * is multilingual-first.ts's business; the browser sorts its column the
 * same way.
 */

/** Zotero's LANGUAGE_EQUIVALENTS and REGION_EQUIVALENTS (reader.js ~37977). */
const LANGUAGE_EQUIVALENTS: Record<string, string> = { cmn: 'zh' };
const REGION_EQUIVALENTS: Record<string, string> = { XA: '001', SA: '001', CN: '', HK: '', TW: '' };

/** Zotero's `getBaseLanguage`: the tag up to its first hyphen. */
export function baseLanguage(lang: string): string {
  return lang.replace(/-.+$/, '');
}

/** The dropdown entry a voice of this locale files under: Zotero's `normalizeLanguage`. */
export function dropdownLanguage(locale: string): string {
  const base = baseLanguage(locale);
  const region = locale.includes('-') ? locale.slice(base.length + 1) : '';
  const normalizedBase = LANGUAGE_EQUIVALENTS[base] ?? base;
  const normalizedRegion = REGION_EQUIVALENTS[region] ?? region;
  return normalizedRegion ? `${normalizedBase}-${normalizedRegion}` : normalizedBase;
}

/**
 * The entries' names, as LanguageRegionSelect writes them: with the region
 * only where the list holds the base language in several regions.
 * `displayName` renders a tag the way the dropdown does (languageDisplayName;
 * the tests hand in a table).
 */
export function dropdownLabels(languages: Iterable<string>, displayName: (code: string) => string): Map<string, string> {
  const list = [...new Set(languages)];
  const regions = new Map<string, number>();
  for (const language of list) regions.set(baseLanguage(language), (regions.get(baseLanguage(language)) ?? 0) + 1);
  return new Map(list.map((language) => [language, displayName((regions.get(baseLanguage(language)) ?? 0) > 1 ? language : baseLanguage(language))]));
}

/**
 * A tag's display name the way the dropdown renders one — `languageDisplay:
 * 'standard'`, in the given locale (the app's when none) — or the tag
 * itself when ICU cannot name it.
 */
export function languageDisplayName(code: string, locale?: string): string {
  try {
    return new Intl.DisplayNames(locale ? [locale] : undefined, { type: 'language', languageDisplay: 'standard' }).of(code) ?? code;
  } catch {
    return code;
  }
}
