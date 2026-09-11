import type { Settings } from '../settings';
import { createAzureProvider } from './azure';
import { createCloudflareProvider } from './cloudflare';
import { createSpeechifyProvider } from './speechify';
import { createFishProvider, FishVoiceCache, type FishVoiceCacheStats } from './fish';
import { createFishSpeechProvider } from './fishspeech';
import { SynthesisError } from './errors';
import { getLocalEngine } from './local/registry';
import { createOpenAIProvider } from './openai';
import { createSystemProvider, type SystemProviderDeps } from './system';
import { parseHeaderList } from '../headers';
import { applyPreset, presetSpec } from '../server-presets';
import type { ProviderId, TTSProvider } from './types';

export type ProviderDeps = {
  fetch: typeof fetch;
  getWebSocket: () => typeof WebSocket;
  newRequestId: () => string;
  /** AbortController supplied by a chrome window; absent in the plugin sandbox. */
  newAbortController?: () => AbortController | null;
  /**
   * How to reach the operating system's voices: the session's helper
   * process and the temp-file plumbing around it (src/index.ts builds it
   * once and hands the same one to every provider it makes, since the
   * helper is per Zotero, not per request). Absent — in the tests, and on
   * a platform with no helper — the system provider still exists and every
   * call reports why it cannot work.
   */
  system?: SystemProviderDeps;
};

/** One Fish voice cache per fetch implementation, so tests can isolate sessions while the plugin reuses one in-memory session. */
const fishCaches = new WeakMap<object, FishVoiceCache>();

function fishCache(fetchImpl: typeof fetch): FishVoiceCache {
  const key = fetchImpl as unknown as object;
  let cache = fishCaches.get(key);
  if (!cache) {
    cache = new FishVoiceCache();
    fishCaches.set(key, cache);
  }
  return cache;
}

/** Non-secret counters for the Fish voice-list diagnostic. No account or voice identifier leaves the cache. */
export function getFishVoiceCacheStats(fetchImpl: typeof fetch): FishVoiceCacheStats {
  return fishCaches.get(fetchImpl as unknown as object)?.stats() ?? { cacheHits: 0, loads: 0, cachedAccounts: 0 };
}

/** Build one provider from its section of the settings; enabled or not, the settings only say how to reach it. */
export function createProvider(id: ProviderId, settings: Settings, deps: ProviderDeps): TTSProvider {
  switch (id) {
    case 'openai': {
      // The preset blanks what the chosen server does not read, so a key or
      // voice list left over from another server is never sent; it also
      // says how the server synthesizes and which voices it documents.
      const openai = applyPreset(settings.openai);
      const preset = presetSpec(settings.openai);
      return createOpenAIProvider(
        { ...openai, headers: parseHeaderList(openai.headers), synthesis: preset.synthesis, defaultVoices: preset.voices },
        { fetch: deps.fetch },
      );
    }

    case 'azure':
      return createAzureProvider(settings.azure, deps);

    case 'cloudflare':
      return createCloudflareProvider(settings.cloudflare, { fetch: deps.fetch });

    case 'speechify':
      return createSpeechifyProvider(settings.speechify, { fetch: deps.fetch });

    case 'fish':
      return createFishProvider(settings.fish, { fetch: deps.fetch, cache: fishCache(deps.fetch), newAbortController: deps.newAbortController });

    case 'fishspeech':
      return createFishSpeechProvider({ baseURL: settings.fishspeech.baseURL, headers: parseHeaderList(settings.fishspeech.headers) }, { fetch: deps.fetch });

    case 'system':
      return createSystemProvider(
        deps.system ?? {
          backend: null,
          tempFile: () => Promise.resolve(''),
          readFile: () => Promise.reject(new Error('no speech helper')),
          removeFile: () => Promise.resolve(),
        },
      );

    case 'local': {
      const engine = getLocalEngine(settings.local.engine);
      if (!engine) {
        throw new SynthesisError('unknown', `Unknown local engine: ${settings.local.engine}`);
      }
      return engine.create(settings.local.baseURL, { fetch: deps.fetch, headers: parseHeaderList(settings.local.headers) });
    }
  }
}
