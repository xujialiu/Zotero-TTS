import type { PrefsBackend } from '../core/settings';
import { writeDefaultVoice } from '../core/document-voices';
import type { VoiceChoice } from './read-aloud-memory';

/** The global default initializes new documents; it never edits an existing document. */
export const SAME_VOICE_OBSERVER = 'zotero-tts.readAloud.defaultVoice';

export interface DefaultVoicePick extends VoiceChoice {
  /** The voice's own region subtag (`CN` for zh-CN; none for mul) — what `_persistCurrentVoice` stores as the entry's region. */
  region: string | null;
  /** Zotero's tier of the voice: the provider's key for the plugin's (voice-catalog.ts tierForProvider, issue #110), `standard` / `premium` for Zotero's own. */
  tier: string;
}

/** The region Zotero's `getVoiceRegion` reads off a locale: everything after the first hyphen. */
export function regionOfLocale(locale: string): string | null {
  const i = locale.indexOf('-');
  return i > 0 && i < locale.length - 1 ? locale.slice(i + 1) : null;
}

export function setDefaultVoice(prefs: PrefsBackend, pick: DefaultVoicePick | null): void {
  writeDefaultVoice(prefs, pick ? { id: pick.id, lang: pick.lang } : null);
}
