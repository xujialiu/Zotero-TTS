import { SynthesisError } from './errors';
import type { ListVoicesOptions, SynthesisOptions, SynthesisResult, TTSProvider, VoiceInfo } from './types';

/**
 * Cloudflare Workers AI (issue #72): the account's text-to-speech models,
 * run over the REST route `POST /accounts/{account}/ai/run/{model}` with an
 * API token. Two values identify a setup — the account id is part of the
 * URL, the token goes in the Authorization header — and neither is an
 * address: there is one host, and every model has a payload of its own.
 *
 * Measured against the live API on 2026-09-07 (notes/NOTES_2026-09-07.md):
 * - the model list, `GET …/ai/models/search?task=Text-to-Speech`, costs
 *   nothing and is the connection check; a wrong token *or* a wrong
 *   account id is a 401 "Authentication error" on every route;
 * - Aura answers a raw `audio/mpeg` body; MeloTTS answers JSON with the
 *   audio as base64, and the audio is a WAV whatever the model page says;
 * - no reply carries timestamps, so the highlight is the sentence's;
 * - the speakers are constants of each model, not a list to fetch: the
 *   lists below are what a wrong speaker's refusal names; MeloTTS's
 *   language codes are the four that answered 200 (es and fr are refused).
 */

export type CloudflareConfig = { accountId: string; apiToken: string };

export type CloudflareDeps = {
  fetch: typeof fetch;
  /** The pause before a synthesis is retried; `setTimeout` (on the sandbox's whitelist) when absent, nothing in the tests. */
  wait?: (ms: number) => Promise<void>;
};

export const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4/accounts';

/**
 * Cloudflare's MeloTTS answered 500 "Internal server error" to one
 * request in four during the live verification of 2026-09-07, and the
 * same request succeeded a moment later. A segment that fails while it is
 * the one being played leaves Read Aloud in its error state until Retry,
 * so a synthesis is retried once, after this pause, on any 5xx — never on
 * a 4xx, which would answer the same again.
 */
export const RETRY_DELAY_MS = 500;

/** A speaker of an Aura model: the id the API takes, and how Deepgram describes it, which the label and the locale come from. */
type Speaker = readonly [id: string, gender: 'female' | 'male', locale: string];

export interface CloudflareModel {
  /** The model id, as the run route and the model list name it. */
  id: string;
  /** The model's name in front of every voice's: "Aura-2 Luna (female)". */
  label: string;
  /** Which payload and reply the model has. */
  family: 'aura' | 'melotts';
  /** The voices, in the order they are listed. */
  voices: readonly VoiceInfo[];
}

const speakers = (label: string, list: readonly Speaker[]): VoiceInfo[] =>
  list.map(([id, gender, locale]) => ({ id, label: `${label} ${id[0].toUpperCase()}${id.slice(1)} (${gender})`, locale }));

// Accents from Deepgram's own voice tables (developers.deepgram.com/docs/tts-models)
const US = 'en-US';
const GB = 'en-GB';

const AURA_1: readonly Speaker[] = [
  ['angus', 'male', 'en-IE'],
  ['asteria', 'female', US],
  ['arcas', 'male', US],
  ['orion', 'male', US],
  ['orpheus', 'male', US],
  ['athena', 'female', GB],
  ['luna', 'female', US],
  ['zeus', 'male', US],
  ['perseus', 'male', US],
  ['helios', 'male', GB],
  ['hera', 'female', US],
  ['stella', 'female', US],
];

const AURA_2_EN: readonly Speaker[] = [
  ['amalthea', 'female', 'en-PH'],
  ['andromeda', 'female', US],
  ['apollo', 'male', US],
  ['arcas', 'male', US],
  ['aries', 'male', US],
  ['asteria', 'female', US],
  ['athena', 'female', US],
  ['atlas', 'male', US],
  ['aurora', 'female', US],
  ['callista', 'female', US],
  ['cora', 'female', US],
  ['cordelia', 'female', US],
  ['delia', 'female', US],
  ['draco', 'male', GB],
  ['electra', 'female', US],
  ['harmonia', 'female', US],
  ['helena', 'female', US],
  ['hera', 'female', US],
  ['hermes', 'male', US],
  ['hyperion', 'male', 'en-AU'],
  ['iris', 'female', US],
  ['janus', 'female', US],
  ['juno', 'female', US],
  ['jupiter', 'male', US],
  ['luna', 'female', US],
  ['mars', 'male', US],
  ['minerva', 'female', US],
  ['neptune', 'male', US],
  ['odysseus', 'male', US],
  ['ophelia', 'female', US],
  ['orion', 'male', US],
  ['orpheus', 'male', US],
  ['pandora', 'female', GB],
  ['phoebe', 'female', US],
  ['pluto', 'male', US],
  ['saturn', 'male', US],
  ['thalia', 'female', US],
  ['theia', 'female', 'en-AU'],
  ['vesta', 'female', US],
  ['zeus', 'male', US],
];

const AURA_2_ES: readonly Speaker[] = [
  ['sirio', 'male', 'es-MX'],
  ['nestor', 'male', 'es-ES'],
  ['carina', 'female', 'es-ES'],
  ['celeste', 'female', 'es-CO'],
  ['alvaro', 'male', 'es-ES'],
  ['diana', 'female', 'es-ES'],
  ['aquila', 'male', 'es-419'],
  ['selena', 'female', 'es-419'],
  ['estrella', 'female', 'es-MX'],
  ['javier', 'male', 'es-MX'],
];

/** MeloTTS: one voice per language, the `lang` value as the speaker id. */
const MELOTTS: readonly VoiceInfo[] = [
  { id: 'en', label: 'MeloTTS English', locale: 'en-US' },
  { id: 'zh', label: 'MeloTTS Chinese', locale: 'zh-CN' },
  { id: 'ja', label: 'MeloTTS Japanese', locale: 'ja-JP' },
  { id: 'ko', label: 'MeloTTS Korean', locale: 'ko-KR' },
];

/**
 * The models the plugin knows the payload of, MeloTTS first: the pane's
 * synthesis probe takes the first voice listed, and a MeloTTS "Hi" costs a
 * tenth of an Aura one. The player sorts by label anyway.
 */
export const CLOUDFLARE_MODELS: readonly CloudflareModel[] = [
  { id: '@cf/myshell-ai/melotts', label: 'MeloTTS', family: 'melotts', voices: MELOTTS },
  { id: '@cf/deepgram/aura-2-en', label: 'Aura-2', family: 'aura', voices: speakers('Aura-2', AURA_2_EN) },
  { id: '@cf/deepgram/aura-2-es', label: 'Aura-2', family: 'aura', voices: speakers('Aura-2', AURA_2_ES) },
  { id: '@cf/deepgram/aura-1', label: 'Aura-1', family: 'aura', voices: speakers('Aura-1', AURA_1) },
];

/** The voice id the catalog publishes: the model id, a slash, the speaker (or MeloTTS's language). */
const voiceId = (model: CloudflareModel, speaker: string): string => `${model.id}/${speaker}`;

/** Every voice of every known model, as the catalog lists them. */
export function cloudflareVoices(models: readonly CloudflareModel[] = CLOUDFLARE_MODELS): VoiceInfo[] {
  return models.flatMap((model) => model.voices.map((voice) => ({ ...voice, id: voiceId(model, voice.id) })));
}

/** A published voice id back into its model and speaker; null for an id no known model has. */
export function decodeCloudflareVoice(id: string): { model: CloudflareModel; speaker: string } | null {
  for (const model of CLOUDFLARE_MODELS) {
    if (!id.startsWith(model.id + '/')) continue;
    const speaker = id.slice(model.id.length + 1);
    if (model.voices.some((voice) => voice.id === speaker)) return { model, speaker };
  }
  return null;
}

/** What a refusal says, from Cloudflare's envelope: `errors[0].message`; empty for any other body. */
export function cloudflareReason(body: string): string {
  try {
    const errors = (JSON.parse(body) as { errors?: unknown } | null)?.errors;
    const first = (Array.isArray(errors) ? errors[0] : null) as { message?: unknown } | null;
    return typeof first?.message === 'string' ? first.message.trim().slice(0, 300) : '';
  } catch {
    return '';
  }
}

/** The base64 audio of a MeloTTS reply, `result.audio`; null when the reply carries none. */
export function cloudflareAudioData(reply: unknown): string | null {
  const result = (reply as { result?: { audio?: unknown } | null } | null)?.result;
  const data = result?.audio;
  return typeof data === 'string' && data ? data : null;
}

/** Base64 to a Blob, byte for byte; throws on text that is not base64. `atob` is on the plugin sandbox's whitelist. */
function decodeBase64(data: string, type: string): Blob {
  const binary = atob(data.replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

/**
 * The typed error for a refused request. Cloudflare answers a wrong token
 * and a wrong account id alike, 401 "Authentication error", so the auth
 * message names both; 429 is rate limiting unless the body speaks of an
 * allocation used up, which the Free plan answers once the day's Neurons
 * are spent (pricing page: "further operations will fail with an error");
 * 402 is the same thing said by a paid account. Everything else quotes
 * the server's reason after the status — a wrong speaker's refusal names
 * the right ones.
 */
async function refusal(response: Response, what: string): Promise<SynthesisError> {
  const body = await response.text().catch(() => '');
  const reason = cloudflareReason(body);
  const quoted = reason ? ` — ${reason}` : '';
  const { status } = response;
  if (status === 401 || status === 403) {
    return new SynthesisError('auth', `${what}: Cloudflare rejected the API token or the account ID (${status})${quoted}`);
  }
  if (status === 402 || (status === 429 && /alloc|quota|exceed|limit reached/i.test(reason))) {
    return new SynthesisError('quota', `${what}: Cloudflare refused to synthesize (${status})${quoted}`);
  }
  if (status === 429) return new SynthesisError('rate-limit', `${what}: rate limited (429)${quoted}`);
  return new SynthesisError('unknown', `${what}: HTTP ${status}${quoted}`);
}

export function createCloudflareProvider(cfg: CloudflareConfig, deps: CloudflareDeps): TTSProvider {
  const accountId = () => cfg.accountId.trim();
  const apiToken = () => cfg.apiToken.trim();
  const base = () => `${CLOUDFLARE_API}/${encodeURIComponent(accountId())}/ai`;
  const headers = (): Record<string, string> => ({ Authorization: `Bearer ${apiToken()}` });

  /** Both values before any request: the pane's line says which is missing. */
  function requireCredentials(): void {
    if (!apiToken()) throw new SynthesisError('no-key', 'Cloudflare API token is not set');
    if (!accountId()) throw new SynthesisError('unknown', 'Cloudflare account ID is not set');
  }

  async function request(path: string, init: RequestInit, what: string): Promise<Response> {
    try {
      return await deps.fetch(`${base()}${path}`, init);
    } catch (e) {
      throw new SynthesisError('network', `${what}: cannot reach api.cloudflare.com (${e})`);
    }
  }

  /**
   * One synthesis on the model's own route. Aura's reply is the audio;
   * MeloTTS's is JSON around base64, a WAV. A reply without audio — the
   * envelope with an empty result — is an error here, at Test connection
   * and while reading alike, never a silent empty segment. The `note`
   * names the model in the debug output (read-aloud/remote-interface.ts).
   */
  async function speak(text: string, voice: string, signal?: AbortSignal): Promise<SynthesisResult> {
    requireCredentials();
    const decoded = decodeCloudflareVoice(voice);
    if (!decoded) throw new SynthesisError('unknown', `Unknown Cloudflare voice: ${voice}`);
    const { model, speaker } = decoded;
    const what = `Cloudflare ${model.id}`;
    const body = model.family === 'aura' ? { text, speaker } : { prompt: text, lang: speaker };
    const post = () =>
      request(`/run/${model.id}`, { method: 'POST', headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal }, what);
    let response = await post();
    let retried = '';
    if (response.status >= 500) {
      retried = ` after a retry of HTTP ${response.status}`;
      await (deps.wait ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms))))(RETRY_DELAY_MS);
      response = await post();
    }
    if (!response.ok) throw await refusal(response, what);
    // The debug line names the model, and a retry when there was one: the proof the route ran, and that the retry does
    const note = `audio from ${model.id}${retried}`;
    if (model.family === 'aura') return { audio: new Blob([await response.arrayBuffer()], { type: 'audio/mpeg' }), note };
    let reply: unknown;
    try {
      reply = await response.json();
    } catch {
      throw new SynthesisError('unknown', `${what}: the reply was not JSON`);
    }
    const data = cloudflareAudioData(reply);
    if (!data) throw new SynthesisError('unknown', `${what}: the reply carried no audio`);
    try {
      return { audio: decodeBase64(data, 'audio/wav'), note };
    } catch (e) {
      throw new SynthesisError('unknown', `${what}: the audio was not valid base64 (${e})`);
    }
  }

  const provider: TTSProvider = {
    id: 'cloudflare',
    // Neither model family reports timing of any kind (measured 2026-09-07); never estimated
    capabilities: { wordTimestamps: false },

    /**
     * The account's text-to-speech models, then the voices of those the
     * plugin knows the payload of. The list is an authenticated request,
     * so it is also the connection check: a wrong token or account id
     * fails here, before anything is spent. A model Cloudflare has retired
     * is simply not listed, and its voices go with it.
     */
    async listVoices(options?: ListVoicesOptions): Promise<VoiceInfo[]> {
      requireCredentials();
      const what = 'Cloudflare model list';
      const response = await request('/models/search?task=Text-to-Speech&per_page=100', { headers: headers(), signal: options?.signal }, what);
      if (!response.ok) throw await refusal(response, what);
      let reply: unknown;
      try {
        reply = await response.json();
      } catch {
        throw new SynthesisError('unknown', `${what}: the reply was not JSON`);
      }
      const result = (reply as { result?: unknown } | null)?.result;
      if (!Array.isArray(result)) throw new SynthesisError('unknown', `${what}: the reply was not a model list`);
      const listed = new Set(result.map((model) => (model as { name?: unknown } | null)?.name).filter((name): name is string => typeof name === 'string'));
      return cloudflareVoices(CLOUDFLARE_MODELS.filter((model) => listed.has(model.id)));
    },

    /** Two letters on the voice's own route, discarded: proves the account can spend and the model answers audio. */
    async checkSynthesis(voice: string): Promise<void> {
      await speak('Hi', voice);
    },

    synthesize(text: string, o: SynthesisOptions): Promise<SynthesisResult> {
      return speak(text, o.voice, o.signal);
    },
  };
  return provider;
}
