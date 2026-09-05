import type { SynthesisRoute } from '../server-presets';
import { normalizeBaseURL } from './base-url';
import { SynthesisError } from './errors';
import { MULTILINGUAL, type SynthesisOptions, type SynthesisResult, type TTSProvider, type VoiceInfo } from './types';

export type OpenAIConfig = {
  apiKey: string;
  baseURL: string;
  /**
   * Sent with every request, before the Authorization header. For gateways
   * that authenticate with their own headers — a Cloudflare Access service
   * token (`CF-Access-Client-Id` / `CF-Access-Client-Secret`), a reverse
   * proxy with a custom header — in front of a server that has no key.
   */
  headers?: Record<string, string>;
  model: string;
  /** Comma-separated voice ids to offer; empty means "ask the server, else `defaultVoices`, else OpenAI's own". */
  voices?: string;
  /**
   * The route the server synthesizes on (core/server-presets.ts): OpenAI's
   * `/v1/audio/speech`, the default, or a chat completion whose reply
   * carries the audio as base64 — Xiaomi MiMo (issue #50).
   */
  synthesis?: SynthesisRoute;
  /** The voices the server documents, for one that publishes no list; OpenAI's own when absent. */
  defaultVoices?: readonly string[];
};

/**
 * OpenAI's own voices, from its documentation. The API has no endpoint that
 * lists them, so this is the last resort when the server publishes no voice
 * list and the user has typed none.
 */
export const OPENAI_DEFAULT_VOICES = [
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

/** "alloy, nova" or one per line → ['alloy', 'nova']. */
export function parseVoiceIds(text: string): string[] {
  return [...new Set(text.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean))];
}

/**
 * Read a voice list in the shapes OpenAI-compatible servers use — there is
 * no standard: Kokoro-FastAPI answers `{ voices: [{ id, name }] }`, others
 * `{ voices: ["id"] }`, `{ data: [...] }`, or a bare array. Returns [] when
 * nothing usable is found.
 */
export function parseVoiceList(body: unknown): { id: string; label: string }[] {
  const container = body as { voices?: unknown; data?: unknown } | unknown[] | null;
  const items = Array.isArray(container)
    ? container
    : Array.isArray(container?.voices)
      ? container.voices
      : Array.isArray(container?.data)
        ? container.data
        : [];
  const out: { id: string; label: string }[] = [];
  for (const item of items) {
    if (typeof item === 'string') {
      if (item) out.push({ id: item, label: item });
      continue;
    }
    const obj = item as { id?: unknown; voice_id?: unknown; name?: unknown } | null;
    const id = [obj?.id, obj?.voice_id, obj?.name].find((v) => typeof v === 'string' && v) as string | undefined;
    if (!id) continue;
    const name = typeof obj?.name === 'string' && obj.name ? obj.name : id;
    out.push({ id, label: name });
  }
  return out;
}

/** `{ data: [{ id }] }` as OpenAI answers, or `{ models: [...] }`, or a bare array. */
export function parseModelList(body: unknown): string[] {
  const container = body as { data?: unknown; models?: unknown } | unknown[] | null;
  const items = Array.isArray(container)
    ? container
    : Array.isArray(container?.data)
      ? container.data
      : Array.isArray(container?.models)
        ? container.models
        : [];
  const out: string[] = [];
  for (const item of items) {
    const id = typeof item === 'string' ? item : (item as { id?: unknown } | null)?.id;
    if (typeof id === 'string' && id && !out.includes(id)) out.push(id);
  }
  return out;
}

function statusError(status: number, what: string): SynthesisError {
  if (status === 401 || status === 403) return new SynthesisError('auth', `${what}: the server rejected the API key (${status})`);
  if (status === 429) return new SynthesisError('rate-limit', `${what}: rate limited (429)`);
  return new SynthesisError('unknown', `${what}: HTTP ${status}`);
}

/**
 * What the server said, from an error body in OpenAI's shape — the longer
 * of `error.message` and `error.param`, since OpenAI puts the detail in the
 * message ("Invalid value: 'x'. Supported values are…", param "voice") and
 * MiMo in the param ("Unknown voice: x. Available voices: […]", message
 * "Param Incorrect"). Empty for anything else.
 */
export function serverReason(body: string): string {
  try {
    const error = (JSON.parse(body) as { error?: unknown } | null)?.error;
    if (typeof error === 'string') return error.trim().slice(0, 300);
    const fields = error as { message?: unknown; param?: unknown } | null;
    const texts = [fields?.message, fields?.param].filter((v): v is string => typeof v === 'string' && v.trim() !== '');
    return texts.sort((a, b) => b.length - a.length)[0]?.trim().slice(0, 300) ?? '';
  } catch {
    return '';
  }
}

/**
 * The typed error for a refused request. OpenAI reports an exhausted
 * balance as 429 with code "insufficient_quota" — the same status as rate
 * limiting, told apart only by the body. Any other refusal quotes the
 * server's reason after the status, when the body gives one: a wrong voice
 * id is the common case, and the server names the right ones.
 */
async function refusal(response: Response, what: string): Promise<SynthesisError> {
  const body = await response.text().catch(() => '');
  if (response.status === 429 && /insufficient_quota|exceeded your current quota/i.test(body)) {
    return new SynthesisError('quota', 'The server refused to synthesize: quota exceeded (insufficient_quota)');
  }
  const error = statusError(response.status, what);
  const reason = error.kind === 'unknown' ? serverReason(body) : '';
  return reason ? new SynthesisError('unknown', `${error.message} — ${reason}`) : error;
}

/** The base64 audio of a chat completion reply, `choices[0].message.audio.data`; null when the reply carries none. */
export function chatAudioData(reply: unknown): string | null {
  const choices = (reply as { choices?: unknown } | null)?.choices;
  const first = (Array.isArray(choices) ? choices[0] : null) as { message?: { audio?: { data?: unknown } | null } | null } | null;
  const data = first?.message?.audio?.data;
  return typeof data === 'string' && data ? data : null;
}

/** Base64 to a Blob, byte for byte. `atob` is on the plugin sandbox's whitelist. */
export function decodeBase64Audio(data: string, type: string): Blob {
  const binary = atob(data.replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

export function createOpenAIProvider(cfg: OpenAIConfig, deps: { fetch: typeof fetch }): TTSProvider {
  // Tolerates the SDK's `/v1` suffix and trailing slashes; works for any
  // OpenAI-compatible server (Kokoro-FastAPI answers the same routes)
  const base = () => normalizeBaseURL(cfg.baseURL);
  const authHeaders = (): Record<string, string> => ({
    ...(cfg.headers ?? {}),
    ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
  });
  // Only OpenAI itself is known to need a key. A compatible server may have
  // none (Kokoro-FastAPI, Chatterbox-TTS-Server) or sit behind a gateway
  // that wants other headers; with no key the request goes out without
  // Authorization, and a server that wanted one answers 401.
  const keyRequired = (): boolean => {
    try {
      return /(^|[.])api[.]openai[.]com$/i.test(new URL(base()).hostname);
    } catch {
      return false;
    }
  };
  const missingKey = () => !cfg.apiKey && keyRequired();

  async function get(path: string): Promise<Response> {
    try {
      return await deps.fetch(`${base()}${path}`, { headers: authHeaders() });
    } catch (e) {
      throw new SynthesisError('network', `Cannot reach ${base()}: ${e}`);
    }
  }

  /**
   * One synthesis on the configured route, the reply as audio. The speech
   * route answers with the bytes. The chat route answers with JSON: the
   * text goes as an `assistant` message with an `audio` object naming the
   * voice and format, and the mp3 comes back as base64 in
   * `choices[0].message.audio.data`; a reply without it — a chat model in
   * the Model field answers text — is an error here, at Test connection and
   * while reading alike, never a silent empty segment. The `note` names the
   * route in the debug output (read-aloud/remote-interface.ts).
   */
  async function speak(text: string, voice: string, signal?: AbortSignal): Promise<{ audio: Blob; note?: string }> {
    const chat = (cfg.synthesis ?? 'speech') === 'chat';
    const what = chat ? 'chat/completions audio' : 'OpenAI speech';
    const body = chat
      ? { model: cfg.model, messages: [{ role: 'assistant', content: text }], audio: { format: 'mp3', voice } }
      : { model: cfg.model, voice, input: text, response_format: 'mp3' };
    let response: Response;
    try {
      response = await deps.fetch(`${base()}${chat ? '/v1/chat/completions' : '/v1/audio/speech'}`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });
    } catch (e) {
      throw new SynthesisError('network', String(e));
    }
    if (!response.ok) throw await refusal(response, what);
    if (!chat) return { audio: await response.blob() };
    let reply: unknown;
    try {
      reply = await response.json();
    } catch {
      throw new SynthesisError('unknown', `${what}: the reply was not JSON`);
    }
    const data = chatAudioData(reply);
    if (!data) throw new SynthesisError('unknown', `${what}: the reply carried no audio — is "${cfg.model}" a speech model?`);
    try {
      return { audio: decodeBase64Audio(data, 'audio/mpeg'), note: 'audio through /v1/chat/completions' };
    } catch (e) {
      throw new SynthesisError('unknown', `${what}: the audio was not valid base64 (${e})`);
    }
  }

  const provider: TTSProvider = {
    id: 'openai',
    // OpenAI's speech endpoint returns no timing information at all, and
    // neither does the chat route (MiMo's `transcript` is null, probed
    // 2026-09-06). Per spec §4.1, we don't estimate.
    capabilities: { wordTimestamps: false },

    /**
     * Voices, in order of trust: the ones the user typed; the ones the
     * server publishes on /v1/audio/voices (a common extension of
     * OpenAI-compatible servers — OpenAI itself answers 404); the ones its
     * preset documents for it (MiMo has no list to ask); OpenAI's own
     * documented list. A server that cannot be reached at all is an error,
     * not a reason to show OpenAI's names for it.
     */
    async listVoices(): Promise<VoiceInfo[]> {
      const custom = parseVoiceIds(cfg.voices ?? '');
      if (custom.length) return custom.map((id) => ({ id, label: id, locale: MULTILINGUAL }));

      const response = await get('/v1/audio/voices');
      if (response.ok) {
        let body: unknown = null;
        try {
          body = await response.json();
        } catch {
          // Not JSON: the route exists but is something else; fall through
        }
        const published = parseVoiceList(body);
        if (published.length) return published.map((v) => ({ ...v, locale: MULTILINGUAL }));
      } else if (response.status === 401 || response.status === 403) {
        throw statusError(response.status, `${base()}/v1/audio/voices`);
      }
      return (cfg.defaultVoices ?? OPENAI_DEFAULT_VOICES).map((id) => ({ id, label: id, locale: MULTILINGUAL }));
    },

    /** The model ids the server offers; the cheapest authenticated request the API has, so also the connection probe. */
    async listModels(): Promise<string[]> {
      if (missingKey()) {
        throw new SynthesisError('no-key', 'OpenAI API key is not set');
      }
      const url = `${base()}/v1/models`;
      const response = await get('/v1/models');
      // Not every OpenAI-compatible server has a model list (Chatterbox-TTS-
      // Server answers 404); that is "no models published", not a failure —
      // the voice list and the synthesis probe still prove the connection.
      if (response.status === 404 || response.status === 405) return [];
      if (!response.ok) throw statusError(response.status, url);
      try {
        return parseModelList(await response.json());
      } catch {
        return [];
      }
    },

    async checkConnection(): Promise<void> {
      await provider.listModels!();
    },

    /**
     * A two-character request on the configured route, discarded.
     * listModels proves the key is accepted; only an actual synthesis
     * proves the account can spend, the voice is accepted and — on the
     * chat route — the model answers audio at all.
     */
    async checkSynthesis(voice: string): Promise<void> {
      if (missingKey()) throw new SynthesisError('no-key', 'OpenAI API key is not set');
      await speak('Hi', voice);
    },

    async synthesize(text: string, o: SynthesisOptions): Promise<SynthesisResult> {
      if (missingKey()) {
        throw new SynthesisError('no-key', 'OpenAI API key is not set');
      }
      return speak(text, o.voice, o.signal);
    },
  };
  return provider;
}
