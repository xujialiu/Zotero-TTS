import { PREF_PREFIX, type PrefsBackend } from './settings';

export interface VoiceChoice { id: string; lang: string }
export interface DocumentVoice { voice: VoiceChoice; manual: boolean; ts: number }
export const DEFAULT_VOICE_KEY = 'readAloud.defaultVoice';
export const DOCUMENT_VOICE_BRANCH = 'documentVoices.';
export const DOCUMENT_VOICE_CHANGED = 'zotero-tts.documentVoiceChanged';

export function parseVoice(value: unknown): VoiceChoice | null {
  if (!value || typeof value !== 'object') return null;
  const { id, lang } = value as Record<string, unknown>;
  return typeof id === 'string' && !!id && id.length <= 2048 && typeof lang === 'string' && /^[a-z]{2,3}(?:-[A-Za-z0-9]+)*$/.test(lang)
    ? { id, lang } : null;
}

function json(value: unknown): unknown {
  try { return typeof value === 'string' ? JSON.parse(value) : null; } catch { return null; }
}

export function readDefaultVoice(prefs: PrefsBackend): VoiceChoice | null {
  return parseVoice(json(prefs.get(PREF_PREFIX + DEFAULT_VOICE_KEY)));
}

export function writeDefaultVoice(prefs: PrefsBackend, voice: VoiceChoice | null): void {
  prefs.set(PREF_PREFIX + DEFAULT_VOICE_KEY, voice ? JSON.stringify(voice) : '');
}

export function isDocumentVoiceKey(key: string): boolean {
  return /^documentVoices\.(?:user|group-[1-9]\d*)\/[A-Z0-9]{8}$/.test(key);
}

export function parseDocumentVoice(value: unknown): DocumentVoice | null {
  const raw = json(value);
  if (!raw || typeof raw !== 'object') return null;
  const { voice, manual, ts } = raw as Record<string, unknown>;
  const choice = parseVoice(voice);
  return choice && typeof manual === 'boolean' && typeof ts === 'number' && Number.isSafeInteger(ts) && ts > 0
    ? { voice: choice, manual, ts } : null;
}

/** Positive means a wins. Manual intent outranks initialization; ties converge. */
export function compareDocumentVoices(a: DocumentVoice, b: DocumentVoice): number {
  const left = JSON.stringify(a.voice), right = JSON.stringify(b.voice);
  return Number(a.manual) - Number(b.manual) || a.ts - b.ts || (left < right ? -1 : left > right ? 1 : 0);
}

export function documentVoiceSettings(prefs: PrefsBackend): Record<string, string> {
  const values: Record<string, string> = {};
  for (const full of prefs.keys?.(PREF_PREFIX + DOCUMENT_VOICE_BRANCH) ?? []) {
    const key = full.slice(PREF_PREFIX.length);
    const record = parseDocumentVoice(prefs.get(full));
    if (isDocumentVoiceKey(key) && record) values[key] = JSON.stringify(record);
  }
  return values;
}

export function createDocumentVoices(prefs: PrefsBackend, now = Date.now) {
  function key(document: string): string {
    const name = DOCUMENT_VOICE_BRANCH + document;
    if (!isDocumentVoiceKey(name)) throw new Error('Invalid document voice identity');
    return PREF_PREFIX + name;
  }
  function get(document: string): DocumentVoice | null { return parseDocumentVoice(prefs.get(key(document))); }
  function save(document: string, voice: VoiceChoice, manual: boolean): DocumentVoice {
    const record = { voice, manual, ts: Math.max(now(), (get(document)?.ts ?? 0) + 1) };
    prefs.set(key(document), JSON.stringify(record));
    // Dynamic keys cannot be registered in advance. One pulse drives debounce,
    // while the record's timestamp (not the pulse) carries the choice's age.
    const pulse = PREF_PREFIX + 'documentVoiceChanged';
    prefs.set(pulse, String(Number(prefs.get(pulse) || 0) + 1));
    return record;
  }
  return {
    get,
    open(document: string): DocumentVoice | null {
      const existing = get(document);
      if (existing) return existing;
      const voice = readDefaultVoice(prefs);
      return voice ? save(document, voice, false) : null;
    },
    choose(document: string, voice: VoiceChoice): DocumentVoice { return save(document, voice, true); },
  };
}
