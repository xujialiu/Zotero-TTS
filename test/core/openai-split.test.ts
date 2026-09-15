import { describe, expect, it, vi } from 'vitest';
import {
  convertLegacyItems,
  convertLegacySettings,
  isLegacyOpenAIKey,
  legacyTarget,
  migrateOpenAISplit,
  rewriteVoiceId,
  rewriteVoicesMap,
  splitOpenAISection,
  type LegacyOpenAISection,
} from '../../src/core/openai-split';
import { READ_ALOUD_VOICES_PREF } from '../../src/core/read-aloud-speed';
import { loadSettings, PREF_PREFIX, type PrefsBackend } from '../../src/core/settings';
import type { SharedItem } from '../../src/core/settings-sync';
import { READ_ALOUD_MEMORY_PREF } from '../../src/read-aloud/read-aloud-memory';

// The one OpenAI section of 1.12.11 and before, as this profile had it on
// 2026-09-15: Xiaomi MiMo in force, the other three servers remembered by
// the Server dropdown (issue #113)
const remembered = {
  openai: { baseURL: 'https://api.openai.com', model: 'gpt-4o-mini-tts', apiKey: 'sk-openai', voices: 'alloy', headers: '' },
  chatterbox: { baseURL: 'https://h200-chatterbox.example', model: 'tts-1', voices: '', apiKey: '', headers: 'CF-Access-Client-Id: id; CF-Access-Client-Secret: s' },
  mimo: { baseURL: 'https://api.xiaomimimo.com', model: 'mimo-v2.5-tts', voices: '', apiKey: 'mimo-key', headers: '' },
  other: { baseURL: 'https://api.groq.com/openai', model: 'playai-tts', voices: 'Fritz-PlayAI', apiKey: 'gsk-1', headers: '' },
};
const legacy = (over: Partial<LegacyOpenAISection> = {}): LegacyOpenAISection => ({
  enabled: true,
  apiKey: 'mimo-key',
  baseURL: 'https://api.xiaomimimo.com',
  model: 'mimo-v2.5-tts',
  voices: '',
  headers: '',
  server: 'mimo',
  presetValues: JSON.stringify(remembered),
  ...over,
});

describe('legacyTarget', () => {
  it('follows the stored server choice, and guesses from the address for settings saved before there was one', () => {
    expect(legacyTarget({ server: 'mimo', baseURL: '' })).toBe('mimo');
    expect(legacyTarget({ server: 'openai', baseURL: 'http://localhost:8004' })).toBe('openai-official');
    expect(legacyTarget({ server: 'chatterbox', baseURL: '' })).toBe('compatible');
    expect(legacyTarget({ server: 'other', baseURL: '' })).toBe('compatible');
    expect(legacyTarget({ server: '', baseURL: 'https://api.openai.com' })).toBe('openai-official');
    expect(legacyTarget({ server: '', baseURL: 'https://api.openai.com/v1/' })).toBe('openai-official');
    expect(legacyTarget({ server: '', baseURL: 'http://localhost:8880' })).toBe('compatible');
    expect(legacyTarget({ server: 'nonsense', baseURL: 'https://api.openai.com' })).toBe('openai-official');
  });
});

describe('splitOpenAISection', () => {
  it('sends the server in force to its section, with the switch, and the remembered servers to theirs, off', () => {
    const { sections, target } = splitOpenAISection(legacy());
    expect(target).toBe('mimo');
    expect(sections.mimo).toEqual({ enabled: true, apiKey: 'mimo-key', model: 'mimo-v2.5-tts', voices: '' });
    expect(sections['openai-official']).toEqual({ enabled: false, apiKey: 'sk-openai', model: 'gpt-4o-mini-tts', voices: 'alloy' });
    // Chatterbox and Other compete for the one compatible slot: the one in force first, else Chatterbox
    expect(sections.compatible).toEqual({
      enabled: false,
      baseURL: 'https://h200-chatterbox.example',
      apiKey: '',
      model: 'tts-1',
      voices: '',
      headers: 'CF-Access-Client-Id: id; CF-Access-Client-Secret: s',
    });
  });

  it('gives the compatible slot to Other when that is the server in force', () => {
    const { sections, target } = splitOpenAISection(legacy({ server: 'other', baseURL: 'https://api.groq.com/openai', model: 'playai-tts', apiKey: 'gsk-1', voices: 'Fritz-PlayAI', enabled: false }));
    expect(target).toBe('compatible');
    expect(sections.compatible).toEqual({ enabled: false, baseURL: 'https://api.groq.com/openai', apiKey: 'gsk-1', model: 'playai-tts', voices: 'Fritz-PlayAI', headers: '' });
    expect(sections.mimo).toEqual({ enabled: false, apiKey: 'mimo-key', model: 'mimo-v2.5-tts', voices: '' });
    expect(sections['openai-official'].enabled).toBe(false);
  });

  it('keeps the OpenAI section as it is when OpenAI is in force', () => {
    const { sections, target } = splitOpenAISection(legacy({ server: 'openai', baseURL: 'https://api.openai.com', apiKey: 'sk-live', model: 'tts-1-hd', voices: '' }));
    expect(target).toBe('openai-official');
    expect(sections['openai-official']).toEqual({ enabled: true, apiKey: 'sk-live', model: 'tts-1-hd', voices: '' });
    expect(sections.mimo).toEqual({ enabled: false, apiKey: 'mimo-key', model: 'mimo-v2.5-tts', voices: '' });
  });

  it('fills a remembered server that has no model with the section default, and a server never visited with blanks', () => {
    const { sections } = splitOpenAISection(legacy({ presetValues: JSON.stringify({ openai: { apiKey: 'sk-1' } }) }));
    expect(sections['openai-official']).toEqual({ enabled: false, apiKey: 'sk-1', model: 'gpt-4o-mini-tts', voices: '' });
    expect(sections.compatible).toEqual({ enabled: false, baseURL: '', apiKey: '', model: '', voices: '', headers: '' });
    const { sections: none } = splitOpenAISection(legacy({ presetValues: '' }));
    expect(none['openai-official']).toEqual({ enabled: false, apiKey: '', model: 'gpt-4o-mini-tts', voices: '' });
    const { sections: broken } = splitOpenAISection(legacy({ presetValues: '{not json' }));
    expect(broken.mimo.apiKey).toBe('mimo-key');
  });
});

describe('rewriteVoiceId / rewriteVoicesMap', () => {
  it('re-prefixes the old section’s voice ids to the target section, and leaves every other id alone', () => {
    expect(rewriteVoiceId('openai::mimo_default', 'mimo')).toBe('mimo::mimo_default');
    expect(rewriteVoiceId('openai::alloy', 'openai-official')).toBe('openai-official::alloy');
    expect(rewriteVoiceId('openai::Emily.wav', 'compatible')).toBe('compatible::Emily.wav');
    expect(rewriteVoiceId('azure::en-US-AvaNeural', 'mimo')).toBe('azure::en-US-AvaNeural');
    expect(rewriteVoiceId('bdd0dcc3-en-US', 'mimo')).toBe('bdd0dcc3-en-US');
    expect(rewriteVoiceId('openai-official::alloy', 'mimo')).toBe('openai-official::alloy');
  });

  it('rewrites the voice and the tier memory of every language entry, keeping the tier’s position, and answers null when nothing changed', () => {
    const voices = {
      en: { region: 'en-US', voice: 'openai::mimo_default', speed: 1.2, tierVoices: { standard: 'abc', openai: 'openai::mimo_default', premium: 'def' } },
      zh: { region: 'zh-CN', voice: 'azure::zh-CN-XiaoxiaoNeural', tierVoices: { azure: 'azure::zh-CN-XiaoxiaoNeural' } },
    };
    expect(rewriteVoicesMap(voices, 'mimo')).toEqual({
      en: { region: 'en-US', voice: 'mimo::mimo_default', speed: 1.2, tierVoices: { standard: 'abc', mimo: 'mimo::mimo_default', premium: 'def' } },
      zh: voices.zh,
    });
    expect(Object.keys(rewriteVoicesMap(voices, 'mimo')!.en.tierVoices as object)).toEqual(['standard', 'mimo', 'premium']);
    expect(rewriteVoicesMap({ zh: voices.zh }, 'mimo')).toBeNull();
    expect(rewriteVoicesMap({}, 'mimo')).toBeNull();
  });
});

function fakePrefs(initial: Record<string, unknown>): PrefsBackend & { store: Record<string, unknown> } {
  const store = { ...initial };
  return {
    store,
    get: (key) => store[key],
    set: (key, value) => {
      store[key] = value;
    },
    clear: (key) => {
      delete store[key];
    },
  };
}
const key = (k: string) => PREF_PREFIX + k;

describe('migrateOpenAISplit', () => {
  const profile = () => ({
    [key('openai.enabled')]: true,
    [key('openai.apiKey')]: 'mimo-key',
    [key('openai.baseURL')]: 'https://api.xiaomimimo.com',
    [key('openai.model')]: 'mimo-v2.5-tts',
    [key('openai.voice')]: 'alloy',
    [key('openai.voices')]: '',
    [key('openai.headers')]: '',
    [key('openai.server')]: 'mimo',
    [key('openai.presetValues')]: JSON.stringify(remembered),
    [READ_ALOUD_VOICES_PREF]: JSON.stringify({ en: { voice: 'openai::mimo_default', tierVoices: { openai: 'openai::mimo_default' } } }),
    [READ_ALOUD_MEMORY_PREF]: JSON.stringify({ speed: 1.3, voice: { id: 'openai::mimo_default', lang: 'mul' } }),
    [key('readAloud.favoriteVoices')]: JSON.stringify(['openai::冰糖', 'azure::en-US-AvaNeural']),
  });

  it('writes the three sections, re-prefixes the remembered voices, clears the old prefs and reports', () => {
    const prefs = fakePrefs(profile());
    const report = migrateOpenAISplit(prefs);
    expect(report).toEqual({ target: 'mimo', enabled: { 'openai-official': false, mimo: true, compatible: false }, rewrittenPrefs: 3, clearedKeys: 9 });
    const settings = loadSettings(prefs);
    expect(settings.mimo).toEqual({ enabled: true, apiKey: 'mimo-key', model: 'mimo-v2.5-tts', voices: '' });
    expect(settings['openai-official']).toEqual({ enabled: false, apiKey: 'sk-openai', model: 'gpt-4o-mini-tts', voices: 'alloy' });
    expect(settings.compatible).toMatchObject({ enabled: false, baseURL: 'https://h200-chatterbox.example', headers: 'CF-Access-Client-Id: id; CF-Access-Client-Secret: s' });
    for (const k of Object.keys(profile())) if (k.includes('.openai.')) expect(prefs.store[k], k).toBeUndefined();
    expect(JSON.parse(prefs.store[READ_ALOUD_VOICES_PREF] as string)).toEqual({ en: { voice: 'mimo::mimo_default', tierVoices: { mimo: 'mimo::mimo_default' } } });
    expect(JSON.parse(prefs.store[READ_ALOUD_MEMORY_PREF] as string)).toEqual({ speed: 1.3, voice: { id: 'mimo::mimo_default', lang: 'mul' } });
    expect(JSON.parse(prefs.store[key('readAloud.favoriteVoices')] as string)).toEqual(['mimo::冰糖', 'azure::en-US-AvaNeural']);
  });

  it('runs once: the second start finds nothing of the old section', () => {
    const prefs = fakePrefs(profile());
    migrateOpenAISplit(prefs);
    const set = vi.spyOn(prefs, 'set');
    expect(migrateOpenAISplit(prefs)).toBeNull();
    expect(set).not.toHaveBeenCalled();
  });

  it('does nothing on a profile that never had the old section', () => {
    const prefs = fakePrefs({ [key('mimo.apiKey')]: 'k', [READ_ALOUD_VOICES_PREF]: JSON.stringify({ en: { voice: 'mimo::冰糖' } }) });
    const set = vi.spyOn(prefs, 'set');
    expect(migrateOpenAISplit(prefs)).toBeNull();
    expect(set).not.toHaveBeenCalled();
  });

  it('leaves the voice prefs alone when they name no voice of the old section, and blanks an old pref where the backend cannot clear', () => {
    const store = { ...profile(), [READ_ALOUD_VOICES_PREF]: JSON.stringify({ en: { voice: 'azure::x' } }), [READ_ALOUD_MEMORY_PREF]: '', [key('readAloud.favoriteVoices')]: '' };
    const prefs = fakePrefs(store);
    const backend: PrefsBackend = { get: prefs.get, set: prefs.set };
    const report = migrateOpenAISplit(backend);
    expect(report?.rewrittenPrefs).toBe(0);
    expect(prefs.store[READ_ALOUD_VOICES_PREF]).toBe(JSON.stringify({ en: { voice: 'azure::x' } }));
    expect(prefs.store[key('openai.server')]).toBe('');
    expect(prefs.store[key('openai.presetValues')]).toBe('');
    // Blanked, not cleared: the second start still finds nothing to do
    expect(migrateOpenAISplit(backend)).toBeNull();
  });
});

describe('convertLegacySettings (a settings backup from before the split)', () => {
  const file = {
    'openai.enabled': true,
    'openai.apiKey': 'mimo-key',
    'openai.baseURL': 'https://api.xiaomimimo.com',
    'openai.model': 'mimo-v2.5-tts',
    'openai.voice': 'alloy',
    'openai.voices': '',
    'openai.headers': '',
    'openai.server': 'mimo',
    'openai.presetValues': JSON.stringify(remembered),
    'azure.apiKey': 'az',
    prefetch: 3,
  };

  it('replaces the old section’s keys with the three sections’ keys and leaves the rest as it is', () => {
    const out = convertLegacySettings(file);
    expect(Object.keys(out).filter((k) => k.startsWith('openai.'))).toEqual([]);
    expect(out).toMatchObject({
      'mimo.enabled': true,
      'mimo.apiKey': 'mimo-key',
      'mimo.model': 'mimo-v2.5-tts',
      'mimo.voices': '',
      'openai-official.enabled': false,
      'openai-official.apiKey': 'sk-openai',
      'openai-official.model': 'gpt-4o-mini-tts',
      'openai-official.voices': 'alloy',
      'compatible.enabled': false,
      'compatible.baseURL': 'https://h200-chatterbox.example',
      'compatible.headers': 'CF-Access-Client-Id: id; CF-Access-Client-Secret: s',
      'azure.apiKey': 'az',
      prefetch: 3,
    });
  });

  it('reads a partial old file with the old defaults for what it lacks', () => {
    const out = convertLegacySettings({ 'openai.apiKey': 'sk-1', 'openai.enabled': false });
    expect(out).toMatchObject({ 'openai-official.enabled': false, 'openai-official.apiKey': 'sk-1', 'openai-official.model': 'gpt-4o-mini-tts', 'mimo.enabled': false, 'compatible.enabled': false });
  });

  it('leaves a file without the old section untouched, and lets keys a file already holds under the new names win', () => {
    const fresh = { 'mimo.apiKey': 'k', 'compatible.baseURL': 'http://localhost:8004', prefetch: 2 };
    expect(convertLegacySettings(fresh)).toEqual(fresh);
    const mixed = convertLegacySettings({ ...file, 'mimo.apiKey': 'newer-key' });
    expect(mixed['mimo.apiKey']).toBe('newer-key');
  });
});

describe('convertLegacyItems (a shared settings file written by a copy from before the split)', () => {
  const item = (key: string, value: SharedItem['value'], ts: number, by = 'old-machine'): SharedItem => ({ key, value, ts, by });
  const legacyItems = [
    item('openai.enabled', true, 100),
    item('openai.apiKey', 'mimo-key', 300),
    item('openai.baseURL', 'https://api.xiaomimimo.com', 200),
    item('openai.model', 'mimo-v2.5-tts', 200),
    item('openai.voices', '', 150),
    item('openai.headers', '', 150),
    item('openai.server', 'mimo', 200),
    item('openai.presetValues', JSON.stringify(remembered), 250),
    item('azure.apiKey', 'az', 50, 'other'),
  ];
  const byKey = (items: SharedItem[]) => Object.fromEntries(items.map((i) => [i.key, i]));

  it('derives the three sections’ items, each with the time and machine of the item it came from, and keeps the old items for the copies still on that version', () => {
    const out = byKey(convertLegacyItems(legacyItems));
    // The section in force: field by field from the field's own item
    expect(out['mimo.apiKey']).toEqual(item('mimo.apiKey', 'mimo-key', 300));
    expect(out['mimo.model']).toEqual(item('mimo.model', 'mimo-v2.5-tts', 200));
    expect(out['mimo.voices']).toEqual(item('mimo.voices', '', 150));
    expect(out['mimo.enabled']).toEqual(item('mimo.enabled', true, 100));
    // The remembered sections: from the dropdown's memory
    expect(out['openai-official.apiKey']).toEqual(item('openai-official.apiKey', 'sk-openai', 250));
    expect(out['openai-official.model']).toEqual(item('openai-official.model', 'gpt-4o-mini-tts', 250));
    expect(out['openai-official.enabled']).toEqual(item('openai-official.enabled', false, 100));
    expect(out['compatible.baseURL']).toEqual(item('compatible.baseURL', 'https://h200-chatterbox.example', 250));
    expect(out['compatible.headers']).toEqual(item('compatible.headers', 'CF-Access-Client-Id: id; CF-Access-Client-Secret: s', 250));
    expect(out['compatible.enabled']).toEqual(item('compatible.enabled', false, 100));
    // The old items stay, and the unrelated one too
    expect(out['openai.apiKey']).toEqual(item('openai.apiKey', 'mimo-key', 300));
    expect(out['openai.presetValues']).toBeDefined();
    expect(out['azure.apiKey']).toEqual(item('azure.apiKey', 'az', 50, 'other'));
  });

  it('derives only what the old items say: no switch item without one, no remembered sections without the memory', () => {
    const out = byKey(convertLegacyItems([item('openai.apiKey', 'sk-1', 300), item('openai.server', 'openai', 200)]));
    expect(out['openai-official.apiKey']).toEqual(item('openai-official.apiKey', 'sk-1', 300));
    expect(out['openai-official.enabled']).toBeUndefined();
    expect(out['mimo.apiKey']).toBeUndefined();
    expect(out['compatible.baseURL']).toBeUndefined();
    // With no server item, the address decides; with neither, OpenAI
    expect(byKey(convertLegacyItems([item('openai.apiKey', 'gsk', 300), item('openai.baseURL', 'https://api.groq.com/openai', 300)]))['compatible.apiKey']).toEqual(item('compatible.apiKey', 'gsk', 300));
    expect(byKey(convertLegacyItems([item('openai.model', 'tts-1', 300)]))['openai-official.model']).toEqual(item('openai-official.model', 'tts-1', 300));
  });

  it('lets the newer of a derived item and one the file already holds under the new key win', () => {
    const newer = item('mimo.apiKey', 'rotated-key', 400, 'new-machine');
    const older = item('mimo.model', 'mimo-v2', 100, 'new-machine');
    const out = byKey(convertLegacyItems([...legacyItems, newer, older]));
    expect(out['mimo.apiKey']).toEqual(newer);
    expect(out['mimo.model']).toEqual(item('mimo.model', 'mimo-v2.5-tts', 200));
  });

  it('returns the items as they are when none is the old section’s', () => {
    const items = [item('mimo.apiKey', 'k', 1), item('azure.apiKey', 'az', 2)];
    expect(convertLegacyItems(items)).toEqual(items);
  });
});

describe('isLegacyOpenAIKey', () => {
  it('is every key of the old section and nothing else', () => {
    expect(isLegacyOpenAIKey('openai.apiKey')).toBe(true);
    expect(isLegacyOpenAIKey('openai.presetValues')).toBe(true);
    expect(isLegacyOpenAIKey('openai-official.apiKey')).toBe(false);
    expect(isLegacyOpenAIKey('openai')).toBe(false);
  });
});
