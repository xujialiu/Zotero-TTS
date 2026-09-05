import { describe, expect, it, vi } from 'vitest';
import type { ProviderId, TTSProvider } from '../../src/core/providers/types';
import { DEFAULTS } from '../../src/core/settings';
import { collectCatalog, listNamedCatalog } from '../../src/read-aloud/catalog';

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
