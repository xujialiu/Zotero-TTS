import { describe, expect, it } from 'vitest';
import type { SystemVoiceRecord } from '../../src/core/providers/system/protocol';
import { migrateChoices, pluginIdForZoteroVoice } from '../../src/read-aloud/system-voice-choices';
import { EMPTY_MEMORY } from '../../src/read-aloud/read-aloud-memory';

const INSTALLED: SystemVoiceRecord[] = [
  { id: 'onecore/MSTTS_V110_enUS_DavidM', name: 'Microsoft David', desc: 'Microsoft David - English (United States)', lang: 'en-US' },
  { id: 'sapi5/TTS_MS_EN-US_DAVID_11.0', name: 'Microsoft David Desktop', desc: 'Microsoft David Desktop - English (United States)', lang: 'en-US' },
  { id: 'onecore/MSTTS_V110_zhCN_YaoyaoM', name: 'Microsoft Yaoyao', desc: 'Microsoft Yaoyao - Chinese (Simplified, PRC)', lang: 'zh-CN' },
];

const DAVID = 'local-urn:moz-tts:sapi:Microsoft David - English (United States)?en-US';
const YAOYAO = 'local-urn:moz-tts:sapi:Microsoft Yaoyao - Chinese (Simplified, PRC)?zh-CN';
const HAZEL = 'local-urn:moz-tts:sapi:Microsoft Hazel - English (Great Britain)?en-GB';

describe('pluginIdForZoteroVoice', () => {
  it('answers with the encoded id the catalog publishes', () => {
    expect(pluginIdForZoteroVoice(DAVID, INSTALLED)).toBe('system::onecore/MSTTS_V110_enUS_DavidM');
  });

  it('answers null for a voice that is not installed, so nothing is guessed', () => {
    expect(pluginIdForZoteroVoice(HAZEL, INSTALLED)).toBeNull();
    expect(pluginIdForZoteroVoice('azure::en-US-AvaMultilingualNeural', INSTALLED)).toBeNull();
  });
});

describe('migrateChoices', () => {
  it('re-points every remembered system voice, in Zotero’s pref and in the plugin’s memory', () => {
    const voices = { en: { voice: DAVID, speed: 1.4, tierVoices: { local: DAVID } }, zh: { voice: YAOYAO, speed: 1.4 } };
    const memory = { speed: 1.4, voice: { id: DAVID, lang: 'en' } };
    const result = migrateChoices(voices, memory, INSTALLED);

    expect(result.voices).toEqual({
      en: { voice: 'system::onecore/MSTTS_V110_enUS_DavidM', speed: 1.4, tierVoices: { local: 'system::onecore/MSTTS_V110_enUS_DavidM' } },
      zh: { voice: 'system::onecore/MSTTS_V110_zhCN_YaoyaoM', speed: 1.4 },
    });
    expect(result.memory).toEqual({ speed: 1.4, voice: { id: 'system::onecore/MSTTS_V110_enUS_DavidM', lang: 'en' } });
    expect(result.changes).toHaveLength(4);
  });

  it('rewrites tierVoices.local too, or Zotero’s fallback would put the ghost straight back', () => {
    const voices = { en: { speed: 1, tierVoices: { local: DAVID, standard: 'zotero-voice' } } };
    const result = migrateChoices(voices, EMPTY_MEMORY, INSTALLED);
    expect(result.voices!.en.tierVoices).toEqual({ local: 'system::onecore/MSTTS_V110_enUS_DavidM', standard: 'zotero-voice' });
    // A cloud voice in another tier is none of this module's business
    expect(result.changes.map((c) => c.from)).toEqual([DAVID]);
  });

  it('tells the two Davids apart: the Desktop entry maps to the SAPI token', () => {
    const desktop = 'local-urn:moz-tts:sapi:Microsoft David Desktop - English (United States)?en-US';
    const result = migrateChoices({ en: { voice: desktop } }, EMPTY_MEMORY, INSTALLED);
    expect(result.voices!.en.voice).toBe('system::sapi5/TTS_MS_EN-US_DAVID_11.0');
  });

  it('leaves alone what it cannot map exactly, and reports nothing changed', () => {
    const voices = { en: { voice: HAZEL, speed: 1.2 }, mul: { voice: 'azure::en-US-AvaMultilingualNeural' } };
    const memory = { speed: 1.2, voice: { id: HAZEL, lang: 'en' } };
    const result = migrateChoices(voices, memory, INSTALLED);
    expect(result.voices).toBeNull();
    expect(result.memory).toBeNull();
    expect(result.changes).toEqual([]);
  });

  it('touches only the entries that named a system voice', () => {
    const voices = { en: { voice: DAVID }, mul: { voice: 'openai::alloy', speed: 2 } };
    const result = migrateChoices(voices, EMPTY_MEMORY, INSTALLED);
    expect(result.voices!.mul).toBe(voices.mul);
    expect(result.voices!.en).not.toBe(voices.en);
  });

  it('has nothing to do with an empty pref and an empty memory', () => {
    expect(migrateChoices({}, EMPTY_MEMORY, INSTALLED)).toEqual({ voices: null, memory: null, changes: [] });
  });

  it('survives a damaged entry rather than throwing on it', () => {
    const voices = { en: { voice: 42, tierVoices: ['not', 'an', 'object'] }, zh: {} } as never;
    expect(() => migrateChoices(voices, EMPTY_MEMORY, INSTALLED)).not.toThrow();
    expect(migrateChoices(voices, EMPTY_MEMORY, INSTALLED).voices).toBeNull();
  });

  it('maps nothing when no voice is installed, which is what a failed enumeration looks like', () => {
    expect(migrateChoices({ en: { voice: DAVID } }, EMPTY_MEMORY, []).voices).toBeNull();
  });
});
