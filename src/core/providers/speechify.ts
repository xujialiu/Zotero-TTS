import { alignWordsToText, type TimedWord } from '../align';
import { pcm16ToWav } from '../wav';
import { SynthesisError } from './errors';
import { MULTILINGUAL, type ListVoicesOptions, type SynthesisOptions, type SynthesisResult, type TTSProvider, type VoiceInfo } from './types';

/**
 * Speechify (issue #79): the Simba models over `POST /v1/audio/speech`,
 * behind one API key. Measured against the live API on 2026-09-09
 * (notes/NOTES_2026-09-09.md):
 * - the voice list is paginated, 200 a page, 992 voices in five pages, and
 *   every voice has exactly one locale — kept in the published id, since
 *   the locale is what synthesis needs: the model (the API's own rule,
 *   `simba-3.2` for English and `simba-3.0` for everything else) and the
 *   `language` hint that keeps a multilingual voice in its language. A
 *   wrong key is a 401 on the list, so the list is the connection check;
 * - the reply is JSON: base64 audio beside `speech_marks`, whose chunks
 *   carry a word's text and its milliseconds — and character offsets that
 *   drift by one per full-width punctuation mark on CJK text, so the words
 *   are aligned by their text (core/align.ts), never by the offsets;
 * - the Free plan allows one request at a time and one per second: every
 *   request goes through one queue shared by every instance (a provider is
 *   built per call), and a 429 waits what Retry-After says and asks again;
 * - the route takes 2,000 characters: a longer segment is split and the
 *   pieces asked as PCM and joined into one WAV of the plugin's own (the
 *   WAV Speechify writes declares 26 bytes of data);
 * - `* * *` answered 502 after a minute: text with no letter and no digit
 *   is never sent, and answers empty audio, which the remote interface
 *   plays as a short pause (read-aloud/remote-interface.ts).
 */

export type SpeechifyConfig = { apiKey: string };

export type SpeechifyDeps = {
  fetch: typeof fetch;
  /** The pause before a retry; `setTimeout` (on the sandbox's whitelist) when absent, nothing in the tests. */
  wait?: (ms: number) => Promise<void>;
  /** The queue every request goes through; the module's shared one when absent, so instances built per call still send one at a time. */
  queue?: SerialQueue;
};

export const SPEECHIFY_API = 'https://api.speechify.ai';
/** The API's recommendation for English voices — every English voice lists it — and its default for the rest (its models list, 2026-09-09). */
export const MODEL_ENGLISH = 'simba-3.2';
export const MODEL_OTHER = 'simba-3.0';
/** MP3 at 64 kbps: half the bytes of the 128 kbps default, in every reply and in the memory cache. */
export const OUTPUT_FORMAT = 'mp3_24000_64';
/** The pieces of a split segment come as raw 16-bit samples, joined into one WAV. */
export const SPLIT_OUTPUT_FORMAT = 'pcm_24000';
export const PCM_SAMPLE_RATE = 24_000;
/** What the route takes: 400 "Field input must not exceed 2000 characters" above it (measured 2026-09-09). */
export const MAX_INPUT_CHARS = 2000;
/** The most the list route gives per page; 992 voices are five pages. */
export const PAGE_SIZE = 200;
const MAX_PAGES = 25;
/** The pause before a 5xx is asked again, as Cloudflare's (core/providers/cloudflare.ts). */
export const RETRY_DELAY_MS = 500;
/** How many times a 429 is waited out before it surfaces; the free plan's cap is one request at a time, one per second. */
export const RATE_LIMIT_RETRIES = 3;
const RETRY_AFTER_DEFAULT_MS = 1000;
const RETRY_AFTER_MAX_MS = 5000;

/**
 * One request at a time, first come first served: the Free plan refuses a
 * second simultaneous request with a 429, and Read Aloud's read-ahead
 * sends up to five (issue #79). A task whose signal was aborted while it
 * waited — the remote interface's timeout — is rejected unsent.
 */
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const turn = this.tail.then(() => {
      if (signal?.aborted) throw new SynthesisError('unknown', 'aborted while waiting for the queue');
      return task();
    });
    this.tail = turn.catch(() => undefined);
    return turn;
  }
}

/** The queue of the running plugin: one per module, whatever the number of provider instances. */
export const sharedQueue = new SerialQueue();

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** A voice as `GET /v1/voices` lists it; the fields the plugin reads. */
export type SpeechifyVoice = { id?: unknown; display_name?: unknown; gender?: unknown; locale?: unknown };

/**
 * The voices as the catalog lists them: the locale in front of the id, the
 * display name with the gender as the label, and the id appended where two
 * voices share a name and gender (five names do, measured 2026-09-09). A
 * voice without a locale goes to the multilingual group.
 */
export function speechifyVoices(list: readonly SpeechifyVoice[]): VoiceInfo[] {
  const entries = list.flatMap((voice) => {
    const id = str(voice.id);
    if (!id) return [];
    const gender = str(voice.gender);
    return [{ id, locale: str(voice.locale) || MULTILINGUAL, name: str(voice.display_name) || id, gender: gender === 'male' || gender === 'female' ? gender : '' }];
  });
  const shared = new Map<string, number>();
  for (const entry of entries) {
    const key = `${entry.name}|${entry.gender}`;
    shared.set(key, (shared.get(key) ?? 0) + 1);
  }
  return entries.map((entry) => {
    const inside = [entry.gender, (shared.get(`${entry.name}|${entry.gender}`) ?? 0) > 1 ? entry.id : ''].filter(Boolean).join(', ');
    return { id: `${entry.locale}/${entry.id}`, label: inside ? `${entry.name} (${inside})` : entry.name, locale: entry.locale };
  });
}

const LOCALE = /^(?:mul|[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)$/;

/** A published voice id back into its locale and Speechify id; null for anything else. */
export function decodeSpeechifyVoice(encoded: string): { locale: string; id: string } | null {
  const at = encoded.indexOf('/');
  if (at < 1) return null;
  const locale = encoded.slice(0, at);
  const id = encoded.slice(at + 1);
  if (!id || !LOCALE.test(locale)) return null;
  return { locale, id };
}

/** The API's own rule: `simba-3.2` serves every English voice, `simba-3.0` every other language. */
export function modelForLocale(locale: string): string {
  return /^en(?:-|$)/i.test(locale) ? MODEL_ENGLISH : MODEL_OTHER;
}

/** Whether there is anything to say: a letter or a digit. `* * *` cost 60 s and a 502 (measured 2026-09-09). */
export function isSpeakable(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text);
}

/**
 * A segment over the cap in pieces the route takes: each cut at the last
 * sentence end before the cap, else the last whitespace, else the cap
 * itself. The pieces concatenate back to the text, so `offset` is where
 * each begins in it.
 */
export function splitForSpeechify(text: string, max = MAX_INPUT_CHARS): { text: string; offset: number }[] {
  const pieces: { text: string; offset: number }[] = [];
  let offset = 0;
  while (text.length - offset > max) {
    const window = text.slice(offset, offset + max);
    let cut = 0;
    for (const match of window.matchAll(/[。！？]|[.!?]\s/g)) cut = match.index + match[0].length;
    if (cut < 1) {
      for (let i = window.length - 1; i >= 0; i--) {
        if (/\s/.test(window[i])) {
          cut = i + 1;
          break;
        }
      }
    }
    if (cut < 1) cut = max;
    pieces.push({ text: window.slice(0, cut), offset });
    offset += cut;
  }
  pieces.push({ text: text.slice(offset), offset });
  return pieces;
}

const MIME: Record<string, string> = { mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', aac: 'audio/aac' };

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

type SpeechReply = { audio_data?: unknown; audio_format?: unknown; speech_marks?: unknown };

/** The chunks of a reply as timed words: the text and the milliseconds, to seconds; anything else is skipped. */
function timedWords(reply: SpeechReply): TimedWord[] {
  const chunks = (reply.speech_marks as { chunks?: unknown } | null)?.chunks;
  if (!Array.isArray(chunks)) return [];
  const out: TimedWord[] = [];
  for (const chunk of chunks) {
    const { value, start_time, end_time } = (chunk ?? {}) as { value?: unknown; start_time?: unknown; end_time?: unknown };
    if (typeof value !== 'string' || typeof start_time !== 'number' || typeof end_time !== 'number') continue;
    if (!Number.isFinite(start_time) || !Number.isFinite(end_time) || end_time < start_time) continue;
    out.push({ text: value, start: start_time / 1000, end: end_time / 1000 });
  }
  return out;
}

/** What a refusal says, from Speechify's `{ error: { code, message } }`; empty for any other body. Whitespace collapsed: a validation message spans lines. */
export function speechifyReason(body: string): { code: string; message: string } {
  try {
    const error = (JSON.parse(body) as { error?: { code?: unknown; message?: unknown } } | null)?.error;
    return { code: str(error?.code), message: str(error?.message).replace(/\s+/g, ' ').slice(0, 300) };
  } catch {
    return { code: '', message: '' };
  }
}

const RATE_CODES = new Set(['rate_limited', 'concurrency_limit_reached']);
const QUOTA = /quota|allowance|usage|credit|payment|insufficient|limit[ _]reached/i;

/**
 * Whether a refusal is the plan's allowance rather than its pace or the
 * key. What the Free plan's hard cap answers is documented nowhere and was
 * not measured (2026-09-09): a 402 is, and so is a code or message naming
 * the allowance on a 403 or a 429 — never the two 429 codes the pace
 * limits answer with, whose messages speak of the plan too, and never a
 * 400, whose limits are the request's own.
 */
function isQuota(status: number, reason: { code: string; message: string }): boolean {
  if (status === 402) return true;
  // A 400 quoting a limit is the request's — "must not exceed 2000 characters" — never the plan's
  if (status !== 403 && status !== 429) return false;
  if (RATE_CODES.has(reason.code)) return false;
  if (status === 429 && !reason.code) return false;
  return QUOTA.test(`${reason.code} ${reason.message}`);
}

function refusal(status: number, body: string, what: string): SynthesisError {
  const reason = speechifyReason(body);
  const quoted = reason.message ? ` — ${reason.message}` : reason.code ? ` — ${reason.code}` : '';
  if (isQuota(status, reason)) return new SynthesisError('quota', `${what}: Speechify refused to synthesize (${status})${quoted}`);
  if (status === 401 || status === 403) return new SynthesisError('auth', `${what}: Speechify rejected the API key (${status})${quoted}`);
  if (status === 429) return new SynthesisError('rate-limit', `${what}: rate limited (429)${quoted}`);
  return new SynthesisError('unknown', `${what}: HTTP ${status}${quoted}`);
}

/** How long a 429 asks to wait: its Retry-After in seconds, a second without one, five at most. */
function retryAfterMs(response: Response): number {
  const seconds = Number(response.headers.get('Retry-After') ?? '');
  if (!Number.isFinite(seconds) || seconds <= 0) return RETRY_AFTER_DEFAULT_MS;
  return Math.min(RETRY_AFTER_MAX_MS, Math.round(seconds * 1000));
}

export function createSpeechifyProvider(cfg: SpeechifyConfig, deps: SpeechifyDeps): TTSProvider {
  const apiKey = () => cfg.apiKey.trim();
  const headers = (): Record<string, string> => ({ Authorization: `Bearer ${apiKey()}` });
  const queue = deps.queue ?? sharedQueue;
  const pause = deps.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  function requireKey(): void {
    if (!apiKey()) throw new SynthesisError('no-key', 'Speechify API key is not set');
  }

  async function request(path: string, init: RequestInit, what: string): Promise<Response> {
    try {
      return await deps.fetch(`${SPEECHIFY_API}${path}`, init);
    } catch (e) {
      throw new SynthesisError('network', `${what}: cannot reach api.speechify.ai (${e})`);
    }
  }

  /**
   * One request through the queue, with the two retries: a 429 waits what
   * Retry-After says and asks again, up to RATE_LIMIT_RETRIES times,
   * unless its body names the allowance; a 5xx is asked once more after
   * RETRY_DELAY_MS. The note says what happened, for the debug line — the
   * only place a live run can see a retry.
   */
  function exchange(path: string, init: RequestInit, what: string, signal?: AbortSignal): Promise<{ response: Response; note: string }> {
    return queue.run(async () => {
      let waits = 0;
      let retried = '';
      for (;;) {
        const response = await request(path, init, what);
        if (response.ok) {
          const waited = waits ? ` after ${waits} rate-limit wait${waits === 1 ? '' : 's'}` : '';
          return { response, note: `${retried}${waited}` };
        }
        const body = await response.text().catch(() => '');
        if (response.status === 429 && waits < RATE_LIMIT_RETRIES && !isQuota(429, speechifyReason(body))) {
          waits++;
          await pause(retryAfterMs(response));
          continue;
        }
        if (response.status >= 500 && !retried) {
          retried = ` after a retry of HTTP ${response.status}`;
          await pause(RETRY_DELAY_MS);
          continue;
        }
        throw refusal(response.status, body, what);
      }
    }, signal);
  }

  async function readReply<T>(response: Response, what: string): Promise<T> {
    try {
      return (await response.json()) as T;
    } catch {
      throw new SynthesisError('unknown', `${what}: the reply was not JSON`);
    }
  }

  function audioBytes(reply: SpeechReply, what: string): Uint8Array<ArrayBuffer> {
    const data = reply.audio_data;
    if (typeof data !== 'string' || !data) throw new SynthesisError('unknown', `${what}: the reply carried no audio`);
    try {
      return decodeBase64(data);
    } catch (e) {
      throw new SynthesisError('unknown', `${what}: the audio was not valid base64 (${e})`);
    }
  }

  async function synthesizeOnce(body: Record<string, unknown>, what: string, signal?: AbortSignal): Promise<{ reply: SpeechReply; note: string }> {
    const init: RequestInit = { method: 'POST', headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal };
    const { response, note } = await exchange('/v1/audio/speech', init, what, signal);
    return { reply: await readReply<SpeechReply>(response, what), note };
  }

  /** The result with the timestamps only when some word aligned — never the key with nothing behind it — and the note either way. */
  function finish(audio: Blob, words: TimedWord[], text: string, note: string): SynthesisResult {
    const timestamps = words.length ? alignWordsToText(words, text) : [];
    return timestamps.length ? { audio, timestamps, note } : { audio, note: `${note}: no word timings in the reply` };
  }

  async function speak(text: string, voice: string, signal?: AbortSignal): Promise<SynthesisResult> {
    requireKey();
    const decoded = decodeSpeechifyVoice(voice);
    if (!decoded) throw new SynthesisError('unknown', `Unknown Speechify voice: ${voice}`);
    // Nothing to say: no request, and the empty audio plays as a pause
    if (!isSpeakable(text)) return { audio: new Blob([], { type: 'audio/mpeg' }), note: 'no speakable text' };
    const model = modelForLocale(decoded.locale);
    const what = `Speechify ${model}`;
    const base = { voice_id: decoded.id, model, ...(decoded.locale === MULTILINGUAL ? {} : { language: decoded.locale }) };
    const pieces = splitForSpeechify(text);

    if (pieces.length === 1) {
      const { reply, note } = await synthesizeOnce({ input: text, ...base, audio_format: 'mp3', output_format: OUTPUT_FORMAT }, what, signal);
      const bytes = audioBytes(reply, what);
      const format = str(reply.audio_format);
      const audio = format === 'pcm' ? pcm16ToWav(bytes, PCM_SAMPLE_RATE) : new Blob([bytes], { type: MIME[format] ?? 'audio/mpeg' });
      return finish(audio, timedWords(reply), text, `${model}${note}`);
    }

    // Over the cap: the pieces in turn, as raw samples, joined into one WAV
    // with the later pieces' words moved by the earlier pieces' durations
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    const words: TimedWord[] = [];
    let seconds = 0;
    let notes = '';
    for (const piece of pieces) {
      const { reply, note } = await synthesizeOnce({ input: piece.text, ...base, audio_format: 'pcm', output_format: SPLIT_OUTPUT_FORMAT }, what, signal);
      const format = str(reply.audio_format);
      if (format !== 'pcm') throw new SynthesisError('unknown', `${what}: asked for PCM for a piece of a long segment, got ${format || 'no format'}`);
      const bytes = audioBytes(reply, what);
      chunks.push(bytes);
      for (const word of timedWords(reply)) words.push({ text: word.text, start: word.start + seconds, end: word.end + seconds });
      seconds += bytes.length / (2 * PCM_SAMPLE_RATE);
      notes += note;
    }
    return finish(pcm16ToWav(concat(chunks), PCM_SAMPLE_RATE), words, text, `${model} in ${pieces.length} pieces${notes}`);
  }

  const provider: TTSProvider = {
    id: 'speechify',
    // Every reply carries speech marks with the words' milliseconds (measured 2026-09-09); never estimated
    capabilities: { wordTimestamps: true },

    /**
     * Every page of the key's voice list, through the queue like every
     * other request (the list routes share the plan's one-at-a-time cap).
     * An authenticated request, so it is also the connection check: a
     * wrong key fails here, before anything is spent.
     */
    async listVoices(options?: ListVoicesOptions): Promise<VoiceInfo[]> {
      requireKey();
      const what = 'Speechify voice list';
      const raw: SpeechifyVoice[] = [];
      let cursor = '';
      for (let pages = 0; pages < MAX_PAGES; pages++) {
        const path = `/v1/voices?limit=${PAGE_SIZE}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
        const { response } = await exchange(path, { headers: headers(), signal: options?.signal }, what, options?.signal);
        const reply = await readReply<{ voices?: unknown; has_more?: unknown; next_cursor?: unknown }>(response, what);
        const list = reply?.voices;
        if (!Array.isArray(list)) throw new SynthesisError('unknown', `${what}: the reply was not a voice list`);
        raw.push(...(list as SpeechifyVoice[]));
        const next = reply.has_more ? str(reply.next_cursor) : '';
        if (!next) break;
        cursor = next;
      }
      return speechifyVoices(raw);
    },

    /** Two letters on the voice's own route, discarded: proves the account can spend and the model answers. */
    async checkSynthesis(voice: string): Promise<void> {
      await speak('Hi', voice);
    },

    synthesize(text: string, o: SynthesisOptions): Promise<SynthesisResult> {
      return speak(text, o.voice, o.signal);
    },
  };
  return provider;
}
