import { describe, expect, it, vi } from 'vitest';
import type { ProviderId, TTSProvider } from '../../src/core/providers/types';
import { DEFAULTS } from '../../src/core/settings';
import { CATALOG_CAP_MS, collectCatalog, listNamedCatalog, PROVIDER_LISTING_TIMEOUT_MS, providerNaming, providerTierColumns, providerTierKeys, providerTierLabels } from '../../src/read-aloud/catalog';
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
    const providers = { 'openai-official': provider('openai-official', [alloy]), azure: provider('azure', [xiaoxiao]) } as Record<ProviderId, TTSProvider>;
    const catalog = await collectCatalog(['azure', 'openai-official'], (id) => providers[id]);
    expect(catalog).toEqual([
      { provider: 'azure', voices: [xiaoxiao] },
      { provider: 'openai-official', voices: [alloy] },
    ]);
  });

  it('skips a provider that cannot list, names it in the log, and keeps the others', async () => {
    const log = vi.fn();
    const providers = { 'openai-official': provider('openai-official', new Error('no key')), azure: provider('azure', [xiaoxiao]) } as Record<ProviderId, TTSProvider>;
    const catalog = await collectCatalog(['openai-official', 'azure'], (id) => providers[id], log);
    expect(catalog).toEqual([{ provider: 'azure', voices: [xiaoxiao] }]);
    expect(log).toHaveBeenCalledTimes(1);
    const logged = log.mock.calls[0][0] as Error;
    expect(logged.message).toMatch(/openai/);
    expect(logged.message).toMatch(/no key/);
  });

  it('treats a provider that cannot even be built the same way', async () => {
    const log = vi.fn();
    const catalog = await collectCatalog(
      ['local', 'openai-official'],
      (id) => {
        if (id === 'local') throw new Error('Unknown local engine: piper');
        return provider('openai-official', [alloy]);
      },
      log,
    );
    expect(catalog).toEqual([{ provider: 'openai-official', voices: [alloy] }]);
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
    const providers = { 'openai-official': hanging('openai-official'), azure: provider('azure', [xiaoxiao]) } as Record<ProviderId, TTSProvider>;
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
    const providers = { 'openai-official': provider('openai-official', [alloy]), local: provider('local', [bella]) } as Record<ProviderId, TTSProvider>;
    const catalog = await listNamedCatalog(settings, (id) => providers[id]);
    expect(catalog).toEqual([
      { provider: 'openai-official', voices: [alloy] },
      { provider: 'local', name: 'Kokoro', voices: [bella] },
    ]);
  });

  // Issue #113: the three sections that speak OpenAI's API are entries of
  // their own, named by their ids (voice-catalog.ts providerTierLabel), so
  // the catalog gives them no name of its own
  it('leaves the OpenAI, Xiaomi MiMo and OpenAI Compatible entries to their fixed names', async () => {
    const bingtang = { id: '冰糖', label: '冰糖', locale: 'mul' };
    const settings = { ...DEFAULTS, mimo: { ...DEFAULTS.mimo, enabled: true }, compatible: { ...DEFAULTS.compatible, enabled: true } };
    const providers = { 'openai-official': provider('openai-official', [alloy]), mimo: provider('mimo', [bingtang]), compatible: provider('compatible', [alloy]) } as Record<ProviderId, TTSProvider>;
    expect(await listNamedCatalog(settings, (id) => providers[id])).toEqual([
      { provider: 'openai-official', voices: [alloy] },
      { provider: 'mimo', voices: [bingtang] },
      { provider: 'compatible', voices: [alloy] },
    ]);
  });

  it('leaves an unknown engine nameless instead of failing', async () => {
    const settings = {
      ...DEFAULTS,
      'openai-official': { ...DEFAULTS['openai-official'], enabled: false },
      local: { ...DEFAULTS.local, enabled: true, engine: 'piper' },
    };
    const catalog = await listNamedCatalog(settings, () => provider('local', [bella]));
    expect(catalog).toEqual([{ provider: 'local', voices: [bella] }]);
  });
});

// The entries of the player's first dropdown and the browser's first column
// (issue #110), from the settings: every provider keyed by its id, the local
// engine by its name; the labels the prefixes carried until then
describe('provider tiers from the settings', () => {
  it('names the local entry after the engine', () => {
    expect(providerNaming(DEFAULTS)).toEqual({ localEngine: 'Kokoro' });
    expect(providerNaming({ ...DEFAULTS, local: { ...DEFAULTS.local, engine: 'piper' } }).localEngine).toBeUndefined();
  });

  it('keys every provider by its id and the local provider by its engine', () => {
    expect(providerTierKeys(DEFAULTS)).toEqual({
      'openai-official': 'openai-official',
      mimo: 'mimo',
      compatible: 'compatible',
      azure: 'azure',
      cloudflare: 'cloudflare',
      speechify: 'speechify',
      fish: 'fish',
      fishspeech: 'fishspeech',
      local: 'kokoro',
      system: 'system',
    });
  });

  it('labels every tier key, Zotero’s two included', () => {
    const labels = providerTierLabels(DEFAULTS);
    expect(labels).toEqual({
      standard: 'Zotero Standard',
      premium: 'Zotero Premium',
      'openai-official': 'OpenAI',
      mimo: 'Xiaomi MiMo',
      compatible: 'OpenAI Compatible',
      azure: 'Azure',
      cloudflare: 'Cloudflare',
      speechify: 'Speechify',
      fish: 'Fish Audio',
      fishspeech: 'Fish Speech',
      kokoro: 'Kokoro',
      system: 'System',
    });
  });

  it('lists the enabled providers as columns, and Zotero’s two while their switches are on', () => {
    const settings = { ...DEFAULTS, azure: { ...DEFAULTS.azure, enabled: true }, local: { ...DEFAULTS.local, enabled: true } };
    expect(providerTierColumns(settings)).toEqual([
      { tier: 'openai-official', label: 'OpenAI' },
      { tier: 'azure', label: 'Azure' },
      { tier: 'kokoro', label: 'Kokoro' },
      { tier: 'standard', label: 'Zotero Standard' },
      { tier: 'premium', label: 'Zotero Premium' },
    ]);
    const none = { ...settings, 'openai-official': { ...settings['openai-official'], enabled: false }, azure: { ...settings.azure, enabled: false }, local: { ...settings.local, enabled: false } };
    expect(providerTierColumns(none).map((c) => c.tier)).toEqual(['standard', 'premium']);
    // A tier switched off has no column (issue #111)
    expect(providerTierColumns({ ...none, 'zotero-standard': { enabled: false } }).map((c) => c.tier)).toEqual(['premium']);
    expect(providerTierColumns({ ...none, 'zotero-standard': { enabled: false }, 'zotero-premium': { enabled: false } })).toEqual([]);
  });
});
