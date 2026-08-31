import { describe, expect, it } from 'vitest';
import { MULTILINGUAL } from '../../src/core/providers/types';
import {
  buildVoicesResponse,
  compareVoiceLabels,
  decodeVoiceId,
  encodeVoiceId,
  listVoicesResponse,
  PLUGIN_TIER,
  pluginVoiceLabel,
  tierForProvider,
} from '../../src/read-aloud/voice-catalog';

describe('voice id encoding', () => {
  it('round-trips a provider and voice id', () => {
    const encoded = encodeVoiceId('azure', 'zh-CN-XiaoxiaoNeural');
    expect(decodeVoiceId(encoded)).toEqual({ provider: 'azure', voiceId: 'zh-CN-XiaoxiaoNeural' });
  });

  it('survives a voice id that itself contains the separator', () => {
    const encoded = encodeVoiceId('local', 'weird::name');
    expect(decodeVoiceId(encoded)).toEqual({ provider: 'local', voiceId: 'weird::name' });
  });

  // Zotero's own voice ids must never decode as ours: getAudio routes on this
  it('returns null for something that is not one of our ids', () => {
    expect(decodeVoiceId('alloy')).toBeNull();
    expect(decodeVoiceId('elevenlabs::rachel')).toBeNull();
    expect(decodeVoiceId('en-US-AvaMultilingualNeural')).toBeNull();
  });
});

describe('tierForProvider', () => {
  // Zotero's tier dropdown is hard-coded to standard / premium / local
  // (TierSelect, reader.js:38826-38853) and parseVoicesResponse drops any
  // other key (reader.js:40522). standard and premium are Zotero's own cloud
  // voices, which stay available, so every plugin voice lives in local.
  it('files every provider under local, leaving standard and premium to Zotero', () => {
    expect(PLUGIN_TIER).toBe('local');
    expect(tierForProvider('openai')).toBe('local');
    expect(tierForProvider('azure')).toBe('local');
    expect(tierForProvider('local')).toBe('local');
  });
});

describe('pluginVoiceLabel', () => {
  // Every enabled provider's voices are listed together, so the label names
  // the provider; no marker of the plugin's own (issue #9)
  it('reads <Provider>-<name>', () => {
    expect(pluginVoiceLabel('openai', 'Alloy')).toBe('OpenAI-Alloy');
    expect(pluginVoiceLabel('azure', 'Ava Multilingual')).toBe('Azure-Ava Multilingual');
  });

  it('names local voices after their engine, falling back to "Local" without one', () => {
    expect(pluginVoiceLabel('local', 'af_bella', 'Kokoro')).toBe('Kokoro-af_bella');
    expect(pluginVoiceLabel('local', 'voice', 'Piper')).toBe('Piper-voice');
    expect(pluginVoiceLabel('local', 'af_bella')).toBe('Local-af_bella');
  });
});

describe('compareVoiceLabels', () => {
  it('is alphabetical, case-insensitive, numeric-aware, and orders Han by pinyin', () => {
    expect(['Zoe', 'alloy', 'Ava'].sort(compareVoiceLabels)).toEqual(['alloy', 'Ava', 'Zoe']);
    expect(['Voice 10', 'Voice 9'].sort(compareVoiceLabels)).toEqual(['Voice 9', 'Voice 10']);
    // 云 (yún) follows 晓 (xiǎo) in pinyin, although it precedes it by code point
    expect(['云希', '晓晓'].sort(compareVoiceLabels)).toEqual(['晓晓', '云希']);
  });
});

describe('buildVoicesResponse', () => {
  const entries = [
    {
      provider: 'openai' as const,
      voices: [{ id: 'nova', label: 'nova', locale: MULTILINGUAL }, { id: 'alloy', label: 'alloy', locale: MULTILINGUAL }],
    },
    {
      provider: 'azure' as const,
      voices: [
        { id: 'zh-CN-YunxiNeural', label: '云希', locale: 'zh-CN' },
        { id: 'zh-CN-XiaoxiaoMultilingualNeural', label: '晓晓 多语言', locale: MULTILINGUAL },
        { id: 'en-US-AvaNeural', label: 'Ava', locale: 'en-US' },
      ],
    },
    {
      provider: 'local' as const,
      name: 'Kokoro',
      voices: [{ id: 'af_bella', label: 'af_bella', locale: 'en-US' }],
    },
  ];
  const configs = () => buildVoicesResponse(entries, 'v1').local as any[];
  const labelOf = (config: any) => (Object.values(config.voices)[0] as { label: string }).label;

  it('puts every voice under the local tier, one config per voice', () => {
    const out = buildVoicesResponse(entries, 'v1');
    expect(Object.keys(out)).toEqual(['local']);
    expect(out.local).toHaveLength(6);
    for (const config of out.local as any[]) {
      expect(Object.keys(config.voices)).toHaveLength(1);
    }
  });

  // Zotero shows voices in the order given, flattening configs locale by
  // locale, so only a per-voice ordering sorts a language's dropdown across
  // its locales (zh-CN, zh-HK, the wildcard, ...)
  // Chinese collation puts Han names first (by pinyin), then Latin names (A–Z)
  it('orders the configs by label: Han by pinyin, then Latin alphabetically', () => {
    expect(configs().map(labelOf)).toEqual([
      'Azure-晓晓 多语言',
      'Azure-云希',
      'Azure-Ava',
      'Kokoro-af_bella',
      'OpenAI-alloy',
      'OpenAI-nova',
    ]);
  });

  it('lists each voice under its locale as a plain array, which parseVoicesResponse tolerates', () => {
    const ava = configs().find((c) => labelOf(c) === 'Azure-Ava');
    expect(ava.locales).toEqual({ 'en-US': [encodeVoiceId('azure', 'en-US-AvaNeural')] });
    expect(Array.isArray(ava.locales['en-US'])).toBe(true);
  });

  // A multilingual voice is offered for every language through Zotero's
  // wildcard locale rather than by repeating it under each one
  it('passes the wildcard locale through untouched', () => {
    const xiaoxiao = configs().find((c) => labelOf(c) === 'Azure-晓晓 多语言');
    expect(xiaoxiao.locales).toEqual({ mul: [encodeVoiceId('azure', 'zh-CN-XiaoxiaoMultilingualNeural')] });
    const alloy = configs().find((c) => labelOf(c) === 'OpenAI-alloy');
    expect(alloy.locales).toEqual({ mul: [encodeVoiceId('openai', 'alloy')] });
  });

  it('declares every voice under its encoded id with its label', () => {
    const bella = configs().find((c) => labelOf(c) === 'Kokoro-af_bella');
    expect(bella.voices).toEqual({ [encodeVoiceId('local', 'af_bella')]: { label: 'Kokoro-af_bella' } });
  });

  it('asks for sentence segments, the prerequisite for word-level highlighting', () => {
    for (const config of configs()) expect(config.segmentGranularity).toBe('sentence');
  });

  it('never includes creditsPerMinute, which would switch on the credits UI', () => {
    for (const config of configs()) expect('creditsPerMinute' in config).toBe(false);
  });

  it('carries the cache version through to every config', () => {
    for (const config of buildVoicesResponse(entries, 'abc123').local as any[]) expect(config.cacheVersion).toBe('abc123');
  });

  it('produces no tier at all when there are no voices', () => {
    expect(buildVoicesResponse([{ provider: 'openai', voices: [] }], 'v1')).toEqual({});
    expect(buildVoicesResponse([], 'v1')).toEqual({});
  });
});

describe('multilingual locales', () => {
  const entries = [
    {
      provider: 'openai' as const,
      voices: [{ id: 'Emily.wav', label: 'Emily.wav', locale: MULTILINGUAL }],
    },
    {
      provider: 'azure' as const,
      voices: [
        { id: 'zh-CN-XiaoxiaoMultilingualNeural', label: '晓晓 多语言', locale: MULTILINGUAL },
        { id: 'en-US-AvaNeural', label: 'Ava', locale: 'en-US' },
      ],
    },
  ];
  const localesOf = (out: Record<string, any[]>) => out.local.map((c) => Object.keys(c.locales)[0]);

  // mul gives them their own "Multiple languages" dropdown entry, which
  // read-aloud/multilingual-first.ts pins to the top of the language list
  it('publishes multilingual voices under mul and never rewrites concrete locales', () => {
    expect(localesOf(buildVoicesResponse(entries, 'v1')).sort()).toEqual(['en-US', 'mul', 'mul']);
  });
});

describe('labels', () => {
  const entries = [
    { provider: 'azure' as const, voices: [{ id: 'en-US-AvaNeural', label: 'Ava', locale: 'en-US' }] },
    { provider: 'local' as const, name: 'Kokoro', voices: [{ id: 'af_bella', label: 'af_bella', locale: 'en-US' }] },
  ];

  // No marker of the plugin's own since issue #9, and nothing to tell apart
  // since #17 hid Zotero's own Local voices for good
  it('never marks the plugin’s own voices, and leaves the ids untouched', () => {
    const configs = buildVoicesResponse(entries, 'v1').local as any[];
    expect(configs.map((c) => (Object.values(c.voices)[0] as { label: string }).label)).toEqual(['Azure-Ava', 'Kokoro-af_bella']);
    expect(configs.map((c) => Object.keys(c.voices)[0])).toEqual([
      encodeVoiceId('azure', 'en-US-AvaNeural'),
      encodeVoiceId('local', 'af_bella'),
    ]);
  });
});

// One parser for both halves of the list a reader receives: the format=2
// shape buildVoicesResponse emits and the one Zotero's own getVoices
// answers with (issue #35: memory-sync plans against that list)
describe('listVoicesResponse', () => {
  const ava = encodeVoiceId('azure', 'en-US-AvaMultilingualNeural');
  const bella = encodeVoiceId('local', 'af_bella');
  const own = buildVoicesResponse(
    [
      { provider: 'azure', voices: [{ id: 'en-US-AvaMultilingualNeural', label: 'Ava Multilingual', locale: MULTILINGUAL }] },
      { provider: 'local', name: 'Kokoro', voices: [{ id: 'af_bella', label: 'af_bella', locale: 'en-US' }] },
    ],
    'v1',
  );

  it('lists the plugin’s own response voice by voice: id, the locale it is filed under, tier and label', () => {
    expect(listVoicesResponse(own)).toEqual([
      { id: ava, language: MULTILINGUAL, tier: PLUGIN_TIER, label: 'Azure-Ava Multilingual' },
      { id: bella, language: 'en-US', tier: PLUGIN_TIER, label: 'Kokoro-af_bella' },
    ]);
  });

  // Zotero's own response files several voices under one locale, in the
  // plain array form or the { default, other } form its parser also takes;
  // a voice under two locales is two entries, one per language
  it("lists Zotero's own tiers in both locale forms, once per locale, in the order given", () => {
    const theirs = {
      standard: [
        {
          voices: { s1: { label: 'Standard Voice 1' }, s2: { label: 'Standard Voice 2' } },
          locales: { 'en-US': ['s1', 's2'], 'en-GB': { default: ['s2'], other: [] } },
        },
      ],
      premium: [{ voices: { p1: { label: 'Premium 1' } }, locales: { 'zh-CN': { default: ['p1'] } } }],
    };
    expect(listVoicesResponse(theirs)).toEqual([
      { id: 's1', language: 'en-US', tier: 'standard', label: 'Standard Voice 1' },
      { id: 's2', language: 'en-US', tier: 'standard', label: 'Standard Voice 2' },
      { id: 's2', language: 'en-GB', tier: 'standard', label: 'Standard Voice 2' },
      { id: 'p1', language: 'zh-CN', tier: 'premium', label: 'Premium 1' },
    ]);
  });

  it('skips what is not a voice config and an id no config publishes, and names a voice without a label by its id', () => {
    const noisy = {
      standard: [null, 'x', { voices: { s1: {} }, locales: { 'en-US': ['s1', 'ghost'] } }],
      premium: 'not an array',
    } as any;
    expect(listVoicesResponse(noisy)).toEqual([{ id: 's1', language: 'en-US', tier: 'standard', label: 's1' }]);
    expect(listVoicesResponse(null)).toEqual([]);
    expect(listVoicesResponse({})).toEqual([]);
  });
});
