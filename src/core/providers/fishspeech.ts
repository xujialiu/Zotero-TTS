import { normalizeBaseURL } from './base-url';
import { SynthesisError } from './errors';
import { isSpeakable } from './speechify';
import { MULTILINGUAL, type ListVoicesOptions, type SynthesisOptions, type SynthesisResult, type TTSProvider, type VoiceInfo } from './types';

/**
 * A Fish Speech server of the user's own (issue #89): fishaudio/fish-speech's
 * `tools/api_server.py`, read on 2026-09-10 (notes/NOTES_2026-09-10.md).
 * - a voice is a folder under the server's `references/`, which
 *   `GET /v1/references/list` names by its id and nothing else — no title,
 *   no language — so every voice sits in the multilingual group;
 * - `POST /v1/tts` takes JSON as well as the MessagePack the server prefers,
 *   and answers the bytes; nothing in its request or its reply carries a
 *   word's time, so these voices highlight by sentence, never by word;
 * - a server started with `--api-key` wants `Authorization: Bearer …`, which
 *   the section's Extra headers carry, and answers 401 "Invalid token"
 *   otherwise; a refused connection is the server being down, and the pane
 *   says so with the address (issue #47).
 */
export type FishSpeechConfig = {
  baseURL: string;
  /** Sent with every request: a gateway's token, or the server's own --api-key as a bearer. */
  headers?: Record<string, string>;
};

/** What `tools/api_server.py --listen` defaults to. */
export const DEFAULT_FISH_SPEECH_URL = 'http://localhost:8080';

export function createFishSpeechProvider(cfg: FishSpeechConfig, deps: { fetch: typeof fetch }): TTSProvider {
  // "http://host:8080/v1/" is what an SDK-style address looks like; the paths below already start with /v1
  const base = () => normalizeBaseURL(cfg.baseURL);
  const notFishSpeech = 'is this a Fish Speech server?';

  const statusError = (what: string, status: number, detail = ''): SynthesisError =>
    status === 401 || status === 403
      ? new SynthesisError('auth', `${what}: the server rejected the credentials (${status})${detail}`)
      : new SynthesisError('unknown', `${what} returned ${status}${detail}`);

  async function call(path: string, init: RequestInit): Promise<Response> {
    const headers = { ...(cfg.headers ?? {}), ...((init.headers as Record<string, string> | undefined) ?? {}) };
    try {
      return await deps.fetch(base() + path, { ...init, headers });
    } catch (e) {
      // fetch throws outright when the server is not up; Gecko's text is the
      // same for a refused port, a DNS failure and a TLS error (issue #47)
      throw new SynthesisError('local-server-down', `Cannot reach Fish Speech at ${base()}. Is the server running? (${e})`);
    }
  }

  return {
    id: 'fishspeech',
    capabilities: { wordTimestamps: false },
    async listVoices(options?: ListVoicesOptions): Promise<VoiceInfo[]> {
      const what = 'Fish Speech references';
      // The server answers MessagePack unless asked for JSON
      const response = await call('/v1/references/list', { headers: { Accept: 'application/json' }, signal: options?.signal });
      if (!response.ok) throw statusError(what, response.status);
      let body: { reference_ids?: unknown };
      try {
        body = (await response.json()) as { reference_ids?: unknown };
      } catch (e) {
        throw new SynthesisError('decode-failed', `${what}: the reply is not JSON — ${notFishSpeech} (${e})`);
      }
      if (!Array.isArray(body?.reference_ids)) throw new SynthesisError('decode-failed', `${what}: the reply lists no reference_ids — ${notFishSpeech}`);
      return body.reference_ids.filter((id): id is string => typeof id === 'string' && id !== '').map((id) => ({ id, label: id, locale: MULTILINGUAL }));
    },
    async checkConnection(): Promise<void> {
      const response = await call('/v1/health', {});
      if (!response.ok) throw statusError('Fish Speech health', response.status);
    },
    async synthesize(text: string, o: SynthesisOptions): Promise<SynthesisResult> {
      // Nothing to say: no request, and the empty audio plays as a pause
      if (!isSpeakable(text)) return { audio: new Blob([], { type: 'audio/mpeg' }), note: 'no speakable text' };
      const what = 'Fish Speech speech';
      const init: RequestInit = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The server's own defaults otherwise; the memory cache keeps the reference encoded between sentences
        body: JSON.stringify({ text, reference_id: o.voice, format: 'mp3', normalize: true, use_memory_cache: 'on' }),
        signal: o.signal,
      };
      const response = await call('/v1/tts', init);
      if (!response.ok) {
        const reason = (await response.text().catch(() => '')).trim().replace(/\s+/g, ' ').slice(0, 200);
        throw statusError(what, response.status, reason ? ` — ${reason}` : '');
      }
      const type = (response.headers.get('content-type') || 'audio/mpeg').split(';')[0].trim();
      return { audio: new Blob([await response.arrayBuffer()], { type }) };
    },
  };
}
