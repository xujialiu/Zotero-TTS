import { MULTILINGUAL } from '../core/providers/types';
import { resolveVoiceLang, type VoiceEntry, type VoicesMap } from '../core/read-aloud-speed';
import { PREF_PREFIX, type PrefsBackend } from '../core/settings';
import { decodeVoiceId, PLUGIN_TIER } from './voice-catalog';

/**
 * Zotero remembers the Read Aloud voice and speed per document language
 * (`reader.readAloudVoices`, core/read-aloud-speed.ts), keyed by the language
 * it detects when a document opens. A language without an entry starts at
 * 1.0× with a fallback voice, and a voice chosen under "Multiple languages"
 * lives under the key `mul`, which no document ever resolves to. This module
 * keeps one choice across documents instead: the speed the user last set
 * anywhere, and the voice the user last picked. A multilingual voice is
 * applied to every document — it is the only kind that can read every
 * language. A single-language voice is left to Zotero's per-language memory,
 * which already restores it for documents in its own language; forcing it on
 * other languages would only produce an English voice stumbling over
 * Chinese. The pure decisions live here; memory-sync.ts wires them to Zotero.
 */

export const READ_ALOUD_MEMORY_PREF = PREF_PREFIX + 'readAloud.memory';
/** The same pref as Zotero.Prefs.registerObserver wants it: relative to `extensions.zotero.` (pinned by a test). */
export const READ_ALOUD_MEMORY_OBSERVER = 'zotero-tts.readAloud.memory';

export interface VoiceChoice {
  /** Zotero's voice id (`provider::id` for plugin voices). */
  id: string;
  /** The pref key it was chosen under: a base language, or `mul`. */
  lang: string;
}

export interface ReadAloudMemory {
  speed: number | null;
  voice: VoiceChoice | null;
}

export const EMPTY_MEMORY: ReadAloudMemory = Object.freeze({ speed: null, voice: null });

const validSpeed = (s: unknown): s is number => typeof s === 'number' && Number.isFinite(s) && s > 0;
const speedOf = (entry: VoiceEntry | undefined): number | null => (validSpeed(entry?.speed) ? entry.speed : null);
const voiceOf = (entry: VoiceEntry | undefined): string | null =>
  typeof entry?.voice === 'string' && entry.voice ? entry.voice : null;

export function readMemory(prefs: PrefsBackend): ReadAloudMemory {
  try {
    const raw = prefs.get(READ_ALOUD_MEMORY_PREF);
    if (typeof raw !== 'string' || !raw) return EMPTY_MEMORY;
    const parsed = JSON.parse(raw) as { speed?: unknown; voice?: { id?: unknown; lang?: unknown } | null };
    const speed = validSpeed(parsed.speed) ? parsed.speed : null;
    const v = parsed.voice;
    const voice = v && typeof v.id === 'string' && v.id && typeof v.lang === 'string' && v.lang ? { id: v.id, lang: v.lang } : null;
    return { speed, voice };
  } catch {
    return EMPTY_MEMORY;
  }
}

export function writeMemory(prefs: PrefsBackend, memory: ReadAloudMemory): void {
  prefs.set(READ_ALOUD_MEMORY_PREF, JSON.stringify({ speed: memory.speed, voice: memory.voice }));
}

/**
 * The key Zotero persists a choice made under `locale` under — the reader's
 * `getBaseLanguage` (`_persistCurrentVoice`, bundle ~82100): everything
 * before the first hyphen, so `zh` for zh-CN, and `mul` itself for the
 * multilingual group, which has no region. A row of the settings' voice
 * browser and a pick in the popup meet on this key.
 */
export function memoryLangForLocale(locale: string): string {
  return locale.replace(/-.+$/, '');
}

/**
 * A starting point when nothing has been remembered yet: a speed from
 * Zotero's pref (one entry is as good as another — all came from the same
 * slider), and a globally-usable voice — the `mul` entry's, since a voice
 * chosen under "Multiple languages" can only have been meant for every
 * document, else any entry holding a voice that is multilingual by its id
 * (the trace left by the removed multilingualEverywhere switch, which had
 * such voices chosen under concrete languages). A single-language voice
 * says nothing about what the user wants elsewhere.
 */
export function memoryFromVoices(voices: VoicesMap): ReadAloudMemory {
  let speed: number | null = null;
  for (const entry of Object.values(voices)) {
    speed = speedOf(entry);
    if (speed !== null) break;
  }
  const multilingual = voiceOf(voices[MULTILINGUAL]);
  if (multilingual) return { speed, voice: { id: multilingual, lang: MULTILINGUAL } };
  for (const [lang, entry] of Object.entries(voices)) {
    const voice = voiceOf(entry);
    if (voice && isMultilingualVoiceId(voice)) return { speed, voice: { id: voice, lang } };
  }
  return { speed, voice: null };
}

/**
 * What the user just did, read off the way Zotero's pref moved. Zotero
 * rewrites one language's entry per user action: the speed slider (and the
 * plugin's shortcuts) change `speed`; picking a voice or tier changes
 * `voice`. When both move at once the voice is incidental — the slider
 * persisted whatever fallback voice happened to be active — so only the
 * speed is learned. Switching the popup's language without picking a voice
 * rewrites the same values and is invisible here, deliberately: it is not a
 * voice choice. Returns the same object when nothing was learned.
 */
export function noteVoicesChange(prev: VoicesMap, next: VoicesMap, memory: ReadAloudMemory): ReadAloudMemory {
  let out = memory;
  for (const [lang, entry] of Object.entries(next)) {
    const before = prev[lang];
    const speed = speedOf(entry);
    const voice = voiceOf(entry);
    const speedMoved = speed !== null && speed !== (before ? speedOf(before) : out.speed);
    if (speedMoved && speed !== out.speed) out = { ...out, speed };
    const voiceMoved = voice !== null && voice !== voiceOf(before);
    if (voiceMoved && !speedMoved && (out.voice?.id !== voice || out.voice.lang !== lang)) {
      out = { ...out, voice: { id: voice, lang } };
    }
  }
  return out;
}

export interface SyncPlan {
  /** The language the manager should be on before Zotero restores from the pref; null when there is nothing to do. */
  lang: string | null;
  /** The pref to store first, or null when it already says the right thing. */
  voices: VoicesMap | null;
}

/**
 * Whether this voice id can read any language. The catalog offers such
 * voices under "Multiple languages" now, so new choices carry the
 * `lang === 'mul'` marker — but pref entries written while the removed
 * multilingualEverywhere switch published them under every language hold
 * them under `en` or `zh`, and this is what still recognizes those. Every
 * OpenAI(-compatible) voice is multilingual by construction; Azure's say
 * so in their id ("en-US-AvaMultilingualNeural"); the local engines'
 * voices all have concrete locales.
 */
export function isMultilingualVoiceId(id: string): boolean {
  const decoded = decodeVoiceId(id);
  if (!decoded) return false;
  if (decoded.provider === 'openai') return true;
  if (decoded.provider === 'azure') return /multilingual/i.test(decoded.voiceId);
  return false;
}

/**
 * Whether a remembered voice is applied to every document: chosen under
 * "Multiple languages", or multilingual by its id (above). Any other voice
 * reads one language and applies to documents in that language only.
 */
export function isGlobalVoice(choice: VoiceChoice): boolean {
  return choice.lang === MULTILINGUAL || isMultilingualVoiceId(choice.id);
}

export function sameChoice(a: VoiceChoice | null, b: VoiceChoice | null): boolean {
  return a === b || (!!a && !!b && a.id === b.id && a.lang === b.lang);
}

/**
 * What to put in place before Zotero's `_syncPersistedVoicesToManager` runs
 * for a document whose language the manager has just learned. Everything
 * goes through Zotero's own pref and its own resolution, so its popup,
 * fallbacks and persistence keep working as they are. A remembered voice is
 * applied to every document when it is globally usable (isGlobalVoice). The
 * manager is moved to `mul` first, where the catalog publishes such voices:
 * Zotero drops voices whose language does not match the manager's.
 * `docLang` is the document's language — what the manager is on, or was on
 * before memory-sync moved it to `mul` — so a voice that is not global
 * sends a manager back there and Zotero restores its own choice for it.
 */
export function planSync(docLang: string | null, voices: VoicesMap, memory: ReadAloudMemory): SyncPlan {
  if (!docLang) return { lang: null, voices: null };
  const global = memory.voice && isGlobalVoice(memory.voice) ? memory.voice : null;
  const lang = global ? MULTILINGUAL : docLang;
  const key = resolveVoiceLang(lang, Object.keys(voices)) ?? lang;
  const entry = voices[key] ?? {};
  let next = entry;
  if (memory.speed !== null && speedOf(entry) !== memory.speed) next = { ...next, speed: memory.speed };
  if (global && voiceOf(entry) !== global.id) {
    const tierVoices = entry.tierVoices && typeof entry.tierVoices === 'object' ? (entry.tierVoices as Record<string, unknown>) : {};
    next = { ...next, voice: global.id, tierVoices: { ...tierVoices, [PLUGIN_TIER]: global.id } };
  }
  return { lang, voices: next === entry ? null : { ...voices, [key]: next } };
}
