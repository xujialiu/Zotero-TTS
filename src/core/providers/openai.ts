import { SynthesisError } from './errors';
import type { SynthesisOptions, SynthesisResult, TTSProvider, VoiceInfo } from './types';

export type OpenAIConfig = {
  apiKey: string;
  baseURL: string;
  model: string;
};

/**
 * OpenAI 没有列举音色的接口，只能写死。取自 gpt-4o-mini-tts 支持的音色。
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

/**
 * 这些音色是多语种的，模型按输入文本自动切换。Zotero 的语音列表
 * 按 locale 分组（spec §2.5），所以这里做叉积，每个音色在每个
 * locale 下各出现一次。
 */
export const OPENAI_LOCALES = ['en-US', 'zh-CN', 'ja-JP', 'de-DE', 'fr-FR', 'es-ES'] as const;

export function createOpenAIProvider(cfg: OpenAIConfig, deps: { fetch: typeof fetch }): TTSProvider {
  return {
    id: 'openai',
    // OpenAI 的语音接口不返回任何时间信息。按 spec §4.1，不估算。
    capabilities: { wordTimestamps: false },

    async listVoices(): Promise<VoiceInfo[]> {
      return OPENAI_LOCALES.flatMap((locale) =>
        OPENAI_VOICES.map((id) => ({ id, label: id, locale })),
      );
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
