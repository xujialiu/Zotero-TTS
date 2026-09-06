/**
 * The operating system's voices as the plugin publishes them, and the bridge
 * back to the same voices as Zotero's reader lists them.
 *
 * **The id is the engine token, never the name.** `sapi5/TTS_MS_EN-US_DAVID_11.0`,
 * `onecore/MSTTS_V110_enUS_MarkM`: the registry token, prefixed by the API
 * that serves it. Ids end up in `reader.readAloudVoices`, in the plugin's
 * memory and in the audio cache, so they have to survive everything that is
 * not a reinstall of the voice — and the obvious alternative, the voice's
 * description, does not: it is localized ("Microsoft David - English (United
 * States)" is "Microsoft David - 英語 (米国)" on a Japanese Windows), so it
 * changes when the display language does. Tokens are ASCII and fixed.
 *
 * **The description is still needed**, for exactly one thing: Gecko builds
 * its `voiceURI` as `urn:moz-tts:sapi:<description>?<lang>` and Zotero's
 * reader publishes that as `local-<voiceURI>` (reader.js:39627). Both
 * Windows APIs report exactly that description — measured on all nine voices
 * of this machine, one for one — so `zoteroVoiceId` is an exact mapping and
 * never a guess. It is what lets a voice the user already picked keep
 * playing after the provider takes over (migrateChoices in
 * read-aloud/system-voice-choices.ts).
 *
 * **macOS needs no such guess** (issue #23): Gecko's backend there
 * publishes `urn:moz-tts:osx:<identifier>` with no language suffix, and the
 * identifier is the plugin's id itself (`osx/<identifier>`, mac.ts) — so
 * the mapping is the id, and the name and locale ride along for display.
 */

import type { VoiceInfo } from '../types';
import { OSX_ID_PREFIX, type SystemVoiceRecord } from './protocol';

/** How Gecko's Windows backend spells a system voice; the reader prefixes `local-` to it. */
export const MOZ_TTS_SAPI_PREFIX = 'urn:moz-tts:sapi:';
/** How Gecko's macOS backend spells one: the identifier, nothing after it. */
export const MOZ_TTS_OSX_PREFIX = 'urn:moz-tts:osx:';

/**
 * The reader's own id for the same voice, as `BrowserReadAloudVoice` builds
 * it — or null for a Windows record without a description, which could only
 * match by accident.
 */
export function zoteroVoiceId(record: Pick<SystemVoiceRecord, 'id' | 'desc' | 'lang'>): string | null {
  if (record.id.startsWith(OSX_ID_PREFIX)) return `local-${MOZ_TTS_OSX_PREFIX}${record.id.slice(OSX_ID_PREFIX.length)}`;
  if (!record.desc) return null;
  return `local-${MOZ_TTS_SAPI_PREFIX}${record.desc}?${record.lang}`;
}

/**
 * Locale as the catalog wants it. Windows reports a full BCP-47 tag
 * ("en-US", "zh-CN"); a voice that reports only a bare language is left as
 * it is, which is what Zotero's language dropdown groups on anyway.
 */
export function localeForSystemVoice(record: Pick<SystemVoiceRecord, 'lang'>): string {
  return record.lang.trim() || 'en-US';
}

/**
 * The catalog entry. The label is the voice's plain name ("Microsoft
 * David"), not its description: the description repeats the language, which
 * the catalog already carries and the popup already groups by, and
 * voice-catalog.ts puts the provider in front — so the player shows
 * "System-Microsoft David" beside "System-Microsoft David Desktop", which is
 * exactly the distinction that matters.
 */
export function toVoiceInfo(record: SystemVoiceRecord): VoiceInfo {
  return { id: record.id, label: record.name || record.desc || record.id, locale: localeForSystemVoice(record) };
}

/** Records the daemon reported, with anything malformed dropped rather than published half-formed. */
export function readVoiceRecords(raw: unknown): SystemVoiceRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: SystemVoiceRecord[] = [];
  for (const entry of raw) {
    const record = entry as Partial<SystemVoiceRecord> | null;
    if (!record || typeof record.id !== 'string' || !record.id) continue;
    out.push({
      id: record.id,
      name: typeof record.name === 'string' ? record.name : '',
      desc: typeof record.desc === 'string' ? record.desc : '',
      lang: typeof record.lang === 'string' ? record.lang : '',
    });
  }
  return out;
}

/**
 * The plugin's raw voice id for one of the reader's own system-voice ids, or
 * null when no installed voice answers to it. Null is the whole point: a
 * voice we cannot map is left to Zotero rather than guessed at, so a choice
 * never silently becomes a different voice.
 */
export function systemVoiceIdFor(zoteroId: string, records: readonly SystemVoiceRecord[]): string | null {
  for (const record of records) {
    const id = zoteroVoiceId(record);
    if (id !== null && id === zoteroId) return record.id;
  }
  return null;
}
