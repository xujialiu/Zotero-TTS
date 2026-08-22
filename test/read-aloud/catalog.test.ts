import { describe, expect, it, vi } from 'vitest';
import type { ProviderId, TTSProvider } from '../../src/core/providers/types';
import { collectCatalog } from '../../src/read-aloud/catalog';

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
