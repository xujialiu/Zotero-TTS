import { describe, expect, it } from 'vitest';
import { MULTILINGUAL } from '../../src/core/providers/types';
import type { VoicesMap } from '../../src/core/read-aloud-speed';
import type { PrefsBackend } from '../../src/core/settings';
import {
  EMPTY_MEMORY,
  isMultilingualVoiceId,
  memoryFromVoices,
  noteVoicesChange,
  planSync,
  READ_ALOUD_MEMORY_PREF,
  readMemory,
  writeMemory,
  type ReadAloudMemory,
} from '../../src/read-aloud/read-aloud-memory';

function fakePrefs(initial: Record<string, unknown> = {}): PrefsBackend & { store: Record<string, unknown> } {
  const store = { ...initial };
  return { store, get: (k) => store[k], set: (k, v) => void (store[k] = v) };
}

const ISABELLA = 'openai::bf_v0isabella';
const AOEDE = 'local::af_aoede';

// What Zotero writes: one entry per base language the user has read
const voices: VoicesMap = {
  en: { region: 'US', voice: AOEDE, speed: 1.4, tierVoices: { standard: 'bdd0dcc3-en-US', local: AOEDE } },
  zh: { region: null, voice: 'azure::fr-FR-LucienMultilingualNeural', speed: 1.2, tierVoices: {} },
  [MULTILINGUAL]: { region: null, voice: ISABELLA, speed: 1.4, tierVoices: { local: ISABELLA } },
};

describe('readMemory / writeMemory', () => {
  it('round-trips through the plugin pref', () => {
    const prefs = fakePrefs();
    const memory: ReadAloudMemory = { speed: 1.4, voice: { id: ISABELLA, lang: MULTILINGUAL } };
    writeMemory(prefs, memory);
    expect(typeof prefs.store[READ_ALOUD_MEMORY_PREF]).toBe('string');
    expect(readMemory(prefs)).toEqual(memory);
  });

  it('reads an unset, damaged or nonsensical pref as empty', () => {
    expect(readMemory(fakePrefs())).toEqual(EMPTY_MEMORY);
    expect(readMemory(fakePrefs({ [READ_ALOUD_MEMORY_PREF]: '{not json' }))).toEqual(EMPTY_MEMORY);
    expect(readMemory(fakePrefs({ [READ_ALOUD_MEMORY_PREF]: JSON.stringify({ speed: -1, voice: { id: '' } }) }))).toEqual(EMPTY_MEMORY);
  });
});

describe('memoryFromVoices', () => {
  it('starts from the speed Zotero already stores and the voice chosen under Multiple languages', () => {
    expect(memoryFromVoices(voices)).toEqual({ speed: 1.4, voice: { id: ISABELLA, lang: MULTILINGUAL } });
  });

  // With multilingualEverywhere, multilingual voices are chosen under
  // concrete languages; the id is the only trace that the choice is global
  it('falls back to a voice that is multilingual by its id', () => {
    const { [MULTILINGUAL]: _omit, ...withoutMul } = voices;
    expect(memoryFromVoices(withoutMul)).toEqual({
      speed: 1.4,
      voice: { id: 'azure::fr-FR-LucienMultilingualNeural', lang: 'zh' },
    });
  });

  it('does not guess a voice from single-language entries', () => {
    expect(memoryFromVoices({ en: { voice: AOEDE, speed: 1.4 }, zh: { voice: 'azure::zh-CN-XiaoxiaoNeural', speed: 1.2 } })).toEqual({
      speed: 1.4,
      voice: null,
    });
    expect(memoryFromVoices({})).toEqual(EMPTY_MEMORY);
  });
});

describe('isMultilingualVoiceId', () => {
  it('every OpenAI-compatible voice is multilingual; Azure by name; local and foreign ids are not', () => {
    expect(isMultilingualVoiceId('openai::Emily.wav')).toBe(true);
    expect(isMultilingualVoiceId('azure::en-US-AvaMultilingualNeural')).toBe(true);
    expect(isMultilingualVoiceId('azure::zh-CN-XiaoxiaoNeural')).toBe(false);
    expect(isMultilingualVoiceId('local::af_bella')).toBe(false);
    expect(isMultilingualVoiceId('bdd0dcc3-en-US')).toBe(false);
  });
});

describe('noteVoicesChange', () => {
  const memory: ReadAloudMemory = { speed: 1.4, voice: { id: ISABELLA, lang: MULTILINGUAL } };

  it('learns a new speed from the slider or the shortcuts, whichever language it was set in', () => {
    const next = { ...voices, zh: { ...voices.zh, speed: 1.6 } };
    expect(noteVoicesChange(voices, next, memory)).toEqual({ ...memory, speed: 1.6 });
  });

  it('learns the voice the user picked, with the language it was picked under', () => {
    const next = { ...voices, en: { ...voices.en, voice: 'azure::en-US-AvaNeural' } };
    expect(noteVoicesChange(voices, next, memory)).toEqual({ ...memory, voice: { id: 'azure::en-US-AvaNeural', lang: 'en' } });
  });

  it('learns a voice picked for a language that had no entry yet', () => {
    const next = { ...voices, fr: { region: 'FR', voice: 'azure::fr-FR-DeniseNeural', speed: 1.4, tierVoices: {} } };
    expect(noteVoicesChange(voices, next, memory).voice).toEqual({ id: 'azure::fr-FR-DeniseNeural', lang: 'fr' });
  });

  // The slider persists whatever voice is active, which after a fallback is
  // not one the user chose; a voice arriving together with a speed change
  // is that fallback, not a choice.
  it('ignores a voice that only came along with a speed change', () => {
    const next = { ...voices, zh: { ...voices.zh, voice: 'azure::zh-CN-XiaoxiaoNeural', speed: 1.5 } };
    expect(noteVoicesChange(voices, next, memory)).toEqual({ ...memory, speed: 1.5 });
    const fresh = { ...voices, fr: { region: 'FR', voice: 'azure::fr-FR-DeniseNeural', speed: 1.5, tierVoices: {} } };
    expect(noteVoicesChange(voices, fresh, memory)).toEqual({ ...memory, speed: 1.5 });
  });

  it('returns the same object when nothing was learned', () => {
    expect(noteVoicesChange(voices, voices, memory)).toBe(memory);
    expect(noteVoicesChange(voices, { ...voices, en: { ...voices.en, region: 'GB' } }, memory)).toBe(memory);
    // A removed entry is not a choice either
    expect(noteVoicesChange(voices, { en: voices.en }, memory)).toBe(memory);
  });
});

describe('planSync', () => {
  const multilingual: ReadAloudMemory = { speed: 1.4, voice: { id: ISABELLA, lang: MULTILINGUAL } };
  const english: ReadAloudMemory = { speed: 1.4, voice: { id: AOEDE, lang: 'en' } };

  it('does nothing until the manager knows a language', () => {
    expect(planSync(null, voices, multilingual)).toEqual({ lang: null, voices: null });
  });

  it('moves every document to Multiple languages when the remembered voice is multilingual', () => {
    expect(planSync('zh', voices, multilingual)).toEqual({ lang: MULTILINGUAL, voices: null });
  });

  it('keeps the detected language for a single-language voice, so Zotero restores its own per-language choice', () => {
    expect(planSync('zh', voices, english)).toEqual({ lang: 'zh', voices: { ...voices, zh: { ...voices.zh, speed: 1.4 } } });
    expect(planSync('en', voices, english)).toEqual({ lang: 'en', voices: null });
  });

  it('creates the entry for a language Zotero has not seen, so it starts at the remembered speed', () => {
    expect(planSync('fr', voices, english)).toEqual({ lang: 'fr', voices: { ...voices, fr: { speed: 1.4 } } });
  });

  it('resolves a regional key the way Zotero does', () => {
    const regional: VoicesMap = { 'en-GB': { voice: AOEDE, speed: 1.1 } };
    expect(planSync('en', regional, english)).toEqual({ lang: 'en', voices: { 'en-GB': { voice: AOEDE, speed: 1.4 } } });
  });

  it('puts the remembered multilingual voice back if the Multiple languages entry drifted', () => {
    const drifted = { ...voices, [MULTILINGUAL]: { ...voices[MULTILINGUAL], voice: 'openai::alloy', speed: 1.0 } };
    expect(planSync('en', drifted, multilingual)).toEqual({
      lang: MULTILINGUAL,
      voices: {
        ...drifted,
        [MULTILINGUAL]: { ...drifted[MULTILINGUAL], voice: ISABELLA, speed: 1.4, tierVoices: { local: ISABELLA } },
      },
    });
    const missing = { en: voices.en };
    expect(planSync('en', missing, multilingual).voices).toEqual({
      ...missing,
      [MULTILINGUAL]: { speed: 1.4, voice: ISABELLA, tierVoices: { local: ISABELLA } },
    });
  });

  it('only ensures the speed when no voice is remembered', () => {
    expect(planSync('fr', voices, { speed: 1.4, voice: null })).toEqual({ lang: 'fr', voices: { ...voices, fr: { speed: 1.4 } } });
    expect(planSync('fr', voices, EMPTY_MEMORY)).toEqual({ lang: 'fr', voices: null });
  });

  // multilingualEverywhere publishes these voices under `*`, valid for the
  // detected language itself: write into that entry, leave the language alone
  it('with multilingualEverywhere writes the voice into the detected language instead of moving to mul', () => {
    expect(planSync('zh', voices, multilingual, true)).toEqual({
      lang: 'zh',
      voices: { ...voices, zh: { ...voices.zh, speed: 1.4, voice: ISABELLA, tierVoices: { local: ISABELLA } } },
    });
    // A single-language voice is still left to Zotero's own per-language memory
    expect(planSync('zh', voices, english, true)).toEqual({ lang: 'zh', voices: { ...voices, zh: { ...voices.zh, speed: 1.4 } } });
  });

  // A voice picked under a concrete language while multilingualEverywhere was
  // on is still global after the toggle goes off — its id says so
  it('treats a voice that is multilingual by id as global even when remembered under a concrete language', () => {
    const learnedUnderEn: ReadAloudMemory = { speed: 1.4, voice: { id: ISABELLA, lang: 'en' } };
    expect(planSync('zh', voices, learnedUnderEn)).toEqual({ lang: MULTILINGUAL, voices: null });
  });
});
