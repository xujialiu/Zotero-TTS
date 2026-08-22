import { MULTILINGUAL } from '../../core/providers/types';
import { resolveVoiceLang, type VoiceEntry, type VoicesMap } from '../../core/read-aloud-speed';
import { PREF_PREFIX, type PrefsBackend } from '../../core/settings';
import { PLUGIN_TIER } from './voice-catalog';

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
 * A starting point when nothing has been remembered yet: a speed from
 * Zotero's pref (one entry is as good as another — all came from the same
 * slider), and the `mul` entry's voice, since a voice chosen under "Multiple
 * languages" can only have been meant for every document. A single-language
 * entry says nothing about what the user wants elsewhere.
 */
export function memoryFromVoices(voices: VoicesMap): ReadAloudMemory {
  let speed: number | null = null;
  for (const entry of Object.values(voices)) {
    speed = speedOf(entry);
    if (speed !== null) break;
  }
  const multilingual = voiceOf(voices[MULTILINGUAL]);
  return { speed, voice: multilingual ? { id: multilingual, lang: MULTILINGUAL } : null };
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
 * What to put in place before Zotero's `_syncPersistedVoicesToManager` runs
 * for a document whose language the manager has just learned. Everything
 * goes through Zotero's own pref and its own resolution, so its popup,
 * fallbacks and persistence keep working as they are: the manager is moved
 * to `mul` when the remembered voice is multilingual, and the entry Zotero
 * will read gets the remembered speed (and, for `mul`, the remembered
 * voice, should the entry have drifted or been lost).
 */
export function planSync(managerLang: string | null, voices: VoicesMap, memory: ReadAloudMemory): SyncPlan {
  if (!managerLang) return { lang: null, voices: null };
  const multilingual = memory.voice?.lang === MULTILINGUAL ? memory.voice : null;
  const lang = multilingual ? MULTILINGUAL : managerLang;
  const key = resolveVoiceLang(lang, Object.keys(voices)) ?? lang;
  const entry = voices[key] ?? {};
  let next = entry;
  if (memory.speed !== null && speedOf(entry) !== memory.speed) next = { ...next, speed: memory.speed };
  if (multilingual && voiceOf(entry) !== multilingual.id) {
    const tierVoices = entry.tierVoices && typeof entry.tierVoices === 'object' ? (entry.tierVoices as Record<string, unknown>) : {};
    next = { ...next, voice: multilingual.id, tierVoices: { ...tierVoices, [PLUGIN_TIER]: multilingual.id } };
  }
  return { lang, voices: next === entry ? null : { ...voices, [key]: next } };
}
