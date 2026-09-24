import { describe, expect, it } from 'vitest';
import { MULTILINGUAL } from '../../src/core/providers/types';
import {
  buildVoicesResponse,
  compareVoiceLabels,
  decodeVoiceId,
  encodeVoiceId,
  listVoicesResponse,
  pluginVoiceTier,
  providerTierLabel,
  PUBLISHED_TIER,
  tierForProvider,
  UNKNOWN_ENGINE_TIER,
  zoteroTierLabel,
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

// Issue #110: every provider is a tier of its own on the manager's voice
// objects, so Zotero's per-tier memory (`tierVoices`) and its Voice Mode
// dropdown work per provider. The key is the provider id — except the local
// provider's, since `local` is Zotero's own tier: its engine's name, lower-cased.
describe('tierForProvider', () => {
  it('keys every provider by its id, and the local engine by its name', () => {
    expect(tierForProvider('openai-official')).toBe('openai-official');
    expect(tierForProvider('azure')).toBe('azure');
    expect(tierForProvider('cloudflare')).toBe('cloudflare');
    expect(tierForProvider('speechify')).toBe('speechify');
    expect(tierForProvider('fish')).toBe('fish');
    expect(tierForProvider('fishspeech')).toBe('fishspeech');
    expect(tierForProvider('system')).toBe('system');
    expect(tierForProvider('local', 'Kokoro')).toBe('kokoro');
    expect(tierForProvider('local', 'Piper')).toBe('piper');
  });

  it('never answers local, which is Zotero’s own tier, and names an unknown engine as such', () => {
    expect(tierForProvider('local')).toBe(UNKNOWN_ENGINE_TIER);
    expect(tierForProvider('local', '  ')).toBe(UNKNOWN_ENGINE_TIER);
    expect(UNKNOWN_ENGINE_TIER).not.toBe('local');
  });

  // Only the local provider's key depends on the second argument: the
  // OpenAI section's server preset changes the label, never the key, so
  // the memory kept under `openai` survives a switch of server
  it('ignores a name for every provider but local', () => {
    expect(tierForProvider('openai-official', 'Xiaomi MiMo')).toBe('openai-official');
    expect(tierForProvider('azure', 'Kokoro')).toBe('azure');
  });
});

describe('pluginVoiceTier', () => {
  it('is the tier of a plugin voice id, and null for Zotero’s own ids', () => {
    expect(pluginVoiceTier('azure::en-US-AvaMultilingualNeural')).toBe('azure');
    expect(pluginVoiceTier('local::af_bella', 'Kokoro')).toBe('kokoro');
    expect(pluginVoiceTier('local::af_bella')).toBe(UNKNOWN_ENGINE_TIER);
    expect(pluginVoiceTier('system::onecore/x')).toBe('system');
    expect(pluginVoiceTier('bdd0dcc3-en-US')).toBeNull();
    expect(pluginVoiceTier('')).toBeNull();
  });
});

// The entries' names: the prefixes the voice labels carried until #110
describe('providerTierLabel', () => {
  it('names the fixed providers', () => {
    expect(providerTierLabel('azure')).toBe('Azure');
    expect(providerTierLabel('cloudflare')).toBe('Cloudflare');
    expect(providerTierLabel('speechify')).toBe('Speechify');
    expect(providerTierLabel('fish')).toBe('Fish Audio');
    expect(providerTierLabel('fishspeech')).toBe('Fish Speech');
  });

  it('names the local provider after its engine, falling back to Local without one', () => {
    expect(providerTierLabel('local', { localEngine: 'Kokoro' })).toBe('Kokoro');
    expect(providerTierLabel('local')).toBe('Local');
  });

  // Issue #113: three sections speak OpenAI's API, each an entry with a fixed
  // name; OpenAI Compatible keeps its English name in every language
  it('names the three OpenAI-API sections by fixed names', () => {
    expect(providerTierLabel('openai-official')).toBe('OpenAI');
    expect(providerTierLabel('mimo')).toBe('Xiaomi MiMo');
    expect(providerTierLabel('compatible')).toBe('OpenAI Compatible');
    expect(providerTierLabel('openai-official', { localEngine: 'Kokoro' })).toBe('OpenAI');
  });

  // Translated like the pane's heading (系统 in zh-CN), through the plugin's strings
  it('names the system provider in the app’s language', () => {
    expect(providerTierLabel('system')).toBe('System');
  });
});

describe('zoteroTierLabel', () => {
  it("names Zotero's two tiers behind its name, in Zotero's own words for them, and hands any other key back", () => {
    expect(zoteroTierLabel('standard')).toBe('Zotero Standard');
    expect(zoteroTierLabel('premium')).toBe('Zotero Premium');
    expect(zoteroTierLabel('fish')).toBe('fish');
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
      provider: 'openai-official' as const,
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
  const configs = () => buildVoicesResponse(entries, 'v1')[PUBLISHED_TIER] as any[];
  const labelOf = (config: any) => (Object.values(config.voices)[0] as { label: string }).label;

  // Zotero's parser keeps only its three keys (parseVoicesResponse,
  // reader.js:40531), so everything travels under local and is re-tagged
  // per provider on the manager's voice objects (read-aloud/provider-tiers.ts)
  it('puts every voice under the local key, one config per voice', () => {
    const out = buildVoicesResponse(entries, 'v1');
    expect(PUBLISHED_TIER).toBe('local');
    expect(Object.keys(out)).toEqual(['local']);
    expect(out.local).toHaveLength(6);
    for (const config of out.local as any[]) {
      expect(Object.keys(config.voices)).toHaveLength(1);
    }
  });

  // Zotero shows voices in the order given, flattening configs locale by
  // locale, so only a per-voice ordering sorts a language's dropdown across
  // its locales (zh-CN, zh-HK, the wildcard, ...). Since #110 the player
  // filters by provider, so the order matters within a provider only.
  // Chinese collation puts Han names first (by pinyin), then Latin names (A–Z)
  it('orders the configs by label: Han by pinyin, then Latin alphabetically', () => {
    expect(configs().map(labelOf)).toEqual(['晓晓 多语言', '云希', 'af_bella', 'alloy', 'Ava', 'nova']);
  });

  it('lists each voice under its locale as a plain array, which parseVoicesResponse tolerates', () => {
    const ava = configs().find((c) => labelOf(c) === 'Ava');
    expect(ava.locales).toEqual({ 'en-US': [encodeVoiceId('azure', 'en-US-AvaNeural')] });
    expect(Array.isArray(ava.locales['en-US'])).toBe(true);
  });

  // A multilingual voice is offered for every language through Zotero's
  // wildcard locale rather than by repeating it under each one
  it('passes the wildcard locale through untouched', () => {
    const xiaoxiao = configs().find((c) => labelOf(c) === '晓晓 多语言');
    expect(xiaoxiao.locales).toEqual({ mul: [encodeVoiceId('azure', 'zh-CN-XiaoxiaoMultilingualNeural')] });
    const alloy = configs().find((c) => labelOf(c) === 'alloy');
    expect(alloy.locales).toEqual({ mul: [encodeVoiceId('openai-official', 'alloy')] });
  });

  // The provider's name is the dropdown entry the voice sits under (issue
  // #110), so the label is the voice's own: no prefix, whatever the entry's name
  it('declares every voice under its encoded id with its bare label', () => {
    const bella = configs().find((c) => labelOf(c) === 'af_bella');
    expect(bella.voices).toEqual({ [encodeVoiceId('local', 'af_bella')]: { label: 'af_bella' } });
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
    expect(buildVoicesResponse([{ provider: 'openai-official', voices: [] }], 'v1')).toEqual({});
    expect(buildVoicesResponse([], 'v1')).toEqual({});
  });
});

describe('multilingual locales', () => {
  const entries = [
    {
      provider: 'openai-official' as const,
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
  // the Player pins to the top of the language list (player-controller.ts)
  it('publishes multilingual voices under mul and never rewrites concrete locales', () => {
    expect(localesOf(buildVoicesResponse(entries, 'v1')).sort()).toEqual(['en-US', 'mul', 'mul']);
  });
});

describe('labels', () => {
  const entries = [
    { provider: 'azure' as const, voices: [{ id: 'en-US-AvaNeural', label: 'Ava', locale: 'en-US' }] },
    { provider: 'local' as const, name: 'Kokoro', voices: [{ id: 'af_bella', label: 'af_bella', locale: 'en-US' }] },
  ];

  // No marker of the plugin's own since issue #9, nothing to tell apart
  // since #17 hid Zotero's own Local voices for good, and no provider
  // prefix since #110 filed every provider under an entry of its own
  it('never marks or prefixes the plugin’s own voices, and leaves the ids untouched', () => {
    const configs = buildVoicesResponse(entries, 'v1').local as any[];
    expect(configs.map((c) => (Object.values(c.voices)[0] as { label: string }).label)).toEqual(['af_bella', 'Ava']);
    expect(configs.map((c) => Object.keys(c.voices)[0])).toEqual([
      encodeVoiceId('local', 'af_bella'),
      encodeVoiceId('azure', 'en-US-AvaNeural'),
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

  // The tier here is the response's key, `local` for every plugin voice —
  // the provider's own tier is read off the id (pluginVoiceTier), never off
  // the response
  it('lists the plugin’s own response voice by voice: id, the locale it is filed under, the published key and label', () => {
    expect(listVoicesResponse(own)).toEqual([
      { id: bella, language: 'en-US', tier: PUBLISHED_TIER, label: 'af_bella' },
      { id: ava, language: MULTILINGUAL, tier: PUBLISHED_TIER, label: 'Ava Multilingual' },
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
