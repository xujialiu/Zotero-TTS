/**
 * Keeping a voice the user already picked, when the system provider takes
 * over from Zotero's own copy of it (issue #12, decision 1).
 *
 * Zotero remembers a Read Aloud voice by id, in its own pref per language
 * (`reader.readAloudVoices`) and in the plugin's memory
 * (read-aloud/read-aloud-memory.ts). Its id for an operating-system voice is
 * `local-urn:moz-tts:sapi:<description>?<lang>`. Switching the provider on
 * hides those voices, so every such id becomes a ghost: Zotero's
 * `_findFallbackVoice` quietly picks something else and the user's voice
 * appears to have changed by itself.
 *
 * So the ids are rewritten to the plugin's equivalents — but only where the
 * mapping is exact. Both Windows APIs report a description that is
 * character for character the one Gecko builds its `voiceURI` from
 * (core/providers/system/voices.ts), so a match is proof, not a guess; a
 * choice that matches nothing installed is left exactly as it is, and
 * Zotero's own fallback handles it as it always did.
 *
 * Pure, and applied once — by the pane, at the moment the provider's
 * connection check passes, which is also the moment the voice list is in
 * hand.
 */

import type { SystemVoiceRecord } from '../core/providers/system/protocol';
import { systemVoiceIdFor } from '../core/providers/system/voices';
import type { VoicesMap } from '../core/read-aloud-speed';
import type { ReadAloudMemory } from './read-aloud-memory';
import { encodeVoiceId, PLUGIN_TIER } from './voice-catalog';

/** The plugin's encoded id for one of Zotero's system-voice ids, or null when nothing installed answers to it. */
export function pluginIdForZoteroVoice(zoteroId: string, records: readonly SystemVoiceRecord[]): string | null {
  const raw = systemVoiceIdFor(zoteroId, records);
  return raw === null ? null : encodeVoiceId('system', raw);
}

export interface MigratedChoices {
  /** Zotero's pref, rewritten; null when no entry named a mappable voice. */
  voices: VoicesMap | null;
  /** The plugin's memory, rewritten; null when it did not name one. */
  memory: ReadAloudMemory | null;
  /** Every rewrite made, `from → to`, for the debug output and the pane's line. */
  changes: { from: string; to: string }[];
}

/**
 * Zotero's per-language entries and the plugin's memory, with every
 * system-voice id replaced by the plugin's own. `tierVoices.local` is
 * rewritten alongside `voice`, since `_findFallbackVoice` reads it when the
 * named voice is gone — leaving the old id there would put the ghost back
 * the first time a document resolves to that language.
 */
export function migrateChoices(voices: VoicesMap, memory: ReadAloudMemory, records: readonly SystemVoiceRecord[]): MigratedChoices {
  const changes: { from: string; to: string }[] = [];
  const map = (id: unknown): string | null => {
    if (typeof id !== 'string' || !id) return null;
    const to = pluginIdForZoteroVoice(id, records);
    if (to === null) return null;
    changes.push({ from: id, to });
    return to;
  };

  let nextVoices: VoicesMap | null = null;
  for (const [lang, entry] of Object.entries(voices)) {
    let nextEntry = entry;
    const voice = map(entry?.voice);
    if (voice) nextEntry = { ...nextEntry, voice };
    const tierVoices = entry?.tierVoices;
    if (tierVoices && typeof tierVoices === 'object' && !Array.isArray(tierVoices)) {
      const tiers = tierVoices as Record<string, unknown>;
      const local = map(tiers[PLUGIN_TIER]);
      if (local) nextEntry = { ...nextEntry, tierVoices: { ...tiers, [PLUGIN_TIER]: local } };
    }
    if (nextEntry !== entry) nextVoices = { ...(nextVoices ?? voices), [lang]: nextEntry };
  }

  const memoryVoice = memory.voice ? map(memory.voice.id) : null;
  const nextMemory = memoryVoice ? { ...memory, voice: { ...memory.voice!, id: memoryVoice } } : null;

  return { voices: nextVoices, memory: nextMemory, changes };
}
