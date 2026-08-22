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

export function nextSpeed(current: number, action: SpeedAction): number {
  const base = Number.isFinite(current) && current > 0 ? current : SPEED_DEFAULT;
  let next: number;
  if (action === 'speedReset') next = SPEED_DEFAULT;
  else if (action === 'speedUp') next = base + SPEED_STEP;
  else next = base - SPEED_STEP;
  // One decimal: 1.1 + 0.1 is 1.2000000000000002 in floating point
  next = Math.round(next * 10) / 10;
  return Math.min(SPEED_MAX, Math.max(SPEED_MIN, next));
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

const baseLanguage = (lang: string) => lang.split(/[-_]/)[0].toLowerCase();

/** Mirror of the reader's resolveLanguage(): an exact key, else one sharing the base language. */
export function resolveVoiceLang(lang: string | null, keys: string[]): string | null {
  if (!lang) return null;
  if (keys.includes(lang)) return lang;
  const base = baseLanguage(lang);
  return keys.find((k) => baseLanguage(k) === base) ?? null;
}

/** The speed Zotero last persisted for the language, else for any language, else 1. */
export function readPersistedSpeed(prefs: PrefsBackend, lang: string | null): number {
  const voices = readReadAloudVoices(prefs);
  const key = resolveVoiceLang(lang, Object.keys(voices));
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
 * or no manager at all).
 */
export function persistSpeed(prefs: PrefsBackend, lang: string | null, speed: number): void {
  const voices = readReadAloudVoices(prefs);
  const key = resolveVoiceLang(lang, Object.keys(voices));
  if (key) {
    voices[key] = { ...voices[key], speed };
  } else if (lang) {
    voices[lang] = { speed };
  } else {
    for (const k of Object.keys(voices)) voices[k] = { ...voices[k], speed };
  }
  prefs.set(READ_ALOUD_VOICES_PREF, JSON.stringify(voices));
}
