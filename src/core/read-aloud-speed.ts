import type { PrefsBackend } from './settings';

/**
 * Read Aloud playback speed, as Zotero's own popup slider defines it:
 * 0.5×–3.0× in steps of 0.1. These are Zotero's numbers, not ours; the
 * shortcuts must land on the same values the slider can show.
 */
export const SPEED_MIN = 0.5;
export const SPEED_MAX = 3;
export const SPEED_STEP = 0.1;
export const SPEED_DEFAULT = 1;

export type SpeedAction = 'speedReset' | 'speedDown' | 'speedUp';
export const SPEED_ACTIONS: readonly SpeedAction[] = ['speedReset', 'speedDown', 'speedUp'];

/**
 * Zotero's pref, written by ReaderInstance._setReadAloudVoice():
 * `{ [lang]: { region, voice, speed, tierVoices } }`. The reader applies
 * `speed` from here when it prepares Read Aloud (popup opened, voice set,
 * language reported — reader._syncPersistedVoicesToManager), so it is the
 * persistent source of truth for playback speed.
 */
export const READ_ALOUD_VOICES_PREF = 'extensions.zotero.reader.readAloudVoices';

/** A value the slider can show: one decimal (1.1 + 0.1 is 1.2000000000000002 in floating point), within its range; anything that is not a number reads as 1. */
export function clampSpeed(value: number): number {
  if (!Number.isFinite(value)) return SPEED_DEFAULT;
  return Math.min(SPEED_MAX, Math.max(SPEED_MIN, Math.round(value * 10) / 10));
}

export function nextSpeed(current: number, action: SpeedAction): number {
  const base = Number.isFinite(current) && current > 0 ? current : SPEED_DEFAULT;
  if (action === 'speedReset') return SPEED_DEFAULT;
  return clampSpeed(action === 'speedUp' ? base + SPEED_STEP : base - SPEED_STEP);
}

/** One language's entry in the pref: `{ region, voice, speed, tierVoices }`, any of which may be missing. */
export type VoiceEntry = Record<string, unknown>;
export type VoicesMap = Record<string, VoiceEntry>;

/** Zotero's pref, parsed; an unset or damaged value reads as empty. */
export function readReadAloudVoices(prefs: PrefsBackend): VoicesMap {
  try {
    const raw = prefs.get(READ_ALOUD_VOICES_PREF);
    if (typeof raw !== 'string' || !raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as VoicesMap) : {};
  } catch {
    return {};
  }
}

/*
 * Zotero's own language resolution for the pref's keys, ported line for
 * line from the reader bundle (src/common/read-aloud/lang.ts; 10.0.2-beta.1
 * reader.js 37977-38100), so that a speed is written under exactly the key
 * `_syncPersistedVoicesToManager` will read back (issue #26). The tables
 * are Zotero's. Nothing lowercases and nothing splits on `_`: a document
 * tagged `en_US` or `EN` is its own language to Zotero, read and written
 * under that tag verbatim, and must be to the plugin too.
 */
const LANGUAGE_EQUIVALENTS: Record<string, string> = { cmn: 'zh' };
const REGION_EQUIVALENTS: Record<string, string> = { XA: '001', SA: '001', CN: '', HK: '', TW: '' };
const DEFAULT_REGIONS: Record<string, string> = { zh: 'CN', nl: 'NL', en: 'US', fr: 'FR', pt: 'BR', es: 'ES' };

const lookup = (table: Record<string, string>, key: string): string | undefined =>
  Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;

/** Everything before the first hyphen — Zotero's getBaseLanguage, which is also the key it persists under. */
const getBaseLanguage = (lang: string): string => lang.replace(/-.+$/g, '');

function normalizeLanguage(lang: string): string {
  const base = getBaseLanguage(lang);
  const region = lang.includes('-') ? lang.substring(base.length + 1) : '';
  const normalizedBase = lookup(LANGUAGE_EQUIVALENTS, base) ?? base;
  const normalizedRegion = lookup(REGION_EQUIVALENTS, region) ?? region;
  return normalizedRegion ? `${normalizedBase}-${normalizedRegion}` : normalizedBase;
}

/** The first of `preferred` in the base language names the region, else Zotero's default for it, else none. */
function getPreferredRegion(baseLang: string, preferred: readonly string[]): string | null {
  const normalizedBase = lookup(LANGUAGE_EQUIVALENTS, baseLang) ?? baseLang;
  for (const userLang of preferred) {
    const normalized = normalizeLanguage(userLang);
    if (normalized.startsWith(normalizedBase + '-')) return normalized.substring(normalizedBase.length + 1);
  }
  return lookup(DEFAULT_REGIONS, normalizedBase) ?? null;
}

/**
 * The key of Zotero's pref a language resolves to, as the reader's
 * `resolveLanguage(lang, langs)` resolves it: an exact key, else among the
 * keys sharing the normalized base language an exact regional match, then
 * the preferred region, then the first. `preferred` stands in for the
 * `navigator.languages` Zotero reads, which the plugin sandbox has none of;
 * empty, Zotero's default regions decide, as they do for Zotero when no
 * navigator language matches. Null means Zotero reads nothing for the
 * language, and would create an entry under the tag itself.
 */
export function resolveVoiceLang(lang: string | null, keys: readonly string[], preferred: readonly string[] = []): string | null {
  if (!lang || !keys.length) return null;
  if (keys.includes(lang)) return lang;
  const normalizedLang = normalizeLanguage(lang);
  const baseLang = getBaseLanguage(normalizedLang);
  const candidates = keys.filter((candidate) => getBaseLanguage(normalizeLanguage(candidate)) === baseLang);
  if (!candidates.length) return null;
  if (normalizedLang.includes('-')) {
    const exactMatch = candidates.find((c) => normalizeLanguage(c) === normalizedLang);
    if (exactMatch) return exactMatch;
  }
  const preferredRegion = getPreferredRegion(baseLang, preferred);
  if (preferredRegion) {
    const regionMatch = candidates.find((c) => normalizeLanguage(c) === `${baseLang}-${preferredRegion}`);
    if (regionMatch) return regionMatch;
  }
  return candidates[0];
}

/** The speed Zotero last persisted for the language, else for any language, else 1. */
export function readPersistedSpeed(prefs: PrefsBackend, lang: string | null, preferred: readonly string[] = []): number {
  const voices = readReadAloudVoices(prefs);
  const key = resolveVoiceLang(lang, Object.keys(voices), preferred);
  const candidates = key ? [voices[key], ...Object.values(voices)] : Object.values(voices);
  for (const entry of candidates) {
    const speed = entry?.speed;
    if (typeof speed === 'number' && Number.isFinite(speed) && speed > 0) return speed;
  }
  return SPEED_DEFAULT;
}

/**
 * Store the speed the way Zotero would, touching only the `speed` field so
 * the voice, region and tier choices Zotero keeps beside it survive. Used
 * when the reader's manager cannot persist for us (no voice selected yet,
 * or no manager at all). A language no key resolves to gets the entry
 * Zotero itself would create for it — under the tag verbatim.
 */
export function persistSpeed(prefs: PrefsBackend, lang: string | null, speed: number, preferred: readonly string[] = []): void {
  const voices = readReadAloudVoices(prefs);
  const key = resolveVoiceLang(lang, Object.keys(voices), preferred);
  if (key) {
    voices[key] = { ...voices[key], speed };
  } else if (lang) {
    voices[lang] = { speed };
  } else {
    for (const k of Object.keys(voices)) voices[k] = { ...voices[k], speed };
  }
  prefs.set(READ_ALOUD_VOICES_PREF, JSON.stringify(voices));
}
