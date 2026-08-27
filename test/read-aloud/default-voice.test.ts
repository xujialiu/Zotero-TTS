import { describe, expect, it } from 'vitest';
import { READ_ALOUD_VOICES_PREF, type VoicesMap } from '../../src/core/read-aloud-speed';
import type { PrefsBackend } from '../../src/core/settings';
import { regionOfLocale, setDefaultVoice } from '../../src/read-aloud/default-voice';
import { READ_ALOUD_MEMORY_PREF, readMemory, writeMemory } from '../../src/read-aloud/read-aloud-memory';

/** A pref store that logs the order of its writes. */
function fakePrefs(initial: Record<string, unknown> = {}): PrefsBackend & { store: Record<string, unknown>; log: string[] } {
  const store = { ...initial };
  const log: string[] = [];
  return {
    store,
    log,
    get: (k) => store[k],
    set: (k, v) => {
      store[k] = v;
      log.push(k.replace('extensions.zotero.', ''));
    },
  };
}

const XIAOXIAO = 'azure::zh-CN-XiaoxiaoNeural';
const ALLOY = 'openai::alloy';
const xiaoxiao = { id: XIAOXIAO, lang: 'zh', region: 'CN', tier: 'local' };
const stored = (prefs: { store: Record<string, unknown> }) => JSON.parse(prefs.store[READ_ALOUD_VOICES_PREF] as string) as VoicesMap;

describe('setDefaultVoice', () => {
  it('remembers the voice under its language, keeping the remembered speed', () => {
    const prefs = fakePrefs();
    writeMemory(prefs, { speed: 1.8, voice: { id: ALLOY, lang: 'mul' } });
    setDefaultVoice(prefs, xiaoxiao);
    expect(readMemory(prefs)).toEqual({ speed: 1.8, voice: { id: XIAOXIAO, lang: 'zh' } });
  });

  // What ReaderInstance._setReadAloudVoice writes for a pick in the popup:
  // the voice's region, the voice, the speed, and the tier's voice pushed to
  // the end of tierVoices — where Zotero's _findFallbackVoice looks first
  it("writes Zotero's entry for the language as its own pick would, the tier last and the speed kept", () => {
    const prefs = fakePrefs({
      [READ_ALOUD_VOICES_PREF]: JSON.stringify({
        zh: { region: 'TW', voice: 'azure::zh-TW-HsiaoChenNeural', speed: 1.7, tierVoices: { local: 'azure::zh-TW-HsiaoChenNeural', standard: 's' } },
        en: { speed: 1.7 },
      }),
    });
    setDefaultVoice(prefs, xiaoxiao);
    expect(stored(prefs).zh).toEqual({ region: 'CN', voice: XIAOXIAO, speed: 1.7, tierVoices: { standard: 's', local: XIAOXIAO } });
    expect(Object.keys(stored(prefs).zh.tierVoices as object)).toEqual(['standard', 'local']);
    expect(stored(prefs).en).toEqual({ speed: 1.7 });
  });

  it('starts an entry Zotero has not written at the remembered speed, or without one', () => {
    const remembered = fakePrefs({ [READ_ALOUD_MEMORY_PREF]: JSON.stringify({ speed: 1.8, voice: null }) });
    setDefaultVoice(remembered, xiaoxiao);
    expect(stored(remembered).zh).toEqual({ region: 'CN', voice: XIAOXIAO, speed: 1.8, tierVoices: { local: XIAOXIAO } });
    const fresh = fakePrefs();
    setDefaultVoice(fresh, xiaoxiao);
    expect(stored(fresh).zh).toEqual({ region: 'CN', voice: XIAOXIAO, tierVoices: { local: XIAOXIAO } });
  });

  it('files a multilingual voice under Multiple languages with no region, and one of Zotero’s under its tier', () => {
    const prefs = fakePrefs();
    setDefaultVoice(prefs, { id: ALLOY, lang: 'mul', region: null, tier: 'local' });
    expect(stored(prefs).mul).toEqual({ region: null, voice: ALLOY, tierVoices: { local: ALLOY } });
    setDefaultVoice(prefs, { id: 'zotero-premium-aria', lang: 'en', region: 'US', tier: 'premium' });
    expect(stored(prefs).en).toEqual({ region: 'US', voice: 'zotero-premium-aria', tierVoices: { premium: 'zotero-premium-aria' } });
    expect(readMemory(prefs).voice).toEqual({ id: 'zotero-premium-aria', lang: 'en' });
  });

  // Zotero's entry is left alone: the memory no longer overrides it, which is "Zotero's own choice"
  it('clears the memory only', () => {
    const prefs = fakePrefs();
    setDefaultVoice(prefs, xiaoxiao);
    const before = prefs.store[READ_ALOUD_VOICES_PREF];
    setDefaultVoice(prefs, null);
    expect(readMemory(prefs)).toEqual({ speed: null, voice: null });
    expect(prefs.store[READ_ALOUD_VOICES_PREF]).toBe(before);
  });

  // memory-sync's observer fires inside the second write and must find the
  // voice in the memory already, or it would learn it as a new pick
  it('writes the memory before Zotero’s entry', () => {
    const prefs = fakePrefs();
    setDefaultVoice(prefs, xiaoxiao);
    expect(prefs.log).toEqual(['zotero-tts.readAloud.memory', 'reader.readAloudVoices']);
  });
});

describe('regionOfLocale', () => {
  it('is everything after the first hyphen, as Zotero reads a voice’s region', () => {
    expect(regionOfLocale('zh-CN')).toBe('CN');
    expect(regionOfLocale('zh-Hans-CN')).toBe('Hans-CN');
    expect(regionOfLocale('mul')).toBeNull();
    expect(regionOfLocale('en')).toBeNull();
    expect(regionOfLocale('en-')).toBeNull();
  });
});
