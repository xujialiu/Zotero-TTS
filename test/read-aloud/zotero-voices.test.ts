import { describe, expect, it, vi } from 'vitest';
import {
  createZoteroVoiceService,
  parseZoteroVoices,
  type ZoteroTTSClient,
} from '../../src/read-aloud/zotero-voices';

const RESPONSE = {
  standard: [
    {
      voices: { 'std-ava': { label: 'Ava' }, 'std-andrew': { label: 'Andrew' } },
      locales: { 'en-US': ['std-ava', 'std-andrew'], 'de-DE': ['std-ava'] },
      segmentGranularity: 'sentence',
      cacheVersion: '7',
      creditsPerMinute: 1,
    },
  ],
  premium: [
    {
      voices: { 'prm-aria': { label: 'Aria' } },
      locales: { 'en-US': { default: ['prm-aria'], other: [] }, 'fr-FR': { default: ['prm-aria'] } },
      segmentGranularity: 'sentence',
      cacheVersion: '7',
    },
  ],
};

describe('parseZoteroVoices', () => {
  it('flattens one entry per voice and locale, with the tier and the label', () => {
    expect(parseZoteroVoices(RESPONSE)).toEqual([
      { id: 'std-ava', label: 'Ava', locale: 'en-US', tier: 'standard' },
      { id: 'std-andrew', label: 'Andrew', locale: 'en-US', tier: 'standard' },
      { id: 'std-ava', label: 'Ava', locale: 'de-DE', tier: 'standard' },
      { id: 'prm-aria', label: 'Aria', locale: 'en-US', tier: 'premium' },
      { id: 'prm-aria', label: 'Aria', locale: 'fr-FR', tier: 'premium' },
    ]);
  });

  it('reads the { default, other } locale form, and tolerates either half missing', () => {
    const parsed = parseZoteroVoices({
      premium: [
        {
          voices: { a: { label: 'A' }, b: { label: 'B' } },
          locales: { 'en-US': { other: ['a'] }, 'de-DE': { default: ['b'] } },
        },
      ],
    });
    expect(parsed.map((v) => `${v.id}:${v.locale}`)).toEqual(['a:en-US', 'b:de-DE']);
  });

  it('ignores tiers that are not Zotero’s own cloud tiers', () => {
    const withLocal = { ...RESPONSE, local: [{ voices: { x: { label: 'X' } }, locales: { 'en-US': ['x'] } }] };
    expect(parseZoteroVoices(withLocal).some((v) => v.id === 'x')).toBe(false);
  });

  it('drops ids the config does not describe', () => {
    const parsed = parseZoteroVoices({
      standard: [{ voices: { a: { label: 'A' } }, locales: { 'en-US': ['a', 'gone'] } }],
    });
    expect(parsed.map((v) => v.id)).toEqual(['a']);
  });

  it('falls back to the id when a voice has no label', () => {
    const parsed = parseZoteroVoices({ standard: [{ voices: { a: {} }, locales: { 'en-US': ['a'] } }] });
    expect(parsed[0].label).toBe('a');
  });

  it('lists a voice once per locale, however often the config repeats it', () => {
    const parsed = parseZoteroVoices({
      standard: [{ voices: { a: { label: 'A' } }, locales: { 'en-US': { default: ['a'], other: ['a'] } } }],
    });
    expect(parsed).toHaveLength(1);
  });

  it('survives a response of any other shape instead of throwing', () => {
    expect(parseZoteroVoices(undefined)).toEqual([]);
    expect(parseZoteroVoices('nope')).toEqual([]);
    expect(parseZoteroVoices({ standard: 'nope' })).toEqual([]);
    expect(parseZoteroVoices({ standard: [null, {}, { locales: 3 }] })).toEqual([]);
  });
});

function fakeClient(overrides: Partial<ZoteroTTSClient> = {}): ZoteroTTSClient {
  return {
    getReadAloudVoices: vi.fn(async () => ({ voices: RESPONSE })),
    getReadAloudAudio: vi.fn(async () => ({ audio: new Blob(['zotero-audio'], { type: 'audio/mpeg' }) })),
    ...overrides,
  };
}

describe('createZoteroVoiceService', () => {
  it('lists the voices Zotero’s own client returns', async () => {
    const client = fakeClient();
    const service = createZoteroVoiceService({ client: async () => client });
    const voices = await service.listVoices();
    expect(voices).toHaveLength(5);
    expect(voices[0]).toEqual({ id: 'std-ava', label: 'Ava', locale: 'en-US', tier: 'standard' });
  });

  it('has no voices when Zotero offers no client', async () => {
    const service = createZoteroVoiceService({ client: async () => null });
    expect(await service.listVoices()).toEqual([]);
  });

  it('reports the error Zotero’s client returns instead of an empty list', async () => {
    const client = fakeClient({ getReadAloudVoices: async () => ({ error: 'network' }) });
    const service = createZoteroVoiceService({ client: async () => client });
    await expect(service.listVoices()).rejects.toThrow(/network/);
  });

  it('gives up on a listing that never answers', async () => {
    const client = fakeClient({ getReadAloudVoices: () => new Promise(() => {}) });
    const service = createZoteroVoiceService({ client: async () => client, timeoutMs: 5 });
    await expect(service.listVoices()).rejects.toThrow(/did not answer/i);
  });

  it('samples a voice through Zotero’s own sample endpoint', async () => {
    const client = fakeClient();
    const service = createZoteroVoiceService({ client: async () => client });
    const audio = await service.sample('std-ava');
    expect(client.getReadAloudAudio).toHaveBeenCalledWith('sample', 'std-ava');
    expect(await audio.text()).toBe('zotero-audio');
  });

  it('moves the audio into the plugin’s own compartment', async () => {
    const adoptAudio = vi.fn(async () => new Blob(['adopted'], { type: 'audio/mpeg' }));
    const service = createZoteroVoiceService({ client: async () => fakeClient(), adoptAudio });
    expect(await (await service.sample('std-ava')).text()).toBe('adopted');
    expect(adoptAudio).toHaveBeenCalledOnce();
  });

  it('reports a sample that failed or came back without audio', async () => {
    const failing = createZoteroVoiceService({
      client: async () => fakeClient({ getReadAloudAudio: async () => ({ audio: null, error: 'quota-exceeded' }) }),
    });
    await expect(failing.sample('std-ava')).rejects.toThrow(/quota-exceeded/);
    const empty = createZoteroVoiceService({ client: async () => fakeClient({ getReadAloudAudio: async () => ({}) }) });
    await expect(empty.sample('std-ava')).rejects.toThrow(/no audio/i);
  });

  it('says so when there is no client to sample with', async () => {
    const service = createZoteroVoiceService({ client: async () => null });
    await expect(service.sample('std-ava')).rejects.toThrow(/Zotero/);
  });
});
