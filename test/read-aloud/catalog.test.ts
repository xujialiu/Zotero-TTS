import { describe, expect, it, vi } from 'vitest';
import type { ProviderId, TTSProvider } from '../../src/core/providers/types';
import { DEFAULTS } from '../../src/core/settings';
import { CATALOG_CAP_MS, collectCatalog, listNamedCatalog, PROVIDER_LISTING_TIMEOUT_MS } from '../../src/read-aloud/catalog';
import { TEST_CONNECTION_TIMEOUT_MS } from '../../src/ui/prefs-pane';

function provider(id: ProviderId, voices: { id: string; label: string; locale: string }[] | Error): TTSProvider {
  return {
    id,
    capabilities: { wordTimestamps: false },
    listVoices: async () => {
      if (voices instanceof Error) throw voices;
      return voices;
    },
    synthesize: vi.fn(),
  } as unknown as TTSProvider;
}

const alloy = { id: 'alloy', label: 'Alloy', locale: 'en-US' };
const xiaoxiao = { id: 'zh-CN-XiaoxiaoNeural', label: 'Xiaoxiao', locale: 'zh-CN' };

describe('collectCatalog', () => {
  it('keeps usable voices together with a provider’s listing notices', async () => {
    const fish = provider('fish', [alloy]);
    Object.assign(fish, { voiceListNotices: () => [{ kind: 'limited' }, { kind: 'stale', detail: 'Network unavailable' }] });
    expect(await collectCatalog(['fish'], () => fish)).toEqual([
      { provider: 'fish', voices: [alloy], notices: [{ kind: 'limited' }, { kind: 'stale', detail: 'Network unavailable' }] },
    ]);
  });

  it('lists the voices of every requested provider, in order', async () => {
    const providers = { openai: provider('openai', [alloy]), azure: provider('azure', [xiaoxiao]) } as Record<ProviderId, TTSProvider>;
    const catalog = await collectCatalog(['azure', 'openai'], (id) => providers[id]);
    expect(catalog).toEqual([
      { provider: 'azure', voices: [xiaoxiao] },
      { provider: 'openai', voices: [alloy] },
    ]);
  });

  it('skips a provider that cannot list, names it in the log, and keeps the others', async () => {
    const log = vi.fn();
    const providers = { openai: provider('openai', new Error('no key')), azure: provider('azure', [xiaoxiao]) } as Record<ProviderId, TTSProvider>;
    const catalog = await collectCatalog(['openai', 'azure'], (id) => providers[id], log);
    expect(catalog).toEqual([{ provider: 'azure', voices: [xiaoxiao] }]);
    expect(log).toHaveBeenCalledTimes(1);
    const logged = log.mock.calls[0][0] as Error;
    expect(logged.message).toMatch(/openai/);
    expect(logged.message).toMatch(/no key/);
  });

  it('treats a provider that cannot even be built the same way', async () => {
    const log = vi.fn();
    const catalog = await collectCatalog(
      ['local', 'openai'],
      (id) => {
        if (id === 'local') throw new Error('Unknown local engine: piper');
        return provider('openai', [alloy]);
      },
      log,
    );
    expect(catalog).toEqual([{ provider: 'openai', voices: [alloy] }]);
    expect((log.mock.calls[0][0] as Error).message).toMatch(/local.*piper/);
  });

  it('returns nothing when no provider is enabled', async () => {
    const getProvider = vi.fn();
    expect(await collectCatalog([], getProvider)).toEqual([]);
    expect(getProvider).not.toHaveBeenCalled();
  });
});

// Issue #55: a provider that neither answers nor fails used to hold the
// whole listing past the union's cap, and the cap then dropped every
// provider's voices — the ones that had answered included — so Read Aloud
// started on one of Zotero's paid voices. Each provider is bounded on its
// own now, and one that has not answered in time is skipped exactly like
// one that failed.
describe('collectCatalog with a provider that never answers', () => {
  const hanging = (id: ProviderId, listVoices: (...args: unknown[]) => Promise<unknown> = vi.fn(() => new Promise<never>(() => {}))): TTSProvider =>
    ({ id, capabilities: { wordTimestamps: false }, listVoices, synthesize: vi.fn() }) as unknown as TTSProvider;

  it('skips it within the bound, keeps the providers that answered, and names it in the log with the bound', async () => {
    const log = vi.fn();
    const providers = { local: hanging('local'), azure: provider('azure', [xiaoxiao]) } as Record<ProviderId, TTSProvider>;
    const started = Date.now();
    const catalog = await collectCatalog(['local', 'azure'], (id) => providers[id], log, { timeoutMs: 20 });
    expect(Date.now() - started).toBeLessThan(1000);
    expect(catalog).toEqual([{ provider: 'azure', voices: [xiaoxiao] }]);
    expect(log).toHaveBeenCalledTimes(1);
    expect((log.mock.calls[0][0] as Error).message).toMatch(/^local: listing voices failed: no voice list within \d+ s$/);
  });

  it('hands each provider its own signal and aborts only the one that timed out', async () => {
    const hung = vi.fn(() => new Promise<never>(() => {}));
    const answered = vi.fn(async () => [xiaoxiao]);
    const providers = { local: hanging('local', hung), azure: hanging('azure', answered) } as Record<ProviderId, TTSProvider>;
    const newAbortController = vi.fn(() => new AbortController());
    await collectCatalog(['local', 'azure'], (id) => providers[id], undefined, { timeoutMs: 20, newAbortController });
    expect(newAbortController).toHaveBeenCalledTimes(2);
    const [forLocal, forAzure] = newAbortController.mock.results.map((r) => r.value as AbortController);
    expect(hung).toHaveBeenCalledWith({ signal: forLocal.signal });
    expect(answered).toHaveBeenCalledWith({ signal: forAzure.signal });
    expect(forLocal.signal.aborted).toBe(true);
    expect(forAzure.signal.aborted).toBe(false);
  });

  it('still skips it in time when no controller can be made', async () => {
    const hung = vi.fn(() => new Promise<never>(() => {}));
    const providers = { local: hanging('local', hung), azure: provider('azure', [xiaoxiao]) } as Record<ProviderId, TTSProvider>;
    const catalog = await collectCatalog(['local', 'azure'], (id) => providers[id], undefined, { timeoutMs: 20, newAbortController: () => null });
    expect(catalog).toEqual([{ provider: 'azure', voices: [xiaoxiao] }]);
    expect(hung).toHaveBeenCalledWith();
  });

  it('is bounded through listNamedCatalog the same way', async () => {
    const settings = { ...DEFAULTS, azure: { ...DEFAULTS.azure, enabled: true } };
    const providers = { openai: hanging('openai'), azure: provider('azure', [xiaoxiao]) } as Record<ProviderId, TTSProvider>;
    const catalog = await listNamedCatalog(settings, (id) => providers[id], undefined, { timeoutMs: 20 });
    expect(catalog).toEqual([{ provider: 'azure', voices: [xiaoxiao] }]);
  });

  // The bound is the one Test connection puts on a provider's list, so the
  // pane and the popup agree on how long is too long; the callers that cap
  // the whole listing as a last resort sit above it, or the two would tie
  it('defaults to the pane’s bound, below the cap on the whole listing', () => {
    expect(PROVIDER_LISTING_TIMEOUT_MS).toBe(TEST_CONNECTION_TIMEOUT_MS);
    expect(CATALOG_CAP_MS).toBeGreaterThan(PROVIDER_LISTING_TIMEOUT_MS);
  });
});

// The one shared way to list the catalog — the Read Aloud interface and the
// settings' voice browser must show the same voices under the same names.
describe('listNamedCatalog', () => {
  const bella = { id: 'af_bella', label: 'af_bella', locale: 'en-US' };

  it('lists the enabled providers and names local voices after their engine', async () => {
    const settings = { ...DEFAULTS, local: { ...DEFAULTS.local, enabled: true } };
    const providers = { openai: provider('openai', [alloy]), local: provider('local', [bella]) } as Record<ProviderId, TTSProvider>;
    const catalog = await listNamedCatalog(settings, (id) => providers[id]);
    expect(catalog).toEqual([
      { provider: 'openai', voices: [alloy] },
      { provider: 'local', name: 'Kokoro', voices: [bella] },
    ]);
  });

  // Xiaomi MiMo (issue #50): the OpenAI section's voices are named after its
  // preset when the preset has a name of its own, "OpenAI-" otherwise
  it("names the OpenAI section's voices after its server preset, when the preset has a name", async () => {
    const bingtang = { id: '冰糖', label: '冰糖', locale: 'mul' };
    const mimo = { ...DEFAULTS, openai: { ...DEFAULTS.openai, server: 'mimo' } };
    expect(await listNamedCatalog(mimo, () => provider('openai', [bingtang]))).toEqual([{ provider: 'openai', name: 'MiMo', voices: [bingtang] }]);
    const chatterbox = { ...DEFAULTS, openai: { ...DEFAULTS.openai, server: 'chatterbox' } };
    expect(await listNamedCatalog(chatterbox, () => provider('openai', [alloy]))).toEqual([{ provider: 'openai', voices: [alloy] }]);
  });

  it('leaves an unknown engine nameless instead of failing', async () => {
    const settings = {
      ...DEFAULTS,
      openai: { ...DEFAULTS.openai, enabled: false },
      local: { ...DEFAULTS.local, enabled: true, engine: 'piper' },
    };
    const catalog = await listNamedCatalog(settings, () => provider('local', [bella]));
    expect(catalog).toEqual([{ provider: 'local', voices: [bella] }]);
  });
});
