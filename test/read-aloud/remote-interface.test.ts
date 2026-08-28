import { describe, expect, it, vi } from 'vitest';
import { SynthesisError } from '../../src/core/providers/errors';
import type { TTSProvider } from '../../src/core/providers/types';
import { createRemoteInterface, SAMPLE_TEXT, SILENT_PAUSE_MS, TINY_SEGMENT_CHARS, WHOLE_SEGMENT_END_SECONDS } from '../../src/read-aloud/remote-interface';
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

  // The switch that hides Zotero's own Local voices (system-voices.ts) also
  // drops the TTS- prefix: ours are then the only entries in the tier
  it('drops the TTS- label prefix while the system voices are hidden', async () => {
    const labelOf = (result: any) => (Object.values((result.voices!.local as any[])[0].voices)[0] as { label: string }).label;
    const hidden = await createRemoteInterface({ ...deps(), getHideZoteroLocalVoices: () => true }).getVoices();
    expect(labelOf(hidden)).toBe('OpenAI-Alloy');
    const shown = await createRemoteInterface(deps()).getVoices();
    expect(labelOf(shown)).toBe('TTS-OpenAI-Alloy');
  });

  // The "offer only favorites" switch: the ids come from the voice browser's
  // hearts; with none marked (deps return null) everything is published.
  it('publishes only the favorite voices while the switch is on', async () => {
    const provider = fakeProvider({
      listVoices: async () => [
        { id: 'alloy', label: 'Alloy', locale: 'en-US' },
        { id: 'echo', label: 'Echo', locale: 'en-US' },
      ],
    });
    const favorite = encodeVoiceId('openai', 'echo');
    const result = await createRemoteInterface({ ...deps(provider), getFavoriteVoices: () => [favorite] }).getVoices();
    const configs = result.voices!.local as { voices: Record<string, unknown> }[];
    expect(configs).toHaveLength(1);
    expect(Object.keys(configs[0].voices)).toEqual([favorite]);
    const all = await createRemoteInterface({ ...deps(provider), getFavoriteVoices: () => null }).getVoices();
    expect(all.voices!.local).toHaveLength(2);
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
      cache: () => ({ match: async () => null, put }),
    });

    const result = await iface.getAudio({ text: 'Hello' }, voice);

    expect(adoptAudio).toHaveBeenCalledWith(original);
    expect(result.audio).toBe(adopted);
    expect((put as any).mock.calls[0][1].audio).toBe(adopted);
  });

  // The interface is built once per reader (src/index.ts startHijack), so a
  // cache handed over as a value would freeze the setting for every tab that
  // is already open — and with it a prefetch switched on afterwards, which
  // warms into this cache and does nothing without one.
  it('asks for the cache on every call, so the setting reaches an open reader', async () => {
    const put = vi.fn(async () => {});
    const cache = vi.fn(() => ({ match: async () => null, put }));
    const iface = createRemoteInterface({ ...deps(), cache });

    await iface.getAudio({ text: 'Hello' }, voice);
    expect(cache).toHaveBeenCalled();
    expect(put).toHaveBeenCalledTimes(1);

    // Switched off between the two calls: nothing is stored any more
    cache.mockReturnValue(undefined as any);
    await iface.getAudio({ text: 'A different sentence' }, voice);
    expect(put).toHaveBeenCalledTimes(1);
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

    expect(synthesize).toHaveBeenCalledWith('Hello', expect.objectContaining({ voice: 'alloy' }));
    // Always at the voice's natural pace: Read Aloud's own slider stretches the audio on playback
    expect((synthesize as any).mock.calls[0][1]).not.toHaveProperty('speed');
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
        cache: () => ({ match: async () => cached, put: async () => {} }),
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

  it('resolves with error when cacheVersion throws', async () => {
    const iface = createRemoteInterface({
      ...deps(),
      cacheVersion: () => {
        throw new Error('version error');
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

    // Request A: voiceId='alloy h', text='i'
    const iface1 = createRemoteInterface({
      listCatalog: async () => [{ provider, voices: [] }],
      getProvider: () => fakeProvider(),
      cacheVersion: () => cacheVersion,
      cache: () => ({ match: async () => null, put }),
    });
    await iface1.getAudio({ text: 'i' }, { id: encodeVoiceId(provider, 'alloy h') });
    const keyA = (put as any).mock.calls[0][0] as string;

    put.mockClear();

    // Request B: voiceId='alloy', text='h i'
    const iface2 = createRemoteInterface({
      listCatalog: async () => [{ provider, voices: [] }],
      getProvider: () => fakeProvider(),
      cacheVersion: () => cacheVersion,
      cache: () => ({ match: async () => null, put }),
    });
    await iface2.getAudio({ text: 'h i' }, { id: encodeVoiceId(provider, 'alloy') });
    const keyB = (put as any).mock.calls[0][0] as string;

    // Prove these inputs would have collided under the old space-joined scheme
    const oldSchemeKeyA = [cacheVersion, provider, 'alloy h', 'i'].join(' ');
    const oldSchemeKeyB = [cacheVersion, provider, 'alloy', 'h i'].join(' ');
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

  it('rejects an unrecognized voice id without calling the provider', async () => {
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
      cache: () => ({ match: async () => cached, put: async () => {} }),
    });

    const result = await iface.getAudio({ text: 'Hello' }, voice);

    expect(await result.audio!.text()).toBe('cached');
    expect(synthesize).not.toHaveBeenCalled();
  });

  it('stores a fresh result in the cache under a key that includes the voice, the text and the config version', async () => {
    const put = vi.fn(async () => {});
    const iface = createRemoteInterface({
      ...deps(),
      cache: () => ({ match: async () => null, put }),
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

  // "Offer only favorite voices" means only those, in every tier: a heart on
  // a Standard or Premium voice trims the popup exactly as one on a plugin
  // voice does, and a tier nobody marked comes up empty (Zotero's Voice Mode
  // then shows it disabled).
  const twoTiers = () =>
    fakeNative({
      getVoices: vi.fn(async () => ({
        voices: {
          standard: [{ voices: { s1: { label: 'One' }, s2: { label: 'Two' } }, locales: { 'en-US': ['s1', 's2'] } }],
          premium: [standardConfig],
        },
        standardCreditsRemaining: null,
        premiumCreditsRemaining: null,
      })),
    });

  it("trims Zotero's own tiers to the favorites while the switch is on", async () => {
    const result = await withNative(twoTiers(), { getFavoriteVoices: () => ['s2'] }).iface.getVoices();
    const standard = result.voices!.standard as { voices: Record<string, unknown>; locales: Record<string, string[]> }[];
    expect(Object.keys(standard[0].voices)).toEqual(['s2']);
    expect(standard[0].locales).toEqual({ 'en-US': ['s2'] });
    expect(result.voices!.premium).toEqual([]);
  });

  // The same rule the other way round: a favorite of Zotero's leaves the
  // plugin's own tier empty, rather than offering all of it beside the one
  // marked cloud voice.
  it("empties the plugin's tier when only one of Zotero's voices is marked", async () => {
    const result = await withNative(twoTiers(), { getFavoriteVoices: () => ['s2'] }).iface.getVoices();
    // An empty tier is a missing key here: buildVoicesResponse publishes
    // nothing at all rather than an empty config list, which Zotero's
    // parseVoicesResponse reads the same way.
    expect(result.voices!.local ?? []).toEqual([]);
  });

  // Favorites outlive the voices they name (a provider switched off, an
  // account signed out). Trimming everything away would read as "the plugin
  // broke", so that one case offers the lot again.
  it('offers every tier again when not one favorite is listed any more', async () => {
    const result = await withNative(twoTiers(), { getFavoriteVoices: () => ['gone::forever'] }).iface.getVoices();
    expect(result.voices!.premium).toEqual([standardConfig]);
    expect((result.voices!.standard as unknown[])).toHaveLength(1);
    expect(result.voices!.local).toHaveLength(1);
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

describe('tiny segments the server refuses', () => {
  // Chatterbox-TTS-Server answers HTTP 500 for "1.", "No", "I." — its
  // alignment analyzer needs more tokens — while whole sentences are fine
  const refusing = () =>
    fakeProvider({
      synthesize: async () => {
        throw new SynthesisError('unknown', 'http://tts/v1/audio/speech: HTTP 500');
      },
    });
  const whole = (text: string) => [{ start: 0, end: WHOLE_SEGMENT_END_SECONDS, charStart: 0, charEnd: text.length }];

  it('plays a short pause instead of stopping playback, and does not cache it', async () => {
    const debug = vi.fn();
    const put = vi.fn();
    const iface = createRemoteInterface({ ...deps(refusing()), debug, cache: () => ({ match: async () => null, put }) });
    const result = await iface.getAudio({ text: '1.' }, voice);
    expect(result.error).toBeUndefined();
    expect(result.audio).toBeInstanceOf(Blob);
    expect(result.audio!.type).toBe('audio/wav');
    expect(result.audio!.size).toBe(44 + 2 * Math.round((8000 * SILENT_PAUSE_MS) / 1000));
    expect(result.timestamps).toEqual(whole('1.'));
    expect(put).not.toHaveBeenCalled();
    expect(debug).toHaveBeenCalledWith(expect.stringMatching(/refused "1\."/));
  });

  it('hands the pause through adoptAudio like any other audio', async () => {
    const adopted = new Blob(['adopted'], { type: 'audio/wav' });
    const adoptAudio = vi.fn(() => adopted);
    const result = await createRemoteInterface({ ...deps(refusing()), adoptAudio }).getAudio({ text: ' No ' }, voice);
    expect(adoptAudio).toHaveBeenCalledOnce();
    expect(result.audio).toBe(adopted);
    expect(result.timestamps).toEqual(whole('No'));
  });

  it('still reports the failure for a segment with real text', async () => {
    const text = 'A'.repeat(TINY_SEGMENT_CHARS + 1);
    const result = await createRemoteInterface(deps(refusing())).getAudio({ text }, voice);
    expect(result.audio).toBeNull();
    expect(result.error).toBe('unknown');
  });

  it('does not hide a key, network or quota problem behind a pause', async () => {
    for (const kind of ['no-key', 'auth', 'network', 'local-server-down', 'quota', 'rate-limit'] as const) {
      const iface = createRemoteInterface(
        deps(
          fakeProvider({
            synthesize: async () => {
              throw new SynthesisError(kind);
            },
          }),
        ),
      );
      const result = await iface.getAudio({ text: '1.' }, voice);
      expect(result.audio, kind).toBeNull();
    }
  });
});

function fakeCache() {
  const store = new Map<string, any>();
  return {
    store,
    match: vi.fn(async (k: string) => store.get(k) ?? null),
    put: vi.fn(async (k: string, v: any) => void store.set(k, v)),
  };
}

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

describe('prefetch', () => {
  const LONG_A = 'The first upcoming sentence, well over the tiny limit.';
  const LONG_B = 'The second upcoming sentence, also long enough to keep.';

  function prefetchDeps(synthesize: TTSProvider['synthesize'], upcoming: string[], enabled = true, count = 3) {
    const cache = fakeCache();
    const debug = vi.fn();
    const d = {
      ...deps(fakeProvider({ synthesize })),
      cache: () => cache,
      debug,
      getPrefetch: () => ({ enabled, count }),
      getUpcomingTexts: vi.fn(() => upcoming),
    };
    return { d, cache, debug };
  }

  it('warms the cache for the upcoming segments after serving a request', async () => {
    const synthesize = vi.fn(async (text: string) => ({ audio: new Blob([text]) }));
    const { d, cache } = prefetchDeps(synthesize, [LONG_A, LONG_B]);
    await createRemoteInterface(d).getAudio({ text: 'Now playing sentence.' }, voice);
    await flush();
    const texts = synthesize.mock.calls.map((c) => c[0]);
    expect(texts).toEqual(['Now playing sentence.', LONG_A, LONG_B]);
    expect(cache.store.size).toBe(3);
  });

  it('does nothing with the switch off, and skips tiny segments', async () => {
    const synthesize = vi.fn(async (text: string) => ({ audio: new Blob([text]) }));
    const off = prefetchDeps(synthesize, [LONG_A], false);
    await createRemoteInterface(off.d).getAudio({ text: 'Now playing sentence.' }, voice);
    await flush();
    expect(synthesize).toHaveBeenCalledTimes(1);

    const tiny = prefetchDeps(synthesize, ['1.', 'No.']);
    await createRemoteInterface(tiny.d).getAudio({ text: 'Now playing sentence.' }, voice);
    await flush();
    // Only the played sentence again — both upcoming texts are under the tiny limit
    expect(synthesize).toHaveBeenCalledTimes(2);
  });

  it('never prefetches for the settings-pane sample', async () => {
    const synthesize = vi.fn(async (text: string) => ({ audio: new Blob([text]) }));
    const { d } = prefetchDeps(synthesize, [LONG_A]);
    await createRemoteInterface(d).getAudio('sample', voice);
    await flush();
    expect(synthesize).toHaveBeenCalledTimes(1);
  });

  it('synthesizes each sentence once however many callers ask (Zotero prefetches concurrently)', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const synthesize = vi.fn(async (text: string) => {
      await gate;
      return { audio: new Blob([text]) };
    });
    const { d } = prefetchDeps(synthesize, []);
    const iface = createRemoteInterface(d);
    const [a, b] = [iface.getAudio({ text: 'Same sentence.' }, voice), iface.getAudio({ text: 'Same sentence.' }, voice)];
    release();
    await Promise.all([a, b]);
    expect(synthesize).toHaveBeenCalledTimes(1);
  });

  it('a played segment that was prefetched is served from the cache', async () => {
    const synthesize = vi.fn(async (text: string) => ({ audio: new Blob([text]) }));
    const { d, debug } = prefetchDeps(synthesize, [LONG_A]);
    const iface = createRemoteInterface(d);
    await iface.getAudio({ text: 'Now playing sentence.' }, voice);
    await flush();
    await iface.getAudio({ text: LONG_A }, voice);
    expect(synthesize).toHaveBeenCalledTimes(2);
    expect(debug.mock.calls.some(([m]) => String(m).includes('(cached)'))).toBe(true);
    expect(debug.mock.calls.some(([m]) => String(m).includes('prefetch:'))).toBe(true);
  });
});

describe('prefetch skips in-flight segments instead of joining them', () => {
  // Zotero's player slides its own three-segment parallel window; a chain
  // that waited on those fetches would never reach the segments beyond it
  it('leapfrogs a segment someone else is fetching and warms the ones after', async () => {
    const NEXT = 'The segment Zotero is already fetching, long enough.';
    const AFTER = 'The segment beyond the native window, long enough too.';
    let releaseNext!: () => void;
    const nextGate = new Promise<void>((r) => (releaseNext = r));
    const synthesize = vi.fn(async (text: string) => {
      if (text === NEXT) await nextGate;
      return { audio: new Blob([text]) };
    });
    const cache = fakeCache();
    const d = {
      ...deps(fakeProvider({ synthesize })),
      cache: () => cache,
      getPrefetch: () => ({ enabled: true, count: 2 }),
      getUpcomingTexts: () => [NEXT, AFTER],
    };
    const iface = createRemoteInterface(d);
    // Zotero's own prefetch grabs NEXT and holds it in flight...
    const zotero = iface.getAudio({ text: NEXT }, voice);
    // ...then the played segment triggers our chain
    const played = iface.getAudio({ text: 'Now playing sentence.' }, voice);
    await played;
    await flush();
    // The chain must have warmed AFTER without waiting for NEXT to resolve
    const texts = synthesize.mock.calls.map((c) => c[0]);
    expect(texts).toContain(AFTER);
    expect(texts.filter((t) => t === NEXT)).toHaveLength(1);
    releaseNext();
    await zotero;
    await flush();
    expect(cache.store.size).toBe(3);
  });
});

describe('the fallback note of a provider reaches the debug output', () => {
  it('names the cause next to the missing timestamps', async () => {
    const debug = vi.fn();
    const iface = createRemoteInterface({
      ...deps(fakeProvider({ synthesize: async () => ({ audio: new Blob(['x']), note: '/dev/captioned_speech returned 404; fell back to /v1/audio/speech' }) })),
      debug,
    });
    await iface.getAudio({ text: 'Hello' }, voice);
    expect(debug).toHaveBeenCalledWith(expect.stringMatching(/no word timestamps for 5 chars \(.*captioned_speech returned 404.*\), highlighting the sentence/));
  });
});
