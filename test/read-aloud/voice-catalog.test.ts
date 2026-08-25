import { describe, expect, it } from 'vitest';
import { MULTILINGUAL } from '../../src/core/providers/types';
import {
  buildVoicesResponse,
  compareVoiceLabels,
  decodeVoiceId,
  encodeVoiceId,
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
  // The local tier also holds the operating system's voices, and every
  // enabled provider's voices are listed together: the label names both
  it('reads TTS-<Provider>-<name>', () => {
    expect(pluginVoiceLabel('openai', 'Alloy')).toBe('TTS-OpenAI-Alloy');
    expect(pluginVoiceLabel('azure', 'Ava Multilingual')).toBe('TTS-Azure-Ava Multilingual');
  });

  it('names local voices after their engine, falling back to "Local" without one', () => {
    expect(pluginVoiceLabel('local', 'af_bella', 'Kokoro')).toBe('TTS-Kokoro-af_bella');
    expect(pluginVoiceLabel('local', 'voice', 'Piper')).toBe('TTS-Piper-voice');
    expect(pluginVoiceLabel('local', 'af_bella')).toBe('TTS-Local-af_bella');
  });

  // While Zotero's own Local voices are hidden, ours are the only entries in
  // the tier and the TTS- marker that told them apart says nothing
  it('drops the TTS- prefix when asked, keeping the provider name', () => {
    expect(pluginVoiceLabel('azure', 'Ava Multilingual', undefined, false)).toBe('Azure-Ava Multilingual');
    expect(pluginVoiceLabel('local', 'af_bella', 'Kokoro', false)).toBe('Kokoro-af_bella');
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
      'TTS-Azure-晓晓 多语言',
      'TTS-Azure-云希',
      'TTS-Azure-Ava',
      'TTS-Kokoro-af_bella',
      'TTS-OpenAI-alloy',
      'TTS-OpenAI-nova',
    ]);
  });

  it('lists each voice under its locale as a plain array, which parseVoicesResponse tolerates', () => {
    const ava = configs().find((c) => labelOf(c) === 'TTS-Azure-Ava');
    expect(ava.locales).toEqual({ 'en-US': [encodeVoiceId('azure', 'en-US-AvaNeural')] });
    expect(Array.isArray(ava.locales['en-US'])).toBe(true);
  });

  // A multilingual voice is offered for every language through Zotero's
  // wildcard locale rather than by repeating it under each one
  it('passes the wildcard locale through untouched', () => {
    const xiaoxiao = configs().find((c) => labelOf(c) === 'TTS-Azure-晓晓 多语言');
    expect(xiaoxiao.locales).toEqual({ mul: [encodeVoiceId('azure', 'zh-CN-XiaoxiaoMultilingualNeural')] });
    const alloy = configs().find((c) => labelOf(c) === 'TTS-OpenAI-alloy');
    expect(alloy.locales).toEqual({ mul: [encodeVoiceId('openai', 'alloy')] });
  });

  it('declares every voice under its encoded id with its label', () => {
    const bella = configs().find((c) => labelOf(c) === 'TTS-Kokoro-af_bella');
    expect(bella.voices).toEqual({ [encodeVoiceId('local', 'af_bella')]: { label: 'TTS-Kokoro-af_bella' } });
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

describe('plainLabels', () => {
  const entries = [
    { provider: 'azure' as const, voices: [{ id: 'en-US-AvaNeural', label: 'Ava', locale: 'en-US' }] },
    { provider: 'local' as const, name: 'Kokoro', voices: [{ id: 'af_bella', label: 'af_bella', locale: 'en-US' }] },
  ];

  // The switch that hides Zotero's own Local voices also drops the prefix;
  // the ids stay identical, so persisted voice choices survive the rename
  it('labels the voices without the TTS- prefix, leaving the ids untouched', () => {
    const out = buildVoicesResponse(entries, 'v1', { plainLabels: true });
    const configs = out.local as any[];
    expect(configs.map((c) => (Object.values(c.voices)[0] as { label: string }).label)).toEqual(['Azure-Ava', 'Kokoro-af_bella']);
    expect(configs.map((c) => Object.keys(c.voices)[0])).toEqual([
      encodeVoiceId('azure', 'en-US-AvaNeural'),
      encodeVoiceId('local', 'af_bella'),
    ]);
  });

  it('keeps the prefix by default', () => {
    const configs = buildVoicesResponse(entries, 'v1').local as any[];
    expect(configs.map((c) => (Object.values(c.voices)[0] as { label: string }).label)).toEqual(['TTS-Azure-Ava', 'TTS-Kokoro-af_bella']);
  });
});
