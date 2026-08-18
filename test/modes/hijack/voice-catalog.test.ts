import { describe, expect, it } from 'vitest';
import {
  buildVoicesResponse,
  decodeVoiceId,
  encodeVoiceId,
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

  it('returns null for something that is not one of our ids', () => {
    expect(decodeVoiceId('alloy')).toBeNull();
    expect(decodeVoiceId('elevenlabs::rachel')).toBeNull();
  });
});

describe('tierForProvider', () => {
  // 合法取值只有 standard | premium | local（reader.js:39248）
  it('puts cloud providers in standard and local engines in local', () => {
    expect(tierForProvider('openai')).toBe('standard');
    expect(tierForProvider('azure')).toBe('standard');
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

  it('groups voices by tier', () => {
    const out = buildVoicesResponse(entries, 'v1');
    expect(Object.keys(out).sort()).toEqual(['local', 'standard']);
  });

  it('lists locale ids as a plain array, which parseVoicesResponse tolerates', () => {
    const config = buildVoicesResponse(entries, 'v1').standard[0] as any;
    expect(Array.isArray(config.locales['en-US'])).toBe(true);
    expect(config.locales['en-US']).toEqual([
      encodeVoiceId('openai', 'alloy'),
      encodeVoiceId('openai', 'nova'),
    ]);
    expect(config.locales['zh-CN']).toEqual([encodeVoiceId('openai', 'alloy')]);
  });

  it('declares every voice under the encoded id with its label', () => {
    const config = buildVoicesResponse(entries, 'v1').standard[0] as any;
    expect(config.voices[encodeVoiceId('openai', 'alloy')]).toEqual({ label: 'Alloy' });
  });

  it('sets segmentGranularity to sentence, without which word highlighting cannot work', () => {
    const config = buildVoicesResponse(entries, 'v1').standard[0] as any;
    expect(config.segmentGranularity).toBe('sentence');
  });

  it('omits creditsPerMinute, which is what keeps the quota UI hidden', () => {
    const config = buildVoicesResponse(entries, 'v1').standard[0] as any;
    expect('creditsPerMinute' in config).toBe(false);
  });

  it('passes the cache version through', () => {
    const config = buildVoicesResponse(entries, 'abc123').standard[0] as any;
    expect(config.cacheVersion).toBe('abc123');
  });

  it('produces no tier at all when there are no voices for it', () => {
    const out = buildVoicesResponse([{ provider: 'openai', voices: [] }], 'v1');
    expect(out).toEqual({});
  });
});
