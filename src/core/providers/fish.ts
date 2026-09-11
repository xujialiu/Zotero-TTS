import { alignWords, describeAlignment, type TimedWord } from '../align';
import { withTimeout } from '../timeout';
import { SynthesisError } from './errors';
import { isSpeakable } from './speechify';
import {
  MULTILINGUAL,
  type ListVoicesOptions,
  type SynthesisOptions,
  type SynthesisResult,
  type TTSProvider,
  type VoiceInfo,
  type VoiceListNotice,
} from './types';

/**
 * Fish Audio's cloud API (issue #89): S2.1 Pro over the route that returns
 * word timings, behind one key. Measured against the live API on
 * 2026-09-10 (notes/NOTES_2026-09-10.md):
 * - a voice is a model of the official library, an account's own model, or a
 *   model id the user supplied; the three sources are independently optional,
 *   while the model's default voice is always available;
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
  /** Include the Fish Official account's voices; omitted means enabled for compatibility. */
  includeOfficial?: boolean;
  /** Include the account's own voices; omitted means enabled for compatibility. */
  includeOwn?: boolean;
  /** Include models supplied in the Voices field; omitted means enabled for compatibility. */
  includeManual?: boolean;
};

export type FishDeps = {
  fetch: typeof fetch;
  /** The pause before a retry; `setTimeout` (on the sandbox's whitelist) when absent, nothing in the tests. */
  wait?: (ms: number) => Promise<void>;
  /** An in-memory session cache; the factory supplies one shared by its fetch implementation. */
  cache?: FishVoiceCache;
  /** Override the listing bound in tests; production uses the ten-second bound below. */
  timeoutMs?: number;
  /** Obtain a controller from the chrome window for one shared listing load; absent in the plugin sandbox. */
  newAbortController?: () => AbortController | null;
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
/** The stable Fish Official account whose models are automatically offered. */
export const OFFICIAL_AUTHOR_ID = 'd8b0991f96b44e489422ca2ddf0bd31d';
/** A complete listing, including response-body parsing, must yield to the catalog's 15-second bound. */
export const FISH_VOICE_LIST_TIMEOUT_MS = 11_000;
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

type FishListSnapshot = { voices: VoiceInfo[]; limited: boolean };
type CacheSlot<T> = {
  value?: T;
  generation: number;
  inFlight?: { generation: number; promise: Promise<T>; abort?: () => void };
  /** The last failed refresh, retained so a new provider can explain stale data. */
  lastError?: unknown;
};

export type FishVoiceCacheStats = {
  /** Number of calls served by an existing value or in-flight request. */
  cacheHits: number;
  /** Number of new list or pasted-model requests started. */
  loads: number;
  /** Number of accounts represented in this cache, without exposing their keys. */
  cachedAccounts: number;
};

/** Session-only Fish voice data. It deliberately contains no API keys outside map keys held in memory. */
export class FishVoiceCache {
  readonly official = new Map<string, CacheSlot<FishListSnapshot>>();
  readonly own = new Map<string, CacheSlot<FishListSnapshot>>();
  readonly pasted = new Map<string, Map<string, VoiceInfo>>();
  readonly pastedInFlight = new Map<string, Map<string, Promise<VoiceInfo>>>();
  private readonly accounts = new Set<string>();
  private _cacheHits = 0;
  private _loads = 0;

  touchAccount(account: string): void {
    this.accounts.add(account);
  }

  hit(): void {
    this._cacheHits++;
  }

  load(): void {
    this._loads++;
  }

  stats(): FishVoiceCacheStats {
    return { cacheHits: this._cacheHits, loads: this._loads, cachedAccounts: this.accounts.size };
  }
}

/** Every 32-hex id in what was pasted — ids, links such as `https://fish.audio/m/<id>/`, any separators — once each, lowercased. */
export function fishVoiceIds(text: string): string[] {
  return [...new Set((text.match(MODEL_ID) ?? []).map((id) => id.toLowerCase()))];
}

const LANGUAGE = /^[a-z]{2,3}$/i;

type EnglishRegion = { locale: string; labels: readonly RegExp[] };

/** Regions that Fish Audio publishes explicitly in a model's labels or tags. */
const ENGLISH_REGIONS: readonly EnglishRegion[] = [
  {
    locale: 'en-US',
    labels: [
      /\ben[-_](?:us|usa)\b/i,
      /\b(?:american|united states)(?:\s+english)?\b/i,
      /\b(?:u\.?\s*s\.?|us)[ -]?(?:male|female|english|voice|narrator|storyteller|companion)\b/i,
    ],
  },
  {
    locale: 'en-GB',
    labels: [
      /\ben[-_](?:gb|uk)\b/i,
      /\b(?:british|united kingdom)(?:\s+english)?\b/i,
      /\b(?:u\.?\s*k\.?|uk)[ -]?(?:male|female|english|voice|narrator|storyteller|companion)\b/i,
    ],
  },
  {
    locale: 'en-CA',
    labels: [/\ben[-_]ca\b/i, /\bcanadian(?:\s+english)?\b/i, /\bcanada(?:\s+english)?\b/i],
  },
  {
    locale: 'en-AU',
    labels: [/\ben[-_]au\b/i, /\baustralian(?:\s+english)?\b/i, /\baustralia(?:n)?(?:\s+english)?\b/i],
  },
  {
    locale: 'en-IN',
    labels: [/\ben[-_]in\b/i, /\bindian(?:\s+english)?\b/i, /\bindia(?:n)?(?:\s+english)?\b/i],
  },
  {
    locale: 'en-NG',
    labels: [/\ben[-_]ng\b/i, /\bnigerian(?:\s+english)?\b/i, /\bnigeria(?:n)?(?:\s+english)?\b/i],
  },
  {
    locale: 'en-ZA',
    labels: [/\ben[-_]za\b/i, /\bsouth african(?:\s+english)?\b/i, /\bsouth africa(?:n)?(?:\s+english)?\b/i],
  },
  {
    locale: 'en-NZ',
    labels: [/\ben[-_]nz\b/i, /\bnew zealand(?:\s+english)?\b/i],
  },
  {
    locale: 'en-IE',
    labels: [/\ben[-_]ie\b/i, /\birish(?:\s+english)?\b/i, /\bireland(?:\s+english)?\b/i],
  },
  {
    locale: 'en-SG',
    labels: [/\ben[-_]sg\b/i, /\bsingaporean(?:\s+english)?\b/i, /\bsingapore(?:\s+english)?\b/i],
  },
];

const ENGLISH_REGION_CODES: ReadonlyMap<string, string> = new Map([
  ['us', 'en-US'],
  ['usa', 'en-US'],
  ['gb', 'en-GB'],
  ['uk', 'en-GB'],
  ['ca', 'en-CA'],
  ['au', 'en-AU'],
  ['in', 'en-IN'],
  ['ng', 'en-NG'],
  ['za', 'en-ZA'],
  ['nz', 'en-NZ'],
  ['ie', 'en-IE'],
  ['sg', 'en-SG'],
  ['jm', 'en-JM'],
  ['ke', 'en-KE'],
  ['ph', 'en-PH'],
  ['tt', 'en-TT'],
]);

function englishRegionFromText(values: readonly string[]): string | undefined {
  const matches = new Set<string>();
  for (const value of values) {
    const tagRegion = /^en[-_]/i.test(value.trim()) ? englishRegionCode(value) : undefined;
    if (tagRegion) matches.add(tagRegion);
    for (const region of ENGLISH_REGIONS) {
      if (region.labels.some((label) => label.test(value))) matches.add(region.locale);
    }
  }
  return matches.size === 1 ? [...matches][0] : undefined;
}

function englishRegionCode(value: string): string | undefined {
  const code = value.trim().replace(/^en[-_]/i, '').toLowerCase();
  return ENGLISH_REGION_CODES.get(code);
}

/** The locale a voice is filed under: its one language (a two-letter code, BCP-47 as it is), or the multilingual group for several or none. */
export function localeOfLanguages(languages: unknown): string {
  if (!Array.isArray(languages)) return MULTILINGUAL;
  const codes = languages.filter((code): code is string => typeof code === 'string' && LANGUAGE.test(code.trim()));
  return codes.length === 1 ? codes[0].trim().toLowerCase() : MULTILINGUAL;
}

/** A model as `GET /model` and `GET /model/{id}` describe it; the fields the plugin reads. */
export type FishModel = {
  _id?: unknown;
  title?: unknown;
  languages?: unknown;
  tags?: unknown;
  description?: unknown;
  type?: unknown;
  state?: unknown;
  dmca_taken_down?: unknown;
};

/** The voice a model is listed as: its grouping locale may include a published English region, while the id keeps the stable base-language prefix. */
export function fishVoice(model: FishModel): VoiceInfo | null {
  const id = str(model._id);
  if (!id) return null;
  // Keep the old ID prefix even for previously unrecognized language tags;
  // changing the display group must not invalidate a saved voice or favorite.
  const languageLocale = localeOfLanguages(model.languages);
  const languages = Array.isArray(model.languages) ? model.languages : [];
  const explicitEnglish = languages.length === 1 && typeof languages[0] === 'string' && /^en[-_]/i.test(languages[0].trim())
    ? englishRegionCode(languages[0])
    : undefined;
  const tags = Array.isArray(model.tags) ? model.tags.filter((tag): tag is string => typeof tag === 'string') : [];
  const locale = explicitEnglish ?? (languageLocale === 'en' ? englishRegionFromText([str(model.title), ...tags]) : undefined) ?? languageLocale;
  return { id: `${languageLocale}/${id}`, label: str(model.title) || id, locale };
}

/** The official list can contain service entries or models withdrawn from the library; only explicit incompatibilities are filtered. */
function publicFishVoice(model: FishModel): VoiceInfo | null {
  const id = str(model._id);
  if (!ONE_MODEL_ID.test(id)) return null;
  if (typeof model.type === 'string' && model.type && model.type !== 'tts') return null;
  if (typeof model.state === 'string' && model.state && model.state !== 'trained') return null;
  if (model.dmca_taken_down === true) return null;
  return fishVoice(model);
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
  const headers = (extra: Record<string, string> = {}, key = apiKey()): Record<string, string> => ({ Authorization: `Bearer ${key}`, ...extra });

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
  async function exchange(path: string, init: RequestInit, what: string, deadline = Number.POSITIVE_INFINITY): Promise<{ response: Response; note: string }> {
    let waits = 0;
    let retried = '';
    for (;;) {
      if (Date.now() >= deadline) throw new SynthesisError('network', `${what}: no reply within the listing time limit`);
      const response = await request(path, init, what);
      if (response.ok) {
        const waited = waits ? ` after ${waits} rate-limit wait${waits === 1 ? '' : 's'}` : '';
        return { response, note: `${retried}${waited}` };
      }
      const body = await response.text().catch(() => '');
      if (response.status === 429 && waits < RATE_LIMIT_RETRIES && !isQuota(429, response.headers)) {
        waits++;
        const waitMs = retryAfterMs(response);
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new SynthesisError('network', `${what}: no reply within the listing time limit`);
        if (Number.isFinite(deadline)) await withTimeout(pause(waitMs), remaining, () => new SynthesisError('network', `${what}: no reply within the listing time limit`));
        else await pause(waitMs);
        continue;
      }
      if (response.status >= 500 && !retried) {
        retried = ` after a retry of HTTP ${response.status}`;
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new SynthesisError('network', `${what}: no reply within the listing time limit`);
        if (Number.isFinite(deadline)) await withTimeout(pause(RETRY_DELAY_MS), remaining, () => new SynthesisError('network', `${what}: no reply within the listing time limit`));
        else await pause(RETRY_DELAY_MS);
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

  type ModelListReply = {
    items?: unknown;
    has_more?: unknown;
    max_offset?: unknown;
    accessible_upper_bound?: unknown;
    window_limited?: unknown;
    total_is_exact?: unknown;
    total?: unknown;
  };

  const cache = deps.cache ?? new FishVoiceCache();
  const listTimeoutMs = deps.timeoutMs ?? FISH_VOICE_LIST_TIMEOUT_MS;
  let notices: VoiceListNotice[] = [];

  const detailOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));
  const authFailure = (error: unknown): boolean => error instanceof SynthesisError && error.kind === 'auth';

  function abortedError(what: string): SynthesisError {
    return new SynthesisError('network', `${what}: aborted`);
  }

  function newController(): AbortController | null {
    try {
      return deps.newAbortController?.() ?? null;
    } catch {
      return null;
    }
  }

  /** Let one caller stop waiting while the shared request continues for other callers. */
  function forCaller<T>(promise: Promise<T>, signal: AbortSignal | undefined, what: string): Promise<T> {
    if (!signal) return promise;
    if (signal.aborted) return Promise.reject(abortedError(what));
    // A few chrome/test stand-ins expose only `aborted`; without the event
    // methods there is no future cancellation to observe, so let the request
    // settle normally.
    if (typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function') return promise;
    return new Promise<T>((resolve, reject) => {
      const onAbort = () => {
        cleanup();
        reject(abortedError(what));
      };
      const cleanup = () => signal.removeEventListener('abort', onAbort);
      signal.addEventListener('abort', onAbort, { once: true });
      promise.then(
        (value) => {
          cleanup();
          resolve(value);
        },
        (error) => {
          cleanup();
          reject(error);
        },
      );
    });
  }

  function cached<T>(
    map: Map<string, CacheSlot<T>>,
    key: string,
    refresh: boolean,
    load: (deadline: number, signal?: AbortSignal) => Promise<T>,
    what: string,
    deadline = Date.now() + listTimeoutMs,
  ): Promise<T> {
    cache.touchAccount(key);
    let slot = map.get(key);
    if (!slot) {
      slot = { generation: 0 };
      map.set(key, slot);
    }
    if (!refresh && slot.value !== undefined) {
      cache.hit();
      return Promise.resolve(slot.value);
    }
    if (!refresh && slot.inFlight) {
      cache.hit();
      return slot.inFlight.promise;
    }
    if (refresh) slot.inFlight?.abort?.();
    cache.load();
    const generation = ++slot.generation;
    // Bound the shared operation itself. A caller may stop waiting sooner,
    // but a never-settling request must not remain in-flight forever and
    // poison every later non-refresh listing.
    const remaining = Math.max(0, deadline - Date.now());
    const controller = newController();
    const promise = withTimeout(
      load(deadline, controller?.signal),
      remaining,
      () => new SynthesisError('network', `${what}: no reply within ${Math.round(listTimeoutMs / 1000)} s`),
      () => controller?.abort(),
    ).then(
      (value) => {
        // A refresh may have superseded this request while it was in flight.
        // Only the newest generation may publish its result.
        if (slot!.generation === generation) {
          slot!.value = value;
          slot!.inFlight = undefined;
          slot!.lastError = undefined;
        }
        return value;
      },
      (error) => {
        if (slot!.generation === generation) {
          slot!.inFlight = undefined;
          slot!.lastError = error;
        }
        throw error;
      },
    );
    slot.inFlight = { generation, promise, ...(controller ? { abort: () => controller.abort() } : {}) };
    return promise;
  }

  function cachedValue<T>(map: Map<string, CacheSlot<T>>, key: string): T | undefined {
    return map.get(key)?.value;
  }

  function cachedError<T>(map: Map<string, CacheSlot<T>>, key: string): unknown {
    return map.get(key)?.lastError;
  }

  function limitedReply(reply: ModelListReply, page: number, maxPages: number, maxResults = maxPages * PAGE_SIZE): boolean {
    if (reply.window_limited === true || reply.total_is_exact === false) return true;
    if (typeof reply.total === 'number' && Number.isFinite(reply.total) && reply.total > maxResults) return true;
    if (
      typeof reply.total === 'number' &&
      Number.isFinite(reply.total) &&
      typeof reply.accessible_upper_bound === 'number' &&
      Number.isFinite(reply.accessible_upper_bound) &&
      reply.accessible_upper_bound > 0 &&
      reply.total > reply.accessible_upper_bound
    ) {
      return true;
    }
    return page >= maxPages && reply.has_more === true;
  }

  /** Number of pages worth asking for after the first page exposes its total. */
  function pagesFor(reply: ModelListReply, maxPages: number): number {
    if (reply.has_more !== true) return 1;
    const totalPages = typeof reply.total === 'number' && Number.isFinite(reply.total) && reply.total > 0 ? Math.ceil(reply.total / PAGE_SIZE) : maxPages;
    return Math.min(maxPages, Math.max(2, totalPages));
  }

  function modelId(voice: VoiceInfo): string {
    const decoded = decodeFishVoice(voice.id);
    if (decoded) return decoded.id.toLowerCase();
    const slash = voice.id.indexOf('/');
    return (slash >= 0 ? voice.id.slice(slash + 1) : voice.id).toLowerCase();
  }

  function mergeVoices(...groups: readonly VoiceInfo[][]): VoiceInfo[] {
    const seen = new Set<string>();
    const out: VoiceInfo[] = [];
    for (const group of groups) {
      for (const voice of group) {
        const id = modelId(voice);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push(voice);
      }
    }
    return out;
  }

  /** Every page of the account's own models. An authenticated request, so a wrong key fails here. */
  async function ownVoices(signal?: AbortSignal, key = apiKey(), deadline = Number.POSITIVE_INFINITY): Promise<FishListSnapshot> {
    const what = 'Fish Audio voice list';
    const readPage = async (page: number): Promise<{ reply: ModelListReply; voices: VoiceInfo[] }> => {
      const { response } = await exchange(`/model?self=true&page_size=${PAGE_SIZE}&page_number=${page}`, { headers: headers({}, key), ...(signal ? { signal } : {}) }, what, deadline);
      const reply = await readJSON<ModelListReply>(response, what);
      if (!Array.isArray(reply?.items)) throw new SynthesisError('unknown', `${what}: the reply was not a model list`);
      return { reply, voices: mergeVoices(reply.items.map((item) => fishVoice(item as FishModel)).filter((voice): voice is VoiceInfo => voice !== null)) };
    };
    const first = await readPage(1);
    const pageCount = pagesFor(first.reply, MAX_PAGES);
    const rest = await Promise.all(Array.from({ length: pageCount - 1 }, (_, index) => readPage(index + 2)));
    const pages = [first, ...rest];
    const out = pages.flatMap((page) => page.voices);
    const limited = pages.some((page, index) => limitedReply(page.reply, index + 1, MAX_PAGES));
    return { voices: mergeVoices(out), limited };
  }

  /** Every page in the official account's list. The whole pagination operation is bounded by the caller. */
  async function officialVoices(signal?: AbortSignal, key = apiKey(), deadline = Number.POSITIVE_INFINITY): Promise<FishListSnapshot> {
    const what = 'Fish Audio official voice list';
    const readPage = async (page: number): Promise<{ reply: ModelListReply; voices: VoiceInfo[] }> => {
      const { response } = await exchange(`/model?author_id=${OFFICIAL_AUTHOR_ID}&page_size=${PAGE_SIZE}&page_number=${page}`, { headers: headers({}, key), ...(signal ? { signal } : {}) }, what, deadline);
      const reply = await readJSON<ModelListReply>(response, what);
      if (!Array.isArray(reply?.items)) throw new SynthesisError('unknown', `${what}: the reply was not a model list`);
      return { reply, voices: mergeVoices(reply.items.map((item) => publicFishVoice(item as FishModel)).filter((voice): voice is VoiceInfo => voice !== null)) };
    };
    const first = await readPage(1);
    const pageCount = pagesFor(first.reply, MAX_PAGES);
    const rest = await Promise.all(Array.from({ length: pageCount - 1 }, (_, index) => readPage(index + 2)));
    const pages = [first, ...rest];
    const out = pages.flatMap((page) => page.voices);
    const limited = pages.some((page, index) => limitedReply(page.reply, index + 1, MAX_PAGES));
    return { voices: mergeVoices(out), limited };
  }

  /** A pasted id by the public model route: its title and language, or, for an id the library does not know, the id marked as not found. */
  async function pastedVoice(id: string, signal?: AbortSignal, key = apiKey()): Promise<VoiceInfo> {
    const what = `Fish Audio voice ${id}`;
    const response = await request(`/model/${id}`, { headers: headers({}, key), ...(signal ? { signal } : {}) }, what);
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

  type Attempt<T> = { value?: T; error?: unknown };

  async function bounded<T>(promise: Promise<T>, deadline: number, signal: AbortSignal | undefined, what: string): Promise<T> {
    const remaining = Math.max(0, deadline - Date.now());
    return withTimeout(
      forCaller(promise, signal, what),
      remaining,
      () => new SynthesisError('network', `${what}: no reply within ${Math.round(listTimeoutMs / 1000)} s`),
    );
  }

  async function attempt<T>(
    promise: Promise<T>,
    fallback: T | undefined,
    deadline: number,
    signal: AbortSignal | undefined,
    what: string,
  ): Promise<Attempt<T>> {
    try {
      return { value: await bounded(promise, deadline, signal, what) };
    } catch (error) {
      // A failed refresh leaves the last complete snapshot available to the
      // caller. The error is retained by listVoices as a stale notice.
      return fallback === undefined ? { error } : { value: fallback, error };
    }
  }

  /** Cached official/own promises already carry the shared-load timeout. */
  async function attemptShared<T>(promise: Promise<T>, fallback: T | undefined, signal: AbortSignal | undefined, what: string): Promise<Attempt<T>> {
    try {
      return { value: await forCaller(promise, signal, what) };
    } catch (error) {
      return fallback === undefined ? { error } : { value: fallback, error };
    }
  }

  function addNotice(next: VoiceListNotice[], notice: VoiceListNotice): void {
    // The catalog has one status line for a provider; one notice per kind is
    // enough even when own, public, and pasted requests fail together.
    if (next.some((entry) => entry.kind === notice.kind)) return;
    next.push(notice);
  }

  async function sharedPastedRequest(id: string, signal: AbortSignal | undefined, deadline: number): Promise<VoiceInfo> {
    const account = apiKey();
    cache.touchAccount(account);
    let values = cache.pasted.get(account);
    if (!values) {
      values = new Map<string, VoiceInfo>();
      cache.pasted.set(account, values);
    }
    const existing = values.get(id);
    if (existing) {
      cache.hit();
      return existing;
    }
    // The deadline bounds network work, not already-resolved metadata.
    // A slow official refresh must not remove a saved manual voice.
    const remaining = Math.max(0, deadline - Date.now());
    if (remaining <= 0) throw new SynthesisError('network', `Fish Audio voice ${id}: no reply within ${Math.round(listTimeoutMs / 1000)} s`);
    let pending = cache.pastedInFlight.get(account);
    if (!pending) {
      pending = new Map<string, Promise<VoiceInfo>>();
      cache.pastedInFlight.set(account, pending);
    }
    const active = pending.get(id);
    if (active) {
      cache.hit();
      return forCaller(active, signal, `Fish Audio voice ${id}`);
    }
    cache.load();
    const controller = newController();
    const promise = withTimeout(
      pastedVoice(id, controller?.signal, account),
      remaining,
      () => new SynthesisError('network', `Fish Audio voice ${id}: no reply within ${Math.round(listTimeoutMs / 1000)} s`),
      () => controller?.abort(),
    ).then(
      (voice) => {
        values!.set(id, voice);
        pending!.delete(id);
        return voice;
      },
      (error) => {
        pending!.delete(id);
        throw error;
      },
    );
    pending.set(id, promise);
    return forCaller(promise, signal, `Fish Audio voice ${id}`);
  }

  const provider: TTSProvider = {
    id: 'fish',
    // Every reply of the timestamp route carries the words' seconds (measured 2026-09-10); never estimated
    capabilities: { wordTimestamps: true },
    /** The enabled official, own, and manual voices, plus the model's default voice. */
    async listVoices(options?: ListVoicesOptions): Promise<VoiceInfo[]> {
      requireKey();
      const signal = options?.signal;
      if (signal?.aborted) throw abortedError('Fish Audio voice list');
      const account = apiKey();
      const refresh = options?.refresh === true;
      const deadline = Date.now() + listTimeoutMs;
      const includeOfficial = cfg.includeOfficial !== false;
      const includeOwn = cfg.includeOwn !== false;
      const includeManual = cfg.includeManual !== false;
      const officialSlot = cache.official;
      const ownSlot = cache.own;

      // Start the selected independent lists before awaiting either. Requests
      // deliberately do not receive the caller's signal: forCaller below
      // cancels only this listing consumer, leaving the shared request useful
      // to other callers.
      const officialRaw = includeOfficial
        ? cached(officialSlot, account, refresh, (loadDeadline, loadSignal) => officialVoices(loadSignal, account, loadDeadline), 'Fish Audio official voice list', deadline)
        : null;
      const ownRaw = includeOwn
        ? cached(ownSlot, account, refresh, (loadDeadline, loadSignal) => ownVoices(loadSignal, account, loadDeadline), 'Fish Audio voice list', deadline)
        : null;
      const officialResultPromise = officialRaw
        ? attemptShared(officialRaw, cachedValue(officialSlot, account), signal, 'Fish Audio official voice list')
        : Promise.resolve<Attempt<FishListSnapshot>>({});
      const ownResultPromise = ownRaw
        ? attemptShared(ownRaw, cachedValue(ownSlot, account), signal, 'Fish Audio voice list')
        : Promise.resolve<Attempt<FishListSnapshot>>({});
      const [officialResult, ownResult] = await Promise.all([officialResultPromise, ownResultPromise]);

      const nextNotices: VoiceListNotice[] = [];
      if (officialResult.value?.limited || ownResult.value?.limited) addNotice(nextNotices, { kind: 'limited' });
      for (const result of [officialResult, ownResult]) {
        if (result.error && !authFailure(result.error)) addNotice(nextNotices, { kind: 'stale', detail: detailOf(result.error) });
      }
      const rememberedErrors = [
        includeOfficial ? cachedError(officialSlot, account) : undefined,
        includeOwn ? cachedError(ownSlot, account) : undefined,
      ].filter((error): error is unknown => error !== undefined);
      for (const error of rememberedErrors) {
        if (!authFailure(error)) addNotice(nextNotices, { kind: 'stale', detail: detailOf(error) });
      }
      const authError = [...[officialResult.error, ownResult.error], ...rememberedErrors].find((error) => error !== undefined && authFailure(error));
      if (authError) {
        notices = nextNotices;
        throw authError;
      }
      if (signal?.aborted) {
        notices = nextNotices;
        throw abortedError('Fish Audio voice list');
      }

      const official = officialResult.value?.voices ?? [];
      const own = ownResult.value?.voices ?? [];
      const known = new Set([...official, ...own].map(modelId));
      const pasted = includeManual ? fishVoiceIds(cfg.voices).filter((id) => !known.has(id)) : [];
      const pastedResults = await Promise.all(
        pasted.map(async (id): Promise<Attempt<VoiceInfo>> => {
          return attemptShared(sharedPastedRequest(id, undefined, deadline), undefined, signal, `Fish Audio voice ${id}`);
        }),
      );
      const pastedVoices: VoiceInfo[] = [];
      for (const result of pastedResults) {
        if (result.value) pastedVoices.push(result.value);
        if (result.error) {
          if (authFailure(result.error)) {
            notices = nextNotices;
            throw result.error;
          }
          addNotice(nextNotices, { kind: 'stale', detail: detailOf(result.error) });
        }
      }
      if (signal?.aborted) {
        notices = nextNotices;
        throw abortedError('Fish Audio voice list');
      }

      // Default is a local catalog entry, so a transient non-authentication
      // outage must still leave it (and any resolved manual entries) visible.
      // Authentication failures were rejected above before reaching this
      // fallback.
      notices = nextNotices;
      return mergeVoices(official, own, pastedVoices, [{ id: `${MULTILINGUAL}/${DEFAULT_VOICE}`, label: DEFAULT_VOICE_LABEL, locale: MULTILINGUAL }]);
    },
    voiceListNotices(): VoiceListNotice[] {
      return [...notices];
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
