import { alignWordsToText } from '../../align';
import type { TimedWord } from '../../align';
import { normalizeBaseURL } from '../base-url';
import { SynthesisError } from '../errors';
import type { SynthesisOptions, SynthesisResult, TTSProvider, VoiceInfo } from '../types';

/** Kokoro voice ids encode language and gender via a prefix, e.g. af_bella = American Female. */
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

export type LocalEngineDeps = {
  fetch: typeof fetch;
  /**
   * Sent with every request. For a gateway in front of the server — a
   * Cloudflare Access service token (`CF-Access-Client-Id` /
   * `CF-Access-Client-Secret`), a reverse proxy with its own header — so
   * that the Local engine, and with it word-level highlighting, works from
   * another machine.
   */
  headers?: Record<string, string>;
};

function createKokoroProvider(rawBaseURL: string, deps: LocalEngineDeps): TTSProvider {
  // "http://localhost:8880/v1/" is what the OpenAI SDK docs teach; the paths
  // below already start with /v1 or /dev
  const baseURL = normalizeBaseURL(rawBaseURL);
  // A gateway answers 401/403 when the credentials are missing or wrong;
  // that is a different problem from the server being down, and the pane
  // says so ("rejected the API key") instead of sending the user to Docker.
  const statusError = (what: string, status: number): SynthesisError =>
    status === 401 || status === 403
      ? new SynthesisError('auth', `${what}: the server rejected the credentials (${status})`)
      : new SynthesisError('unknown', `${what} returned ${status}`);
  const call = async (path: string, init: RequestInit): Promise<Response> => {
    const headers = { ...(deps.headers ?? {}), ...((init.headers as Record<string, string> | undefined) ?? {}) };
    try {
      return await deps.fetch(baseURL + path, { ...init, headers });
    } catch (e) {
      // fetch throws outright when the local server isn't up. This must be
      // distinguished here, otherwise the user would just see a "network
      // error" and go check their own broadband (spec §8).
      throw new SynthesisError('local-server-down', `Cannot reach Kokoro at ${baseURL}: ${e}`);
    }
  };

  return {
    id: 'local',
    capabilities: { wordTimestamps: true },

    async listVoices(): Promise<VoiceInfo[]> {
      const response = await call('/v1/audio/voices', {});
      if (!response.ok) {
        throw statusError('Kokoro voices', response.status);
      }
      let body: { voices?: unknown };
      try {
        body = (await response.json()) as { voices?: unknown };
      } catch (e) {
        throw new SynthesisError('decode-failed', `Kokoro voices response is not valid JSON: ${e}`);
      }
      // Older servers list plain ids; current Kokoro-FastAPI lists
      // `{ id, name }` objects. Accept both, or the list comes back empty.
      const entries = Array.isArray(body.voices) ? body.voices : [];
      const voices: VoiceInfo[] = [];
      for (const entry of entries) {
        const id = typeof entry === 'string' ? entry : (entry as { id?: unknown })?.id;
        if (typeof id !== 'string' || !id) continue;
        const name = (entry as { name?: unknown })?.name;
        voices.push({ id, label: typeof name === 'string' && name ? name : id, locale: localeForKokoroVoice(id) });
      }
      return voices;
    },

    async synthesize(text: string, o: SynthesisOptions): Promise<SynthesisResult> {
      const payload = {
        model: 'kokoro',
        input: text,
        voice: o.voice,
        speed: o.speed,
        response_format: 'mp3',
        return_timestamps: true,
        // Kokoro-FastAPI streams newline-delimited JSON chunks by default
        // (CaptionedSpeechRequest.stream defaults to true); one JSON object
        // with the whole audio and every timestamp is what is parsed below.
        stream: false,
      };
      const init: RequestInit = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: o.signal,
      };

      const captioned = await call('/dev/captioned_speech', init);
      if (captioned.status === 401 || captioned.status === 403) {
        // The plain endpoint sits behind the same gateway; no point trying it
        throw statusError('Kokoro speech', captioned.status);
      }

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

      // Older versions or minimal deployments may not have
      // /dev/captioned_speech. Fall back to the plain endpoint, at the cost
      // of losing word-level timestamps — per spec §4.1, fall back to
      // sentence-level rather than estimating.
      const plain = await call('/v1/audio/speech', init);
      if (!plain.ok) {
        throw statusError('Kokoro speech', plain.status);
      }
      return { audio: await plain.blob() };
    },
  };
}

export const kokoroAdapter = {
  id: 'kokoro',
  label: 'Kokoro-FastAPI',
  voiceName: 'Kokoro',
  defaultBaseURL: 'http://localhost:8880',
  capabilities: { wordTimestamps: true },
  create: createKokoroProvider,
};
