import { SynthesisError } from './errors';
import { OPENAI_DEFAULT_VOICES } from './openai';
import { createOpenAICompatibleProvider } from './openai-compatible';
import type { TTSProvider } from './types';

/**
 * The OpenAI Compatible section (issue #113): any server that speaks
 * OpenAI's API at the address typed — Chatterbox-TTS-Server, a hosted
 * service such as Groq or SiliconFlow, a proxy or mirror of OpenAI. The
 * key may stay empty (a server that wanted one answers 401), gateway
 * headers go out with every request, and the voices are the server's own
 * where it publishes them, OpenAI's documented ones where it does not —
 * which is what a proxy of OpenAI needs.
 */

/** The section's name, the player's entry and the errors' prefix; the same in every language, like Kokoro-FastAPI. */
export const COMPATIBLE_LABEL = 'OpenAI Compatible';

export type CompatibleConfig = {
  baseURL: string;
  apiKey: string;
  model: string;
  /** Comma-separated voice ids to offer; empty means the server's list, else OpenAI's documented voices. */
  voices?: string;
  /** Sent with every request: a gateway's token, or a header the server wants instead of a bearer. */
  headers?: Record<string, string>;
};

export function createCompatibleProvider(cfg: CompatibleConfig, deps: { fetch: typeof fetch }): TTSProvider {
  const provider = createOpenAICompatibleProvider(
    {
      id: 'compatible',
      label: COMPATIBLE_LABEL,
      baseURL: cfg.baseURL,
      apiKey: cfg.apiKey,
      headers: cfg.headers,
      model: cfg.model,
      voices: cfg.voices,
      keyRequired: false,
      route: 'speech',
      defaultVoices: OPENAI_DEFAULT_VOICES,
    },
    deps,
  );
  if (cfg.baseURL.trim()) return provider;
  // No address yet: every call says so instead of fetching a bare path
  const noAddress = () => Promise.reject(new SynthesisError('network', `${COMPATIBLE_LABEL}: no server address`));
  return { ...provider, listVoices: noAddress, listModels: noAddress, checkConnection: noAddress, checkSynthesis: noAddress, synthesize: noAddress };
}
