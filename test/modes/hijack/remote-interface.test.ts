import { describe, expect, it, vi } from 'vitest';
import { SynthesisError } from '../../../src/core/providers/errors';
import type { TTSProvider } from '../../../src/core/providers/types';
import { createRemoteInterface, SAMPLE_TEXT } from '../../../src/modes/hijack/remote-interface';
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
    expect(result.error).toBeUndefined();
    expect(result.voices!.standard).toHaveLength(1);
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
  // The plugin sandbox's global whitelist has no AbortController — reaching
  // for it as a bare global threw "AbortController is not defined" on every
  // synthesis in a real Zotero, while getVoices (which never needed one)
  // worked. The signal must come from an injected factory, exactly as the
  // WebSocket constructor does.
  it('does not touch the AbortController global', async () => {
    const original = globalThis.AbortController;
    // @ts-expect-error — simulating the plugin sandbox, which lacks it
    delete globalThis.AbortController;
    try {
      const synthesize = vi.fn(async () => ({ audio: new Blob(['bytes']) }));
      const iface = createRemoteInterface(deps(fakeProvider({ synthesize })));
      const result = await iface.getAudio({ text: 'Hello' }, voice);
      expect(result.error).toBeUndefined();
      expect(await result.audio!.text()).toBe('bytes');
    } finally {
      globalThis.AbortController = original;
    }
  });

  // Providers build their Blob inside the plugin sandbox. In Zotero it must be
  // re-created in the chrome window BEFORE it is cached or returned, because a
  // sandbox-owned Blob reaching the Cache API's IO thread trips a Gecko release
  // assert and takes the whole process down. Pin that the adopter sees the
  // provider's Blob and that both the cache and the caller get the adopted one.
  it('routes the audio through adoptAudio before caching and before returning it', async () => {
    const original = new Blob(['from-provider']);
    const adopted = new Blob(['adopted']);
    const adoptAudio = vi.fn(() => adopted);
    const put = vi.fn(async () => {});
    const iface = createRemoteInterface({
      ...deps(fakeProvider({ synthesize: async () => ({ audio: original }) })),
      adoptAudio,
      cache: { match: async () => null, put },
    });

    const result = await iface.getAudio({ text: 'Hello' }, voice);

    expect(adoptAudio).toHaveBeenCalledWith(original);
    expect(result.audio).toBe(adopted);
    expect((put as any).mock.calls[0][1].audio).toBe(adopted);
  });

  it('passes the signal from the injected factory to the provider', async () => {
    const controller = new AbortController();
    const synthesize = vi.fn(async () => ({ audio: new Blob(['x']) }));
    const iface = createRemoteInterface({
      ...deps(fakeProvider({ synthesize })),
      newAbortController: () => controller,
    });
    await iface.getAudio({ text: 'Hello' }, voice);
    expect((synthesize as any).mock.calls[0][1].signal).toBe(controller.signal);
  });

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
    expect((synthesize as any).mock.calls[0][0]).toBe(SAMPLE_TEXT);
  });

  it('resolves with error when cacheVersion throws', async () => {
    const iface = createRemoteInterface({
      ...deps(),
      cacheVersion: () => {
        throw new Error('cache error');
      },
    });
    const result = await iface.getAudio({ text: 'Hello' }, voice);
    expect(result.audio).toBeNull();
    expect(result.error).toBe('unknown');
  });

  it('resolves with error when getSpeed throws', async () => {
    const iface = createRemoteInterface({
      ...deps(),
      getSpeed: () => {
        throw new Error('speed error');
      },
    });
    const result = await iface.getAudio({ text: 'Hello' }, voice);
    expect(result.audio).toBeNull();
    expect(result.error).toBe('unknown');
  });

  it('handles null voice argument gracefully', async () => {
    const iface = createRemoteInterface(deps());
    const result = await iface.getAudio({ text: 'Hello' }, null as any);
    expect(result.audio).toBeNull();
    expect(result.error).toBe('unknown');
  });

  it('uses JSON.stringify for cache keys to prevent collisions', async () => {
    const put = vi.fn(async () => {});
    const cacheVersion = 'v1';
    const provider = 'openai' as const;

    // Request A: voiceId='alloy 1', speed=5, text='hi'
    const iface1 = createRemoteInterface({
      listCatalog: async () => [{ provider, voices: [] }],
      getProvider: () => fakeProvider(),
      getSpeed: () => 5,
      cacheVersion: () => cacheVersion,
      cache: { match: async () => null, put },
    });
    await iface1.getAudio({ text: 'hi' }, { id: encodeVoiceId(provider, 'alloy 1') });
    const keyA = (put as any).mock.calls[0][0] as string;

    put.mockClear();

    // Request B: voiceId='alloy', speed=1, text='5 hi'
    const iface2 = createRemoteInterface({
      listCatalog: async () => [{ provider, voices: [] }],
      getProvider: () => fakeProvider(),
      getSpeed: () => 1,
      cacheVersion: () => cacheVersion,
      cache: { match: async () => null, put },
    });
    await iface2.getAudio({ text: '5 hi' }, { id: encodeVoiceId(provider, 'alloy') });
    const keyB = (put as any).mock.calls[0][0] as string;

    // Prove these inputs would have collided under the old space-joined scheme
    const oldSchemeKeyA = [cacheVersion, provider, 'alloy 1', 5, 'hi'].join(' ');
    const oldSchemeKeyB = [cacheVersion, provider, 'alloy', 1, '5 hi'].join(' ');
    expect(oldSchemeKeyA).toBe(oldSchemeKeyB);

    // But they differ under JSON.stringify
    expect(keyA).not.toBe(keyB);
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
