import { createOpenAICompatibleProvider } from './openai-compatible';
import type { TTSProvider } from './types';

/**
 * The Xiaomi MiMo section (issues #50, #113): a fixed hosted endpoint, a key
 * required, and the one route its TTS has — a chat completion whose reply
 * carries the audio as base64 (its `/v1/audio/speech` is a 404 at the
 * gateway). It publishes no voice list, so its documented voices are
 * offered unless the user types their own.
 */

export const MIMO_URL = 'https://api.xiaomimimo.com';

/** The built-in voices of mimo-v2.5-tts, from the platform's documentation (verified live 2026-09-06). */
export const MIMO_VOICES = ['mimo_default', '冰糖', '茉莉', '苏打', '白桦', 'Mia', 'Chloe', 'Milo', 'Dean'] as const;

export type MiMoConfig = {
  apiKey: string;
  model: string;
  /** Comma-separated voice ids to offer; empty means MiMo's documented voices. */
  voices?: string;
};

export function createMiMoProvider(cfg: MiMoConfig, deps: { fetch: typeof fetch }): TTSProvider {
  return createOpenAICompatibleProvider(
    {
      id: 'mimo',
      label: 'Xiaomi MiMo',
      baseURL: MIMO_URL,
      apiKey: cfg.apiKey,
      model: cfg.model,
      voices: cfg.voices,
      keyRequired: true,
      route: 'chat',
      defaultVoices: MIMO_VOICES,
    },
    deps,
  );
}
