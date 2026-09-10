import { alignWords, describeAlignment, type TimedWord } from '../align';
import { SynthesisError } from './errors';
import { isSpeakable } from './speechify';
import { MULTILINGUAL, type ListVoicesOptions, type SynthesisOptions, type SynthesisResult, type TTSProvider, type VoiceInfo } from './types';

/**
 * Fish Audio's cloud API (issue #89): S2.1 Pro over the route that returns
 * word timings, behind one key. Measured against the live API on
 * 2026-09-10 (notes/NOTES_2026-09-10.md):
 * - a voice is a model of the community library, named by a 32-hex id; the
 *   library holds more than 11,000 of them and shows 1,000 per query, so the
 *   plugin lists the account's own models, the ids the user pasted (a link
 *   or the id itself), and one entry for the model's default voice;
 * - `POST /v1/tts/stream/with-timestamp` answers an event stream: one JSON
 *   per `data:` line with a base64 chunk of the audio and the latest
 *   alignment snapshot of a text chunk — words and digits in the text's own
 *   spelling, one segment per Chinese character, punctuation gone — to be
 *   replaced per `chunk_seq`, not appended, and moved by the chunk's offset;
 *   the words are aligned to the segment text by their text (core/align.ts);
 * - the free model needs no API credit; the paid one on an empty credit is
 *   a 402 with `x-fish-error-code: insufficient_balance`, the quota shape;
 *   a wrong key is 401 on every route; a wrong id is 400 "Reference not
 *   found";
 * - eight requests at once answered 200, so nothing queues; a 429 waits
 *   what Retry-After says and asks again.
 */
export type FishConfig = {
  apiKey: string;
  /** Every request goes to the free model; off, to the paid one. */
  freeOnly: boolean;
  /** What the user pasted: ids or links, any separators. */
  voices: string;
};

export type FishDeps = {
  fetch: typeof fetch;
  /** The pause before a retry; `setTimeout` (on the sandbox's whitelist) when absent, nothing in the tests. */
  wait?: (ms: number) => Promise<void>;
};

export const FISH_API = 'https://api.fish.audio';
/** The same model either way: the free one wants no API credit, the paid one bills per UTF-8 byte (docs, 2026-09-10). */
export const MODEL_FREE = 's2.1-pro-free';
export const MODEL_PAID = 's2.1-pro';
/** Half the bytes of the 128 kbps default, at the same latency (measured 2026-09-10). */
export const MP3_BITRATE = 64;
/** The most the list route gives per page (422 above it). */
export const PAGE_SIZE = 100;
const MAX_PAGES = 20;
/** The id of the built-in entry that sends no reference: the model's own voice. */
export const DEFAULT_VOICE = 'default';
export const DEFAULT_VOICE_LABEL = 'Default';
/** The pause before a 5xx is asked again, as Cloudflare's and Speechify's. */
export const RETRY_DELAY_MS = 500;
/** How many times a 429 is waited out before it surfaces. */
export const RATE_LIMIT_RETRIES = 3;
const RETRY_AFTER_DEFAULT_MS = 1000;
const RETRY_AFTER_MAX_MS = 5000;

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const MODEL_ID = /[0-9a-f]{32}/gi;
const ONE_MODEL_ID = /^[0-9a-f]{32}$/i;

/** Every 32-hex id in what was pasted — ids, links such as `https://fish.audio/m/<id>/`, any separators — once each, lowercased. */
export function fishVoiceIds(text: string): string[] {
  return [...new Set((text.match(MODEL_ID) ?? []).map((id) => id.toLowerCase()))];
}

const LANGUAGE = /^[a-z]{2,3}$/i;

/** The locale a voice is filed under: its one language (a two-letter code, BCP-47 as it is), or the multilingual group for several or none. */
export function localeOfLanguages(languages: unknown): string {
  if (!Array.isArray(languages)) return MULTILINGUAL;
  const codes = languages.filter((code): code is string => typeof code === 'string' && LANGUAGE.test(code.trim()));
  return codes.length === 1 ? codes[0].trim().toLowerCase() : MULTILINGUAL;
}

/** A model as `GET /model` and `GET /model/{id}` describe it; the fields the plugin reads. */
export type FishModel = { _id?: unknown; title?: unknown; languages?: unknown };

/** The voice a model is listed as: the locale in front of the id, since synthesis needs the id and the player files by the locale. */
export function fishVoice(model: FishModel): VoiceInfo | null {
  const id = str(model._id);
  if (!id) return null;
  const locale = localeOfLanguages(model.languages);
  return { id: `${locale}/${id}`, label: str(model.title) || id, locale };
}

const LOCALE = /^(?:mul|[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)$/;

/** A published voice id back into its locale and model id; null for anything the plugin did not publish. */
export function decodeFishVoice(encoded: string): { locale: string; id: string } | null {
  const at = encoded.indexOf('/');
  if (at < 1) return null;
  const locale = encoded.slice(0, at);
  const id = encoded.slice(at + 1);
  if (!LOCALE.test(locale)) return null;
  if (id !== DEFAULT_VOICE && !ONE_MODEL_ID.test(id)) return null;
  return { locale, id };
}

/** One event of the timestamp route, as its `data:` line decodes; the fields the plugin reads. */
export type FishEvent = { audio_base64?: unknown; content?: unknown; chunk_seq?: unknown; chunk_audio_offset_sec?: unknown; alignment?: unknown };

/** The JSON of every `data:` line of an event stream; comments, other fields and lines that are not JSON are skipped. */
export function parseEventStream(body: string): FishEvent[] {
  const events: FishEvent[] = [];
  for (const line of body.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    try {
      const parsed: unknown = JSON.parse(line.slice(5).trim());
      if (parsed && typeof parsed === 'object') events.push(parsed as FishEvent);
    } catch {
      // Not JSON: skipped
    }
  }
  return events;
}

/** Base64 to bytes, byte for byte; throws on text that is not base64. `atob` is on the plugin sandbox's whitelist. */
function decodeBase64(data: string): Uint8Array<ArrayBuffer> {
  const binary = atob(data.replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function concat(chunks: readonly Uint8Array<ArrayBuffer>[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

export type MergedStream = {
  audio: Uint8Array<ArrayBuffer>;
  /** On the whole audio's timeline: each chunk's snapshot moved by its offset. */
  words: TimedWord[];
  /** How many text chunks the route cut the text into. */
  chunks: number;
};

/**
 * The stream as one audio and one word list: the audio chunks concatenated
 * in order; per text chunk the latest snapshot — a later non-null
 * `alignment` replaces, a null one changes nothing — with its segments
 * moved by `chunk_audio_offset_sec`. Throws on audio that is not base64.
 */
export function mergeEvents(events: FishEvent[]): MergedStream {
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  const snapshots = new Map<number, { offset: number; segments: unknown[] }>();
  const seen = new Set<number>();
  for (const event of events) {
    if (typeof event.audio_base64 === 'string' && event.audio_base64) chunks.push(decodeBase64(event.audio_base64));
    const seq = typeof event.chunk_seq === 'number' && Number.isFinite(event.chunk_seq) ? event.chunk_seq : 0;
    seen.add(seq);
    const alignment = event.alignment as { segments?: unknown } | null | undefined;
    if (!alignment || typeof alignment !== 'object' || !Array.isArray(alignment.segments)) continue;
    const offset = typeof event.chunk_audio_offset_sec === 'number' && Number.isFinite(event.chunk_audio_offset_sec) ? event.chunk_audio_offset_sec : 0;
    snapshots.set(seq, { offset, segments: alignment.segments });
  }
  const words: TimedWord[] = [];
  for (const seq of [...snapshots.keys()].sort((a, b) => a - b)) {
    const { offset, segments } = snapshots.get(seq)!;
    for (const segment of segments) {
      const { text, start, end } = (segment ?? {}) as { text?: unknown; start?: unknown; end?: unknown };
      if (typeof text !== 'string' || !text || typeof start !== 'number' || typeof end !== 'number') continue;
      if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) continue;
      words.push({ text, start: start + offset, end: end + offset });
    }
  }
  return { audio: concat(chunks), words, chunks: seen.size };
}

/** What a refusal says, from Fish's `{ status, message }`; empty for any other body. Whitespace collapsed. */
export function fishReason(body: string): string {
  try {
    const parsed = JSON.parse(body) as { message?: unknown } | null;
    return str(parsed?.message).replace(/\s+/g, ' ').slice(0, 300);
  } catch {
    return '';
  }
}

/** Whether a refusal is the API credit: a 402, or the gateway's header on any status (measured 2026-09-10). */
function isQuota(status: number, headers: Headers): boolean {
  return status === 402 || headers.get('x-fish-error-code') === 'insufficient_balance';
}

function refusal(response: Response, body: string, what: string): SynthesisError {
  const status = response.status;
  // The list's 401 is plain text ("No permission -- see authorization schemes"), the rest is JSON
  const message = fishReason(body) || body.trim().replace(/\s+/g, ' ').slice(0, 200);
  const quoted = message ? ` — ${message}` : '';
  if (isQuota(status, response.headers)) return new SynthesisError('quota', `${what}: Fish Audio refused the request (${status})${quoted}`);
  if (status === 401 || status === 403) return new SynthesisError('auth', `${what}: Fish Audio rejected the API key (${status})${quoted}`);
  if (status === 429) return new SynthesisError('rate-limit', `${what}: rate limited (429)${quoted}`);
  return new SynthesisError('unknown', `${what}: HTTP ${status}${quoted}`);
}

/** How long a 429 asks to wait: its Retry-After in seconds, a second without one, five at most. */
function retryAfterMs(response: Response): number {
  const seconds = Number(response.headers.get('Retry-After') ?? '');
  if (!Number.isFinite(seconds) || seconds <= 0) return RETRY_AFTER_DEFAULT_MS;
  return Math.min(RETRY_AFTER_MAX_MS, Math.round(seconds * 1000));
}

export function createFishProvider(cfg: FishConfig, deps: FishDeps): TTSProvider {
  const apiKey = () => cfg.apiKey.trim();
  const model = () => (cfg.freeOnly ? MODEL_FREE : MODEL_PAID);
  const pause = deps.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const headers = (extra: Record<string, string> = {}): Record<string, string> => ({ Authorization: `Bearer ${apiKey()}`, ...extra });

  function requireKey(): void {
    if (!apiKey()) throw new SynthesisError('no-key', 'Fish Audio API key is not set');
  }

  async function request(path: string, init: RequestInit, what: string): Promise<Response> {
    try {
      return await deps.fetch(`${FISH_API}${path}`, init);
    } catch (e) {
      throw new SynthesisError('network', `${what}: cannot reach api.fish.audio (${e})`);
    }
  }

  /**
   * One request with the two retries: a 429 waits what Retry-After says
   * and asks again, up to RATE_LIMIT_RETRIES times, unless it is the
   * credit; a 5xx is asked once more after RETRY_DELAY_MS. The note says
   * what happened, for the debug line.
   */
  async function exchange(path: string, init: RequestInit, what: string): Promise<{ response: Response; note: string }> {
    let waits = 0;
    let retried = '';
    for (;;) {
      const response = await request(path, init, what);
      if (response.ok) {
        const waited = waits ? ` after ${waits} rate-limit wait${waits === 1 ? '' : 's'}` : '';
        return { response, note: `${retried}${waited}` };
      }
      const body = await response.text().catch(() => '');
      if (response.status === 429 && waits < RATE_LIMIT_RETRIES && !isQuota(429, response.headers)) {
        waits++;
        await pause(retryAfterMs(response));
        continue;
      }
      if (response.status >= 500 && !retried) {
        retried = ` after a retry of HTTP ${response.status}`;
        await pause(RETRY_DELAY_MS);
        continue;
      }
      throw refusal(response, body, what);
    }
  }

  async function readJSON<T>(response: Response, what: string): Promise<T> {
    try {
      return (await response.json()) as T;
    } catch {
      throw new SynthesisError('unknown', `${what}: the reply was not JSON`);
    }
  }

  /** Every page of the account's own models. An authenticated request, so a wrong key fails here. */
  async function ownVoices(signal?: AbortSignal): Promise<VoiceInfo[]> {
    const what = 'Fish Audio voice list';
    const out: VoiceInfo[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const { response } = await exchange(`/model?self=true&page_size=${PAGE_SIZE}&page_number=${page}`, { headers: headers(), signal }, what);
      const reply = await readJSON<{ items?: unknown; has_more?: unknown }>(response, what);
      if (!Array.isArray(reply?.items)) throw new SynthesisError('unknown', `${what}: the reply was not a model list`);
      for (const item of reply.items) {
        const voice = fishVoice(item as FishModel);
        if (voice) out.push(voice);
      }
      if (!reply.has_more) break;
    }
    return out;
  }

  /** A pasted id by the public model route: its title and language, or, for an id the library does not know, the id marked as not found. */
  async function pastedVoice(id: string, signal?: AbortSignal): Promise<VoiceInfo> {
    const what = `Fish Audio voice ${id}`;
    const response = await request(`/model/${id}`, { headers: headers(), signal }, what);
    if (response.status === 404) return { id: `${MULTILINGUAL}/${id}`, label: `${id} (not found)`, locale: MULTILINGUAL };
    if (!response.ok) throw refusal(response, await response.text().catch(() => ''), what);
    return fishVoice(await readJSON<FishModel>(response, what)) ?? { id: `${MULTILINGUAL}/${id}`, label: id, locale: MULTILINGUAL };
  }

  async function speak(text: string, voice: string, signal?: AbortSignal): Promise<SynthesisResult> {
    requireKey();
    const decoded = decodeFishVoice(voice);
    if (!decoded) throw new SynthesisError('unknown', `Unknown Fish Audio voice: ${voice}`);
    // Nothing to say: no request, and the empty audio plays as a pause
    if (!isSpeakable(text)) return { audio: new Blob([], { type: 'audio/mpeg' }), note: 'no speakable text' };
    const what = `Fish Audio ${model()}`;
    const body = { text, format: 'mp3', mp3_bitrate: MP3_BITRATE, latency: 'normal', ...(decoded.id === DEFAULT_VOICE ? {} : { reference_id: decoded.id }) };
    const init: RequestInit = { method: 'POST', headers: headers({ 'Content-Type': 'application/json', model: model() }), body: JSON.stringify(body), signal };
    const { response, note } = await exchange('/v1/tts/stream/with-timestamp', init, what);
    const events = parseEventStream(await response.text());
    let merged: MergedStream;
    try {
      merged = mergeEvents(events);
    } catch (e) {
      throw new SynthesisError('decode-failed', `${what}: the audio was not valid base64 (${e})`);
    }
    if (!merged.audio.length) throw new SynthesisError('unknown', `${what}: the stream carried no audio`);
    const audio = new Blob([merged.audio], { type: 'audio/mpeg' });
    const chunks = merged.chunks > 1 ? `, ${merged.chunks} chunks` : '';
    if (!merged.words.length) return { audio, note: `${model()}${chunks}${note}: no word timings in the stream` };
    const aligned = alignWords(merged.words, text);
    if (!aligned.timestamps.length) return { audio, note: `${model()}${chunks}${note}: none of the ${merged.words.length} words the server returned is in the text` };
    const detail = describeAlignment(aligned);
    return { audio, timestamps: aligned.timestamps, note: `${model()}${chunks}${detail ? `, ${detail}` : ''}${note}` };
  }

  const provider: TTSProvider = {
    id: 'fish',
    // Every reply of the timestamp route carries the words' seconds (measured 2026-09-10); never estimated
    capabilities: { wordTimestamps: true },
    /** The account's own voices, then the pasted ids the account does not own, then the default voice. */
    async listVoices(options?: ListVoicesOptions): Promise<VoiceInfo[]> {
      requireKey();
      const own = await ownVoices(options?.signal);
      const owned = new Set(own.map((voice) => decodeFishVoice(voice.id)?.id));
      const pasted = fishVoiceIds(cfg.voices).filter((id) => !owned.has(id));
      const resolved = await Promise.all(pasted.map((id) => pastedVoice(id, options?.signal)));
      return [...own, ...resolved, { id: `${MULTILINGUAL}/${DEFAULT_VOICE}`, label: DEFAULT_VOICE_LABEL, locale: MULTILINGUAL }];
    },
    /** The cheapest authenticated request there is: one entry of the own-voices list. */
    async checkConnection(): Promise<void> {
      requireKey();
      const what = 'Fish Audio key check';
      const response = await request('/model?self=true&page_size=1', { headers: headers() }, what);
      if (!response.ok) throw refusal(response, await response.text().catch(() => ''), what);
    },
    /** Two letters on the voice, discarded: proves the model answers — and, with the free switch off, that the credit is there. */
    async checkSynthesis(voice: string): Promise<void> {
      await speak('Hi', voice);
    },
    synthesize(text: string, o: SynthesisOptions): Promise<SynthesisResult> {
      return speak(text, o.voice, o.signal);
    },
  };
  return provider;
}
