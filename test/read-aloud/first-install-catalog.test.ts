import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { createProvider, type ProviderDeps } from '../../src/core/providers/factory';
import { loadSettings, PREF_PREFIX } from '../../src/core/settings';
import { listNamedCatalog, providerTierColumns } from '../../src/read-aloud/catalog';
import { browserVoices, groupVoicesByTier } from '../../src/ui/voice-browser-rows';

const installedDefaults = new Map<string, unknown>();
runInNewContext(readFileSync(new URL('../../addon/prefs.js', import.meta.url), 'utf8'), {
  pref: (key: string, value: unknown) => installedDefaults.set(key, value),
});

// Exercise both Gecko's installed defaults and loadSettings' fallback.
describe.each(['installed', 'fallback'] as const)('first-install catalog (%s defaults)', (source) => {
  async function list(enabled?: boolean) {
    const settings = loadSettings({
      get: (key) => key === PREF_PREFIX + 'openai-official.enabled' && enabled !== undefined
        ? enabled
        : source === 'installed' ? installedDefaults.get(key) : undefined,
      set: vi.fn(),
    });
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new Error('Offline fixture'));
    const deps: ProviderDeps = { fetch, getWebSocket: () => { throw new Error('Unexpected WebSocket'); }, newRequestId: () => 'fixture' };
    const log = vi.fn();
    const catalog = await listNamedCatalog(settings, (id) => createProvider(id, settings, deps), log);
    const groups = groupVoicesByTier(browserVoices(catalog), (code) => code, providerTierColumns(settings));
    return { groups, fetch, log };
  }

  it('offers only native tiers without contacting an unconfigured provider', async () => {
    const { groups, fetch, log } = await list();
    expect(groups.map((group) => group.tier).sort()).toEqual(['premium', 'standard']);
    expect(fetch).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it('preserves an explicit enabled choice and its unavailable-provider feedback', async () => {
    const { groups, fetch } = await list(true);
    expect(groups.find((group) => group.label === 'OpenAI')?.count).toBe(0);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('preserves an explicit disabled choice', async () => {
    const { groups, fetch } = await list(false);
    expect(groups.some((group) => group.label === 'OpenAI')).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
});
