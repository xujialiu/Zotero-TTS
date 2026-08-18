import { alignWordsToText } from '../../align';
import type { TimedWord } from '../../align';
import { SynthesisError } from '../errors';
import type { SynthesisOptions, SynthesisResult, TTSProvider, VoiceInfo } from '../types';

/** Kokoro 的音色 id 用前缀编码语言与性别，例如 af_bella = American Female。 */
const LOCALE_BY_PREFIX: Record<string, string> = {
  a: 'en-US',
  b: 'en-GB',
  z: 'zh-CN',
  j: 'ja-JP',
  e: 'es-ES',
  f: 'fr-FR',
  h: 'hi-IN',
  i: 'it-IT',
  p: 'pt-BR',
};

export function localeForKokoroVoice(voiceId: string): string {
  const underscore = voiceId.indexOf('_');
  if (underscore < 1) return 'en-US';
  return LOCALE_BY_PREFIX[voiceId[0]] ?? 'en-US';
}

function base64ToBytes(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

type CaptionedResponse = {
  audio?: string;
  timestamps?: { word?: string; start_time?: number; end_time?: number }[];
};

function toTimedWords(raw: CaptionedResponse['timestamps']): TimedWord[] {
  if (!Array.isArray(raw)) return [];
  const words: TimedWord[] = [];
  for (const t of raw) {
    if (typeof t?.word !== 'string' || typeof t.start_time !== 'number' || typeof t.end_time !== 'number') {
      continue;
    }
    words.push({ text: t.word, start: t.start_time, end: t.end_time });
  }
  return words;
}

function createKokoroProvider(baseURL: string, deps: { fetch: typeof fetch }): TTSProvider {
  const call = async (path: string, init: RequestInit): Promise<Response> => {
    try {
      return await deps.fetch(baseURL + path, init);
    } catch (e) {
      // 本地服务没起来时 fetch 直接抛。这里必须区分出来，
      // 否则用户只会看到"网络错误"，去查自己的宽带（spec §8）。
      throw new SynthesisError('local-server-down', `Cannot reach Kokoro at ${baseURL}: ${e}`);
    }
  };

  return {
    id: 'local',
    capabilities: { wordTimestamps: true },

    async listVoices(): Promise<VoiceInfo[]> {
      const response = await call('/v1/audio/voices', {});
      if (!response.ok) {
        throw new SynthesisError('unknown', `Kokoro voices returned ${response.status}`);
      }
      let body: { voices?: unknown };
      try {
        body = (await response.json()) as { voices?: unknown };
      } catch (e) {
        throw new SynthesisError('decode-failed', `Kokoro voices response is not valid JSON: ${e}`);
      }
      const ids = Array.isArray(body.voices) ? body.voices.filter((v): v is string => typeof v === 'string') : [];
      return ids.map((id) => ({ id, label: id, locale: localeForKokoroVoice(id) }));
    },

    async synthesize(text: string, o: SynthesisOptions): Promise<SynthesisResult> {
      const payload = {
        model: 'kokoro',
        input: text,
        voice: o.voice,
        speed: o.speed,
        response_format: 'mp3',
        return_timestamps: true,
      };
      const init: RequestInit = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: o.signal,
      };

      const captioned = await call('/dev/captioned_speech', init);

      if (captioned.ok) {
        let body: CaptionedResponse;
        try {
          body = (await captioned.json()) as CaptionedResponse;
        } catch (e) {
          throw new SynthesisError('decode-failed', `Kokoro captioned response is not valid JSON: ${e}`);
        }
        if (typeof body.audio === 'string') {
          let audioBlob: Blob;
          try {
            audioBlob = new Blob([base64ToBytes(body.audio)], { type: 'audio/mpeg' });
          } catch (e) {
            throw new SynthesisError('decode-failed', `Kokoro audio is not valid base64: ${e}`);
          }
          const words = toTimedWords(body.timestamps);
          const timestamps = words.length ? alignWordsToText(words, text) : undefined;
          return {
            audio: audioBlob,
            ...(timestamps?.length ? { timestamps } : {}),
          };
        }
      }

      // 旧版本或精简部署可能没有 /dev/captioned_speech。退回普通端点，
      // 代价是失去词级时间戳 —— 按 spec §4.1，退回句级而不是估算。
      const plain = await call('/v1/audio/speech', init);
      if (!plain.ok) {
        throw new SynthesisError('unknown', `Kokoro speech returned ${plain.status}`);
      }
      return { audio: await plain.blob() };
    },
  };
}

export const kokoroAdapter = {
  id: 'kokoro',
  label: 'Kokoro-FastAPI',
  defaultBaseURL: 'http://localhost:8880',
  capabilities: { wordTimestamps: true },
  create: createKokoroProvider,
};
