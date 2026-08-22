import { normalizeBaseURL } from './base-url';
import { SynthesisError } from './errors';
import { MULTILINGUAL, type SynthesisOptions, type SynthesisResult, type TTSProvider, type VoiceInfo } from './types';

export type OpenAIConfig = {
  apiKey: string;
  baseURL: string;
  model: string;
  /** Comma-separated voice ids to offer; empty means "ask the server, else the OpenAI defaults". */
  voices?: string;
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

export function createOpenAIProvider(cfg: OpenAIConfig, deps: { fetch: typeof fetch }): TTSProvider {
  // Tolerates the SDK's `/v1` suffix and trailing slashes; works for any
  // OpenAI-compatible server (Kokoro-FastAPI answers the same routes)
  const base = () => normalizeBaseURL(cfg.baseURL);
  const authHeaders = (): Record<string, string> => (cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {});

  async function get(path: string): Promise<Response> {
    try {
      return await deps.fetch(`${base()}${path}`, { headers: authHeaders() });
    } catch (e) {
      throw new SynthesisError('network', `Cannot reach ${base()}: ${e}`);
    }
  }

  const provider: TTSProvider = {
    id: 'openai',
    // OpenAI's speech endpoint returns no timing information at all. Per spec §4.1, we don't estimate.
    capabilities: { wordTimestamps: false },

    /**
     * Voices, in order of trust: the ones the user typed; the ones the
     * server publishes on /v1/audio/voices (a common extension of
     * OpenAI-compatible servers — OpenAI itself answers 404); OpenAI's own
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
      return OPENAI_DEFAULT_VOICES.map((id) => ({ id, label: id, locale: MULTILINGUAL }));
    },

    /** The model ids the server offers; the cheapest authenticated request the API has, so also the connection probe. */
    async listModels(): Promise<string[]> {
      if (!cfg.apiKey) {
        throw new SynthesisError('no-key', 'OpenAI API key is not set');
      }
      const url = `${base()}/v1/models`;
      const response = await get('/v1/models');
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

    async synthesize(text: string, o: SynthesisOptions): Promise<SynthesisResult> {
      if (!cfg.apiKey) {
        throw new SynthesisError('no-key', 'OpenAI API key is not set');
      }

      let response: Response;
      try {
        response = await deps.fetch(`${base()}/v1/audio/speech`, {
          method: 'POST',
          headers: {
            ...authHeaders(),
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

      if (!response.ok) throw statusError(response.status, 'OpenAI speech');

      return { audio: await response.blob() };
    },
  };
  return provider;
}
