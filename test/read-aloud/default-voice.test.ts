import { readDefaultVoice } from '../../src/core/document-voices';
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
const ALLOY = 'openai-official::alloy';
const xiaoxiao = { id: XIAOXIAO, lang: 'zh', region: 'CN', tier: 'local' };
const stored = (prefs: { store: Record<string, unknown> }) => JSON.parse(prefs.store[READ_ALOUD_VOICES_PREF] as string) as VoicesMap;

describe('setDefaultVoice', () => {
  it('changes the default without changing native language choices or remembered speed', () => {
    const prefs = fakePrefs({ [READ_ALOUD_VOICES_PREF]: JSON.stringify({ zh: { voice: 'old', speed: 1.7 } }) });
    writeMemory(prefs, { speed: 1.8, voice: { id: ALLOY, lang: 'mul' } });
    const before = prefs.store[READ_ALOUD_VOICES_PREF];
    setDefaultVoice(prefs, xiaoxiao);
    expect(readDefaultVoice(prefs)).toEqual({ id: XIAOXIAO, lang: 'zh' });
    expect(readMemory(prefs).speed).toBe(1.8);
    expect(prefs.store[READ_ALOUD_VOICES_PREF]).toBe(before);
    setDefaultVoice(prefs, null);
    expect(readDefaultVoice(prefs)).toBeNull();
    expect(prefs.store[READ_ALOUD_VOICES_PREF]).toBe(before);
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
