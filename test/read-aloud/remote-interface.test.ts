import { describe, expect, it, vi } from 'vitest';
import { SynthesisError } from '../../src/core/providers/errors';
import type { TTSProvider } from '../../src/core/providers/types';
import { createRemoteInterface, SAMPLE_TEXT, WHOLE_SEGMENT_END_SECONDS } from '../../src/read-aloud/remote-interface';
import { encodeVoiceId } from '../../src/read-aloud/voice-catalog';

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
    expect(result.voices!.local).toHaveLength(1);
    expect(result.voices!.standard).toBeUndefined();
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

  // In word mode Zotero highlights the active word and nothing else, and it
  // has no fallback of its own: a segment without timestamps shows no
  // highlight at all. One timestamp spanning the whole segment makes word
  // mode show the sentence — what sentence mode shows — without inventing
  // any per-word timing.
  describe('sentence fallback for voices without word timestamps', () => {
    const whole = (text: string) => [{ start: 0, end: WHOLE_SEGMENT_END_SECONDS, charStart: 0, charEnd: text.length }];

    it('supplies one timestamp spanning the whole segment', async () => {
      const iface = createRemoteInterface(deps(fakeProvider({ synthesize: async () => ({ audio: new Blob(['x']) }) })));
      const result = await iface.getAudio({ text: 'Hello world' }, voice);
      expect(result.timestamps).toEqual(whole('Hello world'));
    });

    it('treats an empty timestamp list the same as none', async () => {
      const iface = createRemoteInterface(
        deps(fakeProvider({ synthesize: async () => ({ audio: new Blob(['x']), timestamps: [] }) })),
      );
      const result = await iface.getAudio({ text: 'Hello' }, voice);
      expect(result.timestamps).toEqual(whole('Hello'));
    });

    it('applies to cache hits as well, without altering what is cached', async () => {
      const cached = { audio: new Blob(['cached']) };
      const iface = createRemoteInterface({
        ...deps(),
        cache: { match: async () => cached, put: async () => {} },
      });
      const result = await iface.getAudio({ text: 'Hello' }, voice);
      expect(result.timestamps).toEqual(whole('Hello'));
      expect('timestamps' in cached).toBe(false);
    });

    it('outlasts any segment, so resuming mid-segment still highlights it', () => {
      // Zotero skips timestamps whose end is before the resume offset
      expect(WHOLE_SEGMENT_END_SECONDS).toBeGreaterThan(3600);
    });
  });

  it('reports what reached Zotero for each segment through the debug hook', async () => {
    const debug = vi.fn();
    const timestamps = [{ start: 0, end: 1, charStart: 0, charEnd: 5 }];
    const withWords = createRemoteInterface({
      ...deps(fakeProvider({ synthesize: async () => ({ audio: new Blob(['x']), timestamps }) })),
      debug,
    });
    await withWords.getAudio({ text: 'Hello' }, voice);
    expect(debug).toHaveBeenCalledWith(expect.stringMatching(/openai.*1 word timestamp/));

    debug.mockClear();
    const without = createRemoteInterface({ ...deps(fakeProvider({ synthesize: async () => ({ audio: new Blob(['x']) }) })), debug });
    await without.getAudio({ text: 'Hello' }, voice);
    expect(debug).toHaveBeenCalledWith(expect.stringMatching(/openai.*no word timestamps.*sentence/));
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
  it("reports null without Zotero's interface, because we do not meter anything", async () => {
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

// A request that never settles would show in Zotero as a spinner that never
// stops; every one of ours is bounded and surfaces as an error instead
describe('timeouts', () => {
  it('turns a synthesis that never finishes into a network error and aborts the request', async () => {
    const controller = new AbortController();
    const synthesize = vi.fn(() => new Promise<never>(() => {}));
    const log = vi.fn();
    const iface = createRemoteInterface({
      ...deps(fakeProvider({ synthesize: synthesize as never })),
      newAbortController: () => controller,
      synthesisTimeoutMs: 20,
      log,
    });
    const result = await iface.getAudio({ text: 'Hello' }, voice);
    expect(result).toEqual({ audio: null, error: 'network' });
    expect(controller.signal.aborted).toBe(true);
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ kind: 'network' }));
  });

  it('gives up on a plugin voice catalog that never arrives', async () => {
    const log = vi.fn();
    const iface = createRemoteInterface({
      ...deps(),
      listCatalog: () => new Promise(() => {}),
      catalogTimeoutMs: 20,
      log,
    });
    const result = await iface.getVoices();
    expect(result.error).toBe('network');
    expect(log).toHaveBeenCalled();
  });
});

// Zotero's own interface (ReaderInstance.prototype._getReadAloudRemoteInterface)
// is kept alongside ours: its Standard and Premium cloud voices, credits and
// audio stay exactly as they were, and the plugin's voices are added under
// the local tier. Every method of the fake resolves like the real one does.
describe("alongside Zotero's own interface", () => {
  const standardConfig = { voices: { s1: { label: 'Zotero standard' } }, locales: { 'en-US': ['s1'] } };

  function fakeNative(over: Partial<Record<'getVoices' | 'getAudio' | 'getCreditsRemaining' | 'resetCredits', any>> = {}) {
    return {
      getVoices: vi.fn(async () => ({
        voices: { standard: [standardConfig], premium: [] },
        standardCreditsRemaining: 120,
        premiumCreditsRemaining: 30,
        devMode: true,
      })),
      getAudio: vi.fn(async () => ({ audio: new Blob(['native']), timestamps: [{ start: 0, end: 1, charStart: 0, charEnd: 3 }] })),
      getCreditsRemaining: vi.fn(async () => ({ standardCreditsRemaining: 100, premiumCreditsRemaining: 20 })),
      resetCredits: vi.fn(async () => ({ standardCreditsRemaining: 999, premiumCreditsRemaining: 999 })),
      ...over,
    };
  }

  function withNative(native: ReturnType<typeof fakeNative> | null, extra: Record<string, unknown> = {}) {
    const log = vi.fn();
    const synthesize = vi.fn(async () => ({ audio: new Blob(['plugin']) }));
    const iface = createRemoteInterface({ ...deps(fakeProvider({ synthesize })), native: () => native, log, ...extra });
    return { iface, log, synthesize };
  }

  it("keeps Zotero's tiers and credits and adds the plugin voices under local", async () => {
    const native = fakeNative();
    const result = await withNative(native).iface.getVoices();
    expect(result.error).toBeUndefined();
    expect(result.voices!.standard).toEqual([standardConfig]);
    expect(result.voices!.premium).toEqual([]);
    expect(result.voices!.local).toHaveLength(1);
    expect(result.standardCreditsRemaining).toBe(120);
    expect(result.premiumCreditsRemaining).toBe(30);
    expect(result.devMode).toBe(true);
  });

  it('appends to, rather than replaces, a local tier Zotero itself reports', async () => {
    const theirs = { voices: { l1: { label: 'theirs' } }, locales: { 'en-US': ['l1'] } };
    const native = fakeNative({ getVoices: vi.fn(async () => ({ voices: { local: [theirs] } })) });
    const result = await withNative(native).iface.getVoices();
    expect(result.voices!.local).toHaveLength(2);
    expect(result.voices!.local[0]).toEqual(theirs);
  });

  it("still lists the plugin voices when Zotero's side fails, and records why", async () => {
    const native = fakeNative({ getVoices: vi.fn(async () => { throw new Error('offline'); }) });
    const { iface, log } = withNative(native);
    const result = await iface.getVoices();
    expect(result.error).toBeUndefined();
    expect(result.voices!.local).toHaveLength(1);
    expect(result.voices!.standard).toBeUndefined();
    expect(result.standardCreditsRemaining).toBeNull();
    expect(log).toHaveBeenCalledWith(expect.any(Error));
  });

  it('treats an error field from Zotero the same as a failure', async () => {
    const native = fakeNative({ getVoices: vi.fn(async () => ({ error: 'network', standardCreditsRemaining: null, premiumCreditsRemaining: null })) });
    const { iface, log } = withNative(native);
    const result = await iface.getVoices();
    expect(result.error).toBeUndefined();
    expect(result.voices!.local).toHaveLength(1);
    expect(log).toHaveBeenCalled();
  });

  // The real interface's promises never reject: an exception inside them
  // leaves the promise pending forever, which would freeze the popup
  it("gives up on Zotero's side after the timeout instead of hanging", async () => {
    const native = fakeNative({ getVoices: vi.fn(() => new Promise(() => {})) });
    const { iface, log } = withNative(native, { nativeTimeoutMs: 20 });
    const result = await iface.getVoices();
    expect(result.voices!.local).toHaveLength(1);
    expect(log).toHaveBeenCalled();
  });

  it("still lists Zotero's voices when the plugin catalog fails", async () => {
    const native = fakeNative();
    const log = vi.fn();
    const iface = createRemoteInterface({
      ...deps(),
      listCatalog: async () => {
        throw new SynthesisError('network');
      },
      native: () => native,
      log,
    });
    const result = await iface.getVoices();
    expect(result.error).toBeUndefined();
    expect(result.voices!.standard).toEqual([standardConfig]);
    expect(result.voices!.local).toBeUndefined();
    expect(result.standardCreditsRemaining).toBe(120);
    expect(log).toHaveBeenCalled();
  });

  it('reports an error only when both sides fail', async () => {
    const native = fakeNative({ getVoices: vi.fn(async () => { throw new Error('offline'); }) });
    const iface = createRemoteInterface({
      ...deps(),
      listCatalog: async () => {
        throw new SynthesisError('network');
      },
      native: () => native,
    });
    const result = await iface.getVoices();
    expect(result.error).toBe('network');
    expect(result.voices).toBeUndefined();
  });

  it("routes a voice that is not the plugin's to Zotero, untouched", async () => {
    const native = fakeNative();
    const { iface, synthesize } = withNative(native);
    const segment = { text: 'Hi' };
    const result = await iface.getAudio(segment, { id: 's1' });
    expect(native.getAudio).toHaveBeenCalledWith(segment, { id: 's1' });
    expect(await result.audio!.text()).toBe('native');
    expect(result.timestamps).toEqual([{ start: 0, end: 1, charStart: 0, charEnd: 3 }]);
    expect(synthesize).not.toHaveBeenCalled();
  });

  it('still synthesises plugin voices itself', async () => {
    const native = fakeNative();
    const { iface, synthesize } = withNative(native);
    const result = await iface.getAudio({ text: 'Hi' }, voice);
    expect(synthesize).toHaveBeenCalledOnce();
    expect(native.getAudio).not.toHaveBeenCalled();
    expect(await result.audio!.text()).toBe('plugin');
  });

  it("collapses a failure on Zotero's side into the unknown error", async () => {
    const native = fakeNative({ getAudio: vi.fn(async () => { throw new Error('offline'); }) });
    const { iface, log } = withNative(native);
    const result = await iface.getAudio({ text: 'Hi' }, { id: 's1' });
    expect(result).toEqual({ audio: null, error: 'unknown' });
    expect(log).toHaveBeenCalledWith(expect.any(Error));
  });

  it('passes credit calls through', async () => {
    const native = fakeNative();
    const { iface } = withNative(native);
    expect(await iface.getCreditsRemaining()).toEqual({ standardCreditsRemaining: 100, premiumCreditsRemaining: 20 });
    expect(await iface.resetCredits()).toEqual({ standardCreditsRemaining: 999, premiumCreditsRemaining: 999 });
  });

  it("obtains Zotero's interface lazily and only once", async () => {
    const native = fakeNative();
    const thunk = vi.fn(() => native);
    const iface = createRemoteInterface({ ...deps(), native: thunk });
    expect(thunk).not.toHaveBeenCalled();
    await iface.getVoices();
    await iface.getCreditsRemaining();
    await iface.getAudio({ text: 'Hi' }, { id: 's1' });
    expect(thunk).toHaveBeenCalledTimes(1);
  });

  it('behaves as before when there is no interface to wrap', async () => {
    const { iface } = withNative(null);
    const result = await iface.getVoices();
    expect(result.voices!.local).toHaveLength(1);
    expect(result.standardCreditsRemaining).toBeNull();
    expect(await iface.getAudio({ text: 'Hi' }, { id: 's1' })).toEqual({ audio: null, error: 'unknown' });
  });

  it('treats a thunk that throws as no interface, and records it', async () => {
    const log = vi.fn();
    const iface = createRemoteInterface({
      ...deps(),
      native: () => {
        throw new Error('no window');
      },
      log,
    });
    const result = await iface.getVoices();
    expect(result.voices!.local).toHaveLength(1);
    expect(log).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe('onVoicesRequested', () => {
  it('runs synchronously at the start of getVoices, before the catalog is asked for', async () => {
    const order: string[] = [];
    const iface = createRemoteInterface({
      ...deps(),
      listCatalog: async () => {
        order.push('catalog');
        return [];
      },
      onVoicesRequested: () => {
        order.push('hook');
      },
    });
    const pending = iface.getVoices();
    expect(order[0]).toBe('hook');
    await pending;
    expect(order).toEqual(['hook', 'catalog']);
  });

  it('survives a hook that throws', async () => {
    const log = vi.fn();
    const iface = createRemoteInterface({
      ...deps(),
      log,
      onVoicesRequested: () => {
        throw new Error('boom');
      },
    });
    await expect(iface.getVoices()).resolves.toBeTruthy();
    expect(log).toHaveBeenCalledWith(expect.any(Error));
  });
});
