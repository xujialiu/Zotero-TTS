import { MULTILINGUAL } from '../core/providers/types';
import { resolveVoiceLang, type VoiceEntry, type VoicesMap } from '../core/read-aloud-speed';
import { PREF_PREFIX, type PrefsBackend } from '../core/settings';
import { compareVoiceLabels, decodeVoiceId, PLUGIN_TIER, type ListedVoice } from './voice-catalog';

/**
 * Zotero remembers the Read Aloud voice and speed per document language
 * (`reader.readAloudVoices`, core/read-aloud-speed.ts), keyed by the language
 * it detects when a document opens. A language without an entry starts at
 * 1.0× with a fallback voice, and a voice chosen under "Multiple languages"
 * lives under the key `mul`, which no document ever resolves to. This module
 * keeps one choice across documents instead: the speed the user last set
 * anywhere, and the voice the user last picked — applied to every document
 * whatever its language (the user's rule, 2026-08-27: one voice everywhere,
 * an English voice on a Chinese PDF included). Zotero offers a voice only
 * under its own language, so a document is moved to the voice's — `mul`
 * for a multilingual voice, else the language it was picked under (planSync).
 * The pure decisions live here; memory-sync.ts wires them to Zotero.
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
 * What Read Aloud starts with when the remembered voice is not in the list
 * a reader received (issue #35) — a favorite that is not offered while only
 * favorites are, a provider switched off, a server that did not answer.
 * Zotero's own fallback (`_findFallbackVoice`) takes any voice for the
 * language once the entry's is missing, a metered Standard one included,
 * and says nothing. This takes the first **Local** voice the list offers —
 * never a Standard or Premium one — favorites before the rest, the
 * document's language before Multiple languages before other languages,
 * and within a rank the voice browser's order. Null when the list has no
 * Local voice at all, which leaves the choice to Zotero.
 */
export function pickSubstitute(listed: readonly ListedVoice[], favorites: readonly string[], docLang: string | null): ListedVoice | null {
  const wanted = new Set(favorites);
  const base = docLang ? memoryLangForLocale(docLang) : null;
  const rank = (voice: ListedVoice): [number, number] => {
    const language = memoryLangForLocale(voice.language);
    return [wanted.has(voice.id) ? 0 : 1, base !== null && language === base ? 0 : language === MULTILINGUAL ? 1 : 2];
  };
  const compare = (a: ListedVoice, ra: [number, number], b: ListedVoice, rb: [number, number]): number =>
    ra[0] - rb[0] || ra[1] - rb[1] || compareVoiceLabels(a.label, b.label) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  let best: ListedVoice | null = null;
  let bestRank: [number, number] = [0, 0];
  for (const voice of listed) {
    if (voice.tier !== PLUGIN_TIER) continue;
    const r = rank(voice);
    if (best === null || compare(voice, r, best, bestRank) < 0) {
      best = voice;
      bestRank = r;
    }
  }
  return best;
}

/**
 * The line the reader shows when Read Aloud does not start with the
 * remembered voice: which voice is not offered, and what reads instead —
 * the substitute, or Zotero's own choice when no Local voice is offered,
 * with a word about credits when a Standard or Premium voice covers the
 * document's language (`paidOffered`). The effect, never the mechanism.
 */
export function substitutionMessage(missing: string, instead: string | null, paidOffered: boolean): string {
  if (instead) return `Zotero-TTS: ${missing} is not offered here. Reading with ${instead} instead.`;
  return `Zotero-TTS: ${missing} is not offered here, and no Local voice is. Zotero picks the voice${paidOffered ? '; it may use credits' : ''}.`;
}

/**
 * What to put in place before Zotero's `_syncPersistedVoicesToManager` runs
 * for a document whose language the manager has just learned. Everything
 * goes through Zotero's own pref and its own resolution, so its popup,
 * fallbacks and persistence keep working as they are. The remembered voice
 * goes to every document, whatever its language (the user's rule: one
 * voice everywhere, 2026-08-27): the manager is moved to the voice's own
 * lane — `mul` for a multilingual voice (isGlobalVoice), where the catalog
 * publishes it, else the language it was picked under — because Zotero
 * drops voices whose language does not match the manager's; and that
 * lane's entry is made to name the voice, with its tier pushed to the end
 * of `tierVoices`, where `_findFallbackVoice` looks first. `tier` is the
 * voice's tier as the manager lists it (`local` for the plugin's own is
 * known from the id); unknown, the entry's `voice` alone is set. `docLang`
 * is the document's language — what the manager is on, or was on before
 * memory-sync moved it — so with no voice remembered the manager goes back
 * there and Zotero restores its own choice for it. The entry is the one
 * Zotero's own resolution reads for `lang` (`resolveVoiceLang`, with
 * `preferred` as its `navigator.languages`) — created under the tag
 * verbatim when none resolves, as Zotero would (issue #26).
 */
export function planSync(docLang: string | null, voices: VoicesMap, memory: ReadAloudMemory, tier: string | null = null, preferred: readonly string[] = []): SyncPlan {
  if (!docLang) return { lang: null, voices: null };
  const voice = memory.voice;
  const lang = voice ? (isGlobalVoice(voice) ? MULTILINGUAL : voice.lang) : docLang;
  const key = resolveVoiceLang(lang, Object.keys(voices), preferred) ?? lang;
  const entry = voices[key] ?? {};
  let next = entry;
  if (memory.speed !== null && speedOf(entry) !== memory.speed) next = { ...next, speed: memory.speed };
  if (voice) {
    const tierVoices = entry.tierVoices && typeof entry.tierVoices === 'object' ? (entry.tierVoices as Record<string, unknown>) : {};
    const voiceTier = tier ?? (decodeVoiceId(voice.id) ? PLUGIN_TIER : null);
    const keys = Object.keys(tierVoices);
    const tierLast = !voiceTier || (keys[keys.length - 1] === voiceTier && tierVoices[voiceTier] === voice.id);
    if (voiceOf(entry) !== voice.id || !tierLast) {
      const rest: Record<string, unknown> = { ...tierVoices };
      if (voiceTier) {
        delete rest[voiceTier];
        rest[voiceTier] = voice.id;
      }
      next = { ...next, voice: voice.id, tierVoices: rest };
    }
  }
  return { lang, voices: next === entry ? null : { ...voices, [key]: next } };
}
