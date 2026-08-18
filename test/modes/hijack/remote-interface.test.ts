import { describe, expect, it, vi } from 'vitest';
import { SynthesisError } from '../../../src/core/providers/errors';
import type { TTSProvider } from '../../../src/core/providers/types';
import { createRemoteInterface } from '../../../src/modes/hijack/remote-interface';
import { encodeVoiceId } from '../../../src/modes/hijack/voice-catalog';

function fakeProvider(overrides: Partial<TTSProvider> = {}): TTSProvider {
  return {
    id: 'openai',
    capabilities: { wordTimestamps: false },
    listVoices: async () => [{ id: 'alloy', label: 'Alloy', locale: 'en-US' }],
    synthesize: async () => ({ audio: new Blob(['audio']) }),
    ...overrides,
  } as TTSProvider;
}

function deps(provider = fakeProvider()) {
  return {
    listCatalog: async () => [{ provider: 'openai' as const, voices: await provider.listVoices() }],
    getProvider: () => provider,
    getSpeed: () => 1,
    cacheVersion: () => 'v1',
  };
}

const voice = { id: encodeVoiceId('openai', 'alloy') };

describe('getVoices', () => {
  it('returns a catalog with null credits, so no quota UI appears', async () => {
    const result = await createRemoteInterface(deps()).getVoices();
    expect(result.standardCreditsRemaining).toBeNull();
    expect(result.premiumCreditsRemaining).toBeNull();
    expect(result.voices.standard).toHaveLength(1);
    expect(result.error).toBeUndefined();
  });

  it('reports an error field instead of throwing when listing fails', async () => {
    const failing = {
      ...deps(),
      listCatalog: async () => {
        throw new SynthesisError('network');
      },
    };
    const result = await createRemoteInterface(failing).getVoices();
    expect(result.error).toBe('network');
    expect(result.voices).toBeUndefined();
  });
});

describe('getAudio', () => {
  it('synthesises the segment text with the decoded provider and voice', async () => {
    const synthesize = vi.fn(async () => ({ audio: new Blob(['bytes']) }));
    const iface = createRemoteInterface(deps(fakeProvider({ synthesize })));

    const result = await iface.getAudio({ text: 'Hello' }, voice);

    expect(synthesize).toHaveBeenCalledWith('Hello', expect.objectContaining({ voice: 'alloy', speed: 1 }));
    expect(await result.audio!.text()).toBe('bytes');
  });

  it('passes timestamps straight through without reshaping them', async () => {
    const timestamps = [{ start: 0, end: 1, charStart: 0, charEnd: 5 }];
    const iface = createRemoteInterface(
      deps(fakeProvider({ synthesize: async () => ({ audio: new Blob(['x']), timestamps }) })),
    );
    const result = await iface.getAudio({ text: 'Hello' }, voice);
    expect(result.timestamps).toBe(timestamps);
  });

  it('synthesises a fixed sample when asked for the sample segment', async () => {
    const synthesize = vi.fn(async () => ({ audio: new Blob(['x']) }));
    const iface = createRemoteInterface(deps(fakeProvider({ synthesize })));

    await iface.getAudio('sample', voice);

    expect(synthesize).toHaveBeenCalledOnce();
    expect((synthesize as any).mock.calls[0][0]).toEqual(expect.any(String));
    expect((synthesize as any).mock.calls[0][0].length).toBeGreaterThan(0);
  });

  it('returns a Zotero error string rather than rejecting', async () => {
    const iface = createRemoteInterface(
      deps(
        fakeProvider({
          synthesize: async () => {
            throw new SynthesisError('local-server-down');
          },
        }),
      ),
    );
    const result = await iface.getAudio({ text: 'Hello' }, voice);
    expect(result.audio).toBeNull();
    expect(result.error).toBe('network');
  });

  it('rejects an unrecognised voice id without calling the provider', async () => {
    const synthesize = vi.fn();
    const iface = createRemoteInterface(deps(fakeProvider({ synthesize: synthesize as never })));
    const result = await iface.getAudio({ text: 'Hello' }, { id: 'bogus' });
    expect(result.audio).toBeNull();
    expect(result.error).toBe('unknown');
    expect(synthesize).not.toHaveBeenCalled();
  });

  it('serves a cache hit without calling the provider', async () => {
    const cached = { audio: new Blob(['cached']) };
    const synthesize = vi.fn();
    const iface = createRemoteInterface({
      ...deps(fakeProvider({ synthesize: synthesize as never })),
      cache: { match: async () => cached, put: async () => {} },
    });

    const result = await iface.getAudio({ text: 'Hello' }, voice);

    expect(await result.audio!.text()).toBe('cached');
    expect(synthesize).not.toHaveBeenCalled();
  });

  it('stores a fresh result in the cache under a key that includes voice and speed', async () => {
    const put = vi.fn(async () => {});
    const iface = createRemoteInterface({
      ...deps(),
      cache: { match: async () => null, put },
    });

    await iface.getAudio({ text: 'Hello' }, voice);

    expect(put).toHaveBeenCalledOnce();
    const key = (put as any).mock.calls[0][0] as string;
    expect(key).toContain('alloy');
    expect(key).toContain('Hello');
    expect(key).toContain('v1');
  });
});

describe('credits', () => {
  it('always reports null, because we do not meter anything', async () => {
    const iface = createRemoteInterface(deps());
    expect(await iface.getCreditsRemaining()).toEqual({
      standardCreditsRemaining: null,
      premiumCreditsRemaining: null,
    });
    expect(await iface.resetCredits()).toEqual({
      standardCreditsRemaining: null,
      premiumCreditsRemaining: null,
    });
  });
});
