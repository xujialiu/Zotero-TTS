import type { Settings } from '../settings';
import { createAzureProvider } from './azure';
import { SynthesisError } from './errors';
import { getLocalEngine } from './local/registry';
import { createOpenAIProvider } from './openai';
import { parseHeaderList } from '../headers';
import { applyPreset } from '../server-presets';
import type { ProviderId, TTSProvider } from './types';

export type ProviderDeps = {
  fetch: typeof fetch;
  getWebSocket: () => typeof WebSocket;
  newRequestId: () => string;
};

/** Build one provider from its section of the settings; enabled or not, the settings only say how to reach it. */
export function createProvider(id: ProviderId, settings: Settings, deps: ProviderDeps): TTSProvider {
  switch (id) {
    case 'openai': {
      // The preset blanks what the chosen server does not read, so a key or
      // voice list left over from another server is never sent.
      const openai = applyPreset(settings.openai);
      return createOpenAIProvider({ ...openai, headers: parseHeaderList(openai.headers) }, { fetch: deps.fetch });
    }

    case 'azure':
      return createAzureProvider(settings.azure, deps);

    case 'local': {
      const engine = getLocalEngine(settings.local.engine);
      if (!engine) {
        throw new SynthesisError('unknown', `Unknown local engine: ${settings.local.engine}`);
      }
      return engine.create(settings.local.baseURL, { fetch: deps.fetch, headers: parseHeaderList(settings.local.headers) });
    }
  }
}
