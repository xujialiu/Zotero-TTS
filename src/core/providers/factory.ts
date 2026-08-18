import type { Settings } from '../settings';
import { createAzureProvider } from './azure';
import { SynthesisError } from './errors';
import { getLocalEngine } from './local/registry';
import { createOpenAIProvider } from './openai';
import type { TTSProvider } from './types';

export type ProviderDeps = {
  fetch: typeof fetch;
  getWebSocket: () => typeof WebSocket;
  newRequestId: () => string;
};

export function createProvider(settings: Settings, deps: ProviderDeps): TTSProvider {
  switch (settings.provider) {
    case 'openai':
      return createOpenAIProvider(settings.openai, { fetch: deps.fetch });

    case 'azure':
      return createAzureProvider(settings.azure, deps);

    case 'local': {
      const engine = getLocalEngine(settings.local.engine);
      if (!engine) {
        throw new SynthesisError('unknown', `Unknown local engine: ${settings.local.engine}`);
      }
      return engine.create(settings.local.baseURL, { fetch: deps.fetch });
    }
  }
}
