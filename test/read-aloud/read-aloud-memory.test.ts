import { describe, expect, it } from 'vitest';
import { MULTILINGUAL } from '../../src/core/providers/types';
import type { VoicesMap } from '../../src/core/read-aloud-speed';
import type { PrefsBackend } from '../../src/core/settings';
import {
  EMPTY_MEMORY,
  isGlobalVoice,
  isMultilingualVoiceId,
  memoryFromVoices,
  memoryLangForLocale,
  noteVoicesChange,
  planSync,
  READ_ALOUD_MEMORY_OBSERVER,
  READ_ALOUD_MEMORY_PREF,
  readMemory,
  sameChoice,
  writeMemory,
  type ReadAloudMemory,
} from '../../src/read-aloud/read-aloud-memory';

describe('READ_ALOUD_MEMORY_OBSERVER', () => {
  it('names the memory pref the way Zotero.Prefs.registerObserver wants it: relative to extensions.zotero.', () => {
    expect('extensions.zotero.' + READ_ALOUD_MEMORY_OBSERVER).toBe(READ_ALOUD_MEMORY_PREF);
  });
});

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

  // The removed multilingualEverywhere switch had multilingual voices chosen
  // under concrete languages; the id is the only trace that the choice is global
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

describe('isGlobalVoice', () => {
  it('is a voice chosen under Multiple languages, or multilingual by its id wherever it was chosen', () => {
    expect(isGlobalVoice({ id: 'local::af_bella', lang: MULTILINGUAL })).toBe(true);
    expect(isGlobalVoice({ id: 'azure::en-US-AvaMultilingualNeural', lang: 'en' })).toBe(true);
    expect(isGlobalVoice({ id: 'azure::zh-CN-XiaoxiaoNeural', lang: 'zh' })).toBe(false);
    expect(isGlobalVoice({ id: 'bdd0dcc3-en-US', lang: 'en' })).toBe(false);
  });
});

describe('sameChoice', () => {
  it('compares id and language, and takes null on either side', () => {
    const a = { id: 'local::af_bella', lang: 'en' };
    expect(sameChoice(a, { ...a })).toBe(true);
    expect(sameChoice(a, { ...a, lang: 'zh' })).toBe(false);
    expect(sameChoice(a, { ...a, id: 'x' })).toBe(false);
    expect(sameChoice(a, null)).toBe(false);
    expect(sameChoice(null, a)).toBe(false);
    expect(sameChoice(null, null)).toBe(true);
  });
});

describe('memoryLangForLocale', () => {
  // The key Zotero persists a choice under: the reader's getBaseLanguage,
  // everything before the first hyphen — so a choice made in the popup and a
  // row of the voice browser meet on the same key
  it('is the base language of a locale, and mul for the multilingual group', () => {
    expect(memoryLangForLocale('zh-CN')).toBe('zh');
    expect(memoryLangForLocale('zh-Hans-CN')).toBe('zh');
    expect(memoryLangForLocale('en')).toBe('en');
    expect(memoryLangForLocale(MULTILINGUAL)).toBe(MULTILINGUAL);
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

  // One voice everywhere, whatever the document's language (the user's
  // rule): a document in another language is moved to the voice's own,
  // whose entry Zotero then restores from
  it('moves every document to a single-language voice’s own language', () => {
    expect(planSync('zh', voices, english)).toEqual({ lang: 'en', voices: null });
    expect(planSync('en', voices, english)).toEqual({ lang: 'en', voices: null });
    expect(planSync('fr', voices, english)).toEqual({ lang: 'en', voices: null });
  });

  it('creates the entry for the voice’s language when Zotero has none, naming the voice and its tier', () => {
    const denise = 'azure::fr-FR-DeniseNeural';
    expect(planSync('zh', voices, { speed: 1.4, voice: { id: denise, lang: 'fr' } })).toEqual({
      lang: 'fr',
      voices: { ...voices, fr: { speed: 1.4, voice: denise, tierVoices: { local: denise } } },
    });
  });

  it('resolves a regional key the way Zotero does', () => {
    const regional: VoicesMap = { 'en-GB': { voice: AOEDE, speed: 1.1 } };
    expect(planSync('en', regional, english)).toEqual({ lang: 'en', voices: { 'en-GB': { voice: AOEDE, speed: 1.4, tierVoices: { local: AOEDE } } } });
  });

  // Zotero's _findFallbackVoice takes its target tier from the LAST key of
  // tierVoices: the voice's tier is pushed there, as _setReadAloudVoice does
  it('pushes the voice’s tier to the end of tierVoices, and takes a Zotero voice’s tier as told', () => {
    const standard = 'bdd0dcc3-en-US';
    const remembered: ReadAloudMemory = { speed: 1.4, voice: { id: standard, lang: 'en' } };
    const told = planSync('zh', voices, remembered, 'standard');
    expect(told.lang).toBe('en');
    expect(told.voices?.en).toEqual({ ...voices.en, voice: standard, tierVoices: { local: AOEDE, standard } });
    expect(Object.keys((told.voices?.en.tierVoices ?? {}) as object)).toEqual(['local', 'standard']);
    // The tier unknown (the list still loading): the voice alone, the tiers as they are
    expect(planSync('zh', voices, remembered).voices?.en).toEqual({ ...voices.en, voice: standard });
    // Already the entry's voice with its tier last: nothing to write
    const settled = { ...voices, en: { ...voices.en, voice: standard, tierVoices: { local: AOEDE, standard } } };
    expect(planSync('zh', settled, remembered, 'standard')).toEqual({ lang: 'en', voices: null });
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

  // A voice picked under a concrete language while the removed
  // multilingualEverywhere switch was on is still global — its id says so
  it('treats a voice that is multilingual by id as global even when remembered under a concrete language', () => {
    const learnedUnderEn: ReadAloudMemory = { speed: 1.4, voice: { id: ISABELLA, lang: 'en' } };
    expect(planSync('zh', voices, learnedUnderEn)).toEqual({ lang: MULTILINGUAL, voices: null });
  });
});

// A document whose own tag no key resolves — en_US, EN, or cmn with no zh
// entry — is read by Zotero under that tag exactly (issue #26): the memory
// goes into that entry, never into the base language's
describe('planSync on a non-canonical document tag', () => {
  const speedOnly: ReadAloudMemory = { speed: 1.5, voice: null };

  it('writes the remembered speed under the tag Zotero will read, not under the base language', () => {
    expect(planSync('en_US', voices, speedOnly)).toEqual({ lang: 'en_US', voices: { ...voices, en_US: { speed: 1.5 } } });
    expect(planSync('EN', voices, speedOnly)).toEqual({ lang: 'EN', voices: { ...voices, EN: { speed: 1.5 } } });
  });

  it('follows Zotero’s language equivalents: a cmn document reads the zh entry', () => {
    expect(planSync('cmn', voices, speedOnly)).toEqual({ lang: 'cmn', voices: { ...voices, zh: { ...voices.zh, speed: 1.5 } } });
  });
});
