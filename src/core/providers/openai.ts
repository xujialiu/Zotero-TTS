import { SynthesisError } from './errors';
import { ANY_LANGUAGE, type SynthesisOptions, type SynthesisResult, type TTSProvider, type VoiceInfo } from './types';

export type OpenAIConfig = {
  apiKey: string;
  baseURL: string;
  model: string;
};

/**
 * OpenAI has no endpoint to list voices, so this list is hardcoded. Taken
 * from the voices supported by gpt-4o-mini-tts.
 */
export const OPENAI_VOICES = [
  'alloy',
  'ash',
  'ballad',
  'coral',
  'echo',
  'fable',
  'nova',
  'onyx',
  'sage',
  'shimmer',
  'verse',
] as const;

// These voices are multilingual — the model speaks whatever language the
// text is in — so they are listed under Zotero's wildcard locale and show
// up for every language (ANY_LANGUAGE in ./types).

export function createOpenAIProvider(cfg: OpenAIConfig, deps: { fetch: typeof fetch }): TTSProvider {
  return {
    id: 'openai',
    // OpenAI's speech endpoint returns no timing information at all. Per spec §4.1, we don't estimate.
    capabilities: { wordTimestamps: false },

    async listVoices(): Promise<VoiceInfo[]> {
      return OPENAI_VOICES.map((id) => ({ id, label: id, locale: ANY_LANGUAGE }));
    },

    async synthesize(text: string, o: SynthesisOptions): Promise<SynthesisResult> {
      if (!cfg.apiKey) {
        throw new SynthesisError('no-key', 'OpenAI API key is not set');
      }

      let response: Response;
      try {
        response = await deps.fetch(`${cfg.baseURL}/v1/audio/speech`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${cfg.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: cfg.model,
            voice: o.voice,
            input: text,
            speed: o.speed,
            response_format: 'mp3',
          }),
          signal: o.signal,
        });
      } catch (e) {
        throw new SynthesisError('network', String(e));
      }

      if (!response.ok) {
        if (response.status === 429) {
          throw new SynthesisError('rate-limit', `OpenAI returned ${response.status}`);
        }
        throw new SynthesisError('unknown', `OpenAI returned ${response.status}`);
      }

      return { audio: await response.blob() };
    },
  };
}
