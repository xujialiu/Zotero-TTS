import { describe, expect, it } from 'vitest';
import {
  buildVoicesResponse,
  decodeVoiceId,
  encodeVoiceId,
  PLUGIN_LABEL_PREFIX,
  PLUGIN_TIER,
  tierForProvider,
} from '../../../src/modes/hijack/voice-catalog';

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

describe('buildVoicesResponse', () => {
  const entries = [
    {
      provider: 'openai' as const,
      voices: [
        { id: 'alloy', label: 'Alloy', locale: 'en-US' },
        { id: 'alloy', label: 'Alloy', locale: 'zh-CN' },
        { id: 'nova', label: 'Nova', locale: 'en-US' },
      ],
    },
    {
      provider: 'local' as const,
      voices: [{ id: 'af_bella', label: 'af_bella', locale: 'en-US' }],
    },
  ];
  const openaiConfig = () => buildVoicesResponse(entries, 'v1').local[0] as any;

  it('puts every provider under the local tier, one config per provider', () => {
    const out = buildVoicesResponse(entries, 'v1');
    expect(Object.keys(out)).toEqual(['local']);
    expect(out.local).toHaveLength(2);
  });

  it('lists locale ids as a plain array, which parseVoicesResponse tolerates', () => {
    const config = openaiConfig();
    expect(Array.isArray(config.locales['en-US'])).toBe(true);
    expect(config.locales['en-US']).toEqual([encodeVoiceId('openai', 'alloy'), encodeVoiceId('openai', 'nova')]);
    expect(config.locales['zh-CN']).toEqual([encodeVoiceId('openai', 'alloy')]);
  });

  // The local tier also holds the operating system's voices; the prefix is
  // what tells the two apart in the voice dropdown
  it("declares every voice under its encoded id, labelled as the plugin's", () => {
    const config = openaiConfig();
    expect(PLUGIN_LABEL_PREFIX).toMatch(/Zotero TTS/);
    expect(config.voices[encodeVoiceId('openai', 'alloy')]).toEqual({ label: PLUGIN_LABEL_PREFIX + 'Alloy' });
    expect(config.voices[encodeVoiceId('openai', 'nova')]).toEqual({ label: PLUGIN_LABEL_PREFIX + 'Nova' });
  });

  it('asks for sentence segments, the prerequisite for word-level highlighting', () => {
    expect(openaiConfig().segmentGranularity).toBe('sentence');
  });

  it('never includes creditsPerMinute, which would switch on the credits UI', () => {
    expect('creditsPerMinute' in openaiConfig()).toBe(false);
  });

  it('carries the cache version through', () => {
    expect((buildVoicesResponse(entries, 'abc123').local[0] as any).cacheVersion).toBe('abc123');
  });

  it('produces no tier at all when there are no voices', () => {
    expect(buildVoicesResponse([{ provider: 'openai', voices: [] }], 'v1')).toEqual({});
  });
});
