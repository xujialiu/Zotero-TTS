import { describe, expect, it, vi } from 'vitest';
import {
  MAX_INPUT_CHARS,
  MODEL_ENGLISH,
  MODEL_OTHER,
  OUTPUT_FORMAT,
  SPEECHIFY_API,
  SerialQueue,
  createSpeechifyProvider,
  decodeSpeechifyVoice,
  isSpeakable,
  modelForLocale,
  speechifyVoices,
  splitForSpeechify,
  type SpeechifyConfig,
  type SpeechifyDeps,
} from '../../../src/core/providers/speechify';
import { wavDataLength } from '../../../src/core/wav';

const cfg: SpeechifyConfig = { apiKey: 'sk_test' };

/** Every wait is skipped in the tests; `waits` keeps what was asked for. */
let waits: number[] = [];
function provider(fetchImpl: unknown, over: Partial<SpeechifyConfig> = {}, deps: Partial<SpeechifyDeps> = {}) {
  return createSpeechifyProvider({ ...cfg, ...over }, { fetch: fetchImpl as typeof fetch, wait: async (ms) => void waits.push(ms), queue: new SerialQueue(), ...deps });
}

const controller = new AbortController();
const GEORGE = { voice: 'en-US/george', signal: controller.signal };
const AKARI = { voice: 'ja-JP/akari', signal: controller.signal };

/** A voice as `GET /v1/voices` lists it (measured 2026-09-09). */
const voice = (id: string, locale: string, display_name = id[0].toUpperCase() + id.slice(1), gender = 'male', models = locale.startsWith('en') ? ['simba-3.0', 'simba-3.2'] : ['simba-3.0']) => ({
  id,
  type: 'shared',
  display_name,
  gender,
  locale,
  models: models.map((name) => ({ name, languages: [{ locale, preview_audio: null }] })),
  preview_audio: 'https://vms.cdn.speechify.com/previews/x.mp3',
  avatar_image: '',
  tags: [],
});

const page = (voices: unknown[], next_cursor: string | null = null) => Response.json({ voices, next_cursor, has_more: next_cursor !== null });

/** A refusal in Speechify's shape. */
const refusal = (status: number, code: string, message: string, headers: Record<string, string> = {}) =>
  Response.json({ error: { code, message }, request_id: 'req' }, { status, headers });

/** The chunk list of a reply: `[value, start, end, start_time, end_time]` — offsets and milliseconds, as the API answers. */
type Chunk = [string, number, number, number, number];
const marks = (chunks: Chunk[]) => ({
  type: 'sentence',
  start: 0,
  end: chunks.at(-1)?.[2] ?? 0,
  start_time: chunks[0]?.[3] ?? 0,
  end_time: chunks.at(-1)?.[4] ?? 0,
  value: chunks.map((c) => c[0]).join(' '),
  chunks: chunks.map(([value, start, end, start_time, end_time]) => ({ type: 'word', value, start, end, start_time, end_time })),
});

const MP3 = new Uint8Array([0x49, 0x44, 0x33, 0x04]);
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const reply = (chunks: Chunk[], audio: Uint8Array = MP3, audio_format = 'mp3') =>
  Response.json({ audio_data: b64(audio), audio_format, billable_characters_count: 10, speech_marks: marks(chunks) });

const call = (fetchImpl: any, index = 0): { url: string; init: RequestInit & { headers: Record<string, string> }; body: any } => {
  const [url, init] = fetchImpl.mock.calls[index];
  return { url, init, body: init?.body ? JSON.parse(init.body as string) : undefined };
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('the voice table', () => {
  it('files every voice under its own locale, names it after its display name with the gender, and keeps the locale in the id', () => {
    const voices = speechifyVoices([voice('george', 'en-US'), voice('akari', 'ja-JP', 'Akari', 'female'), voice('chi-wan', 'yue-CN', 'Chi-Wai')]);
    expect(voices).toEqual([
      { id: 'en-US/george', label: 'George (male)', locale: 'en-US' },
      { id: 'ja-JP/akari', label: 'Akari (female)', locale: 'ja-JP' },
      { id: 'yue-CN/chi-wan', label: 'Chi-Wai (male)', locale: 'yue-CN' },
    ]);
  });

  // Five display names are carried by two voices each (measured 2026-09-09: Cristiane, Dominic, Edmund, Geffen, Harper)
  it('appends the id where two voices share a display name and gender', () => {
    const voices = speechifyVoices([voice('dominic', 'en-US', 'Dominic'), voice('dominic_32', 'en-US', 'Dominic'), voice('harper', 'en-US', 'Harper', 'female'), voice('harper_m', 'en-GB', 'Harper', 'male')]);
    expect(voices.map((v) => v.label)).toEqual(['Dominic (male, dominic)', 'Dominic (male, dominic_32)', 'Harper (female)', 'Harper (male)']);
  });

  it('names a voice by its id without a display name, leaves the gender out when it is not given, and skips an entry without an id', () => {
    const voices = speechifyVoices([{ id: 'x1', locale: 'fr-FR' }, { id: 'x2', locale: 'fr-FR', display_name: 'Deux', gender: 'not_specified' }, { locale: 'fr-FR', display_name: 'Nobody' }, { id: '', locale: 'fr-FR' }]);
    expect(voices).toEqual([
      { id: 'fr-FR/x1', label: 'x1', locale: 'fr-FR' },
      { id: 'fr-FR/x2', label: 'Deux', locale: 'fr-FR' },
    ]);
  });

  it('files a voice without a locale under the multilingual group', () => {
    expect(speechifyVoices([{ id: 'x', display_name: 'X' }])).toEqual([{ id: 'mul/x', label: 'X', locale: 'mul' }]);
  });

  it('decodes a voice id into its locale and Speechify id, and nothing else', () => {
    expect(decodeSpeechifyVoice('en-US/george')).toEqual({ locale: 'en-US', id: 'george' });
    expect(decodeSpeechifyVoice('yue-CN/chi-wan')).toEqual({ locale: 'yue-CN', id: 'chi-wan' });
    expect(decodeSpeechifyVoice('mul/x')).toEqual({ locale: 'mul', id: 'x' });
    expect(decodeSpeechifyVoice('george')).toBeNull();
    expect(decodeSpeechifyVoice('en-US/')).toBeNull();
    expect(decodeSpeechifyVoice('/george')).toBeNull();
    expect(decodeSpeechifyVoice('not a locale/george')).toBeNull();
  });

  // The API's own recommendation: simba-3.2 for English, simba-3.0 for every other language (its models list, 2026-09-09)
  it('runs English voices on the English model and every other on the multilingual one', () => {
    expect(modelForLocale('en-US')).toBe(MODEL_ENGLISH);
    expect(modelForLocale('en-GB')).toBe(MODEL_ENGLISH);
    expect(modelForLocale('en')).toBe(MODEL_ENGLISH);
    expect(modelForLocale('ja-JP')).toBe(MODEL_OTHER);
    expect(modelForLocale('et-EE')).toBe(MODEL_OTHER);
    expect(modelForLocale('mul')).toBe(MODEL_OTHER);
  });
});

describe('what is sent', () => {
  it('knows text with no letter and no digit, which Speechify answers with a 502 after a minute', () => {
    expect(isSpeakable('* * *')).toBe(false);
    expect(isSpeakable('— · —')).toBe(false);
    expect(isSpeakable('   ')).toBe(false);
    expect(isSpeakable('')).toBe(false);
    expect(isSpeakable('1.')).toBe(true);
    expect(isSpeakable('§ 2')).toBe(true);
    expect(isSpeakable('文献')).toBe(true);
    expect(isSpeakable('Hi')).toBe(true);
  });

  it('splits a segment over the cap at the last sentence end before it, else the last space, else the cap', () => {
    const sentence = 'A sentence that ends here. ';
    const text = sentence.repeat(100); // 2,700 characters
    const pieces = splitForSpeechify(text);
    expect(pieces.length).toBe(2);
    expect(pieces[0].offset).toBe(0);
    expect(pieces[0].text.length).toBeLessThanOrEqual(MAX_INPUT_CHARS);
    expect(pieces[0].text.endsWith('here. ')).toBe(true);
    expect(pieces[1].offset).toBe(pieces[0].text.length);
    expect(pieces[0].text + pieces[1].text).toBe(text);
    const words = 'word '.repeat(500); // 2,500 characters, no sentence end
    const byWords = splitForSpeechify(words);
    expect(byWords[0].text.length).toBeLessThanOrEqual(MAX_INPUT_CHARS);
    expect(byWords[0].text.endsWith('word ')).toBe(true);
    const solid = 'x'.repeat(2001);
    expect(splitForSpeechify(solid).map((p) => p.text.length)).toEqual([2000, 1]);
    expect(splitForSpeechify('short')).toEqual([{ text: 'short', offset: 0 }]);
    expect(splitForSpeechify('x'.repeat(2000))).toHaveLength(1);
  });
});

describe('createSpeechifyProvider', () => {
  it('declares that it produces word timestamps', () => {
    expect(provider(vi.fn()).capabilities.wordTimestamps).toBe(true);
    expect(provider(vi.fn()).id).toBe('speechify');
  });

  describe('listVoices', () => {
    it('lists every page with the key, following the cursor until has_more is false', async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(page([voice('aadi', 'hi-IN'), voice('george', 'en-US')], 'eyJ'))
        .mockResolvedValueOnce(page([voice('zoe', 'fr-FR', 'Zoé', 'female')]));
      const voices = await provider(fetchImpl).listVoices({ signal: controller.signal });
      expect(call(fetchImpl, 0).url).toBe(`${SPEECHIFY_API}/v1/voices?limit=200`);
      expect(call(fetchImpl, 0).init.headers.Authorization).toBe('Bearer sk_test');
      expect(call(fetchImpl, 0).init.signal).toBe(controller.signal);
      expect(call(fetchImpl, 1).url).toBe(`${SPEECHIFY_API}/v1/voices?limit=200&cursor=eyJ`);
      expect(voices.map((v) => v.id)).toEqual(['hi-IN/aadi', 'en-US/george', 'fr-FR/zoe']);
      expect(voices[2].label).toBe('Zoé (female)');
    });

    it('refuses before any request without a key', async () => {
      const fetchImpl = vi.fn();
      await expect(provider(fetchImpl, { apiKey: '' }).listVoices()).rejects.toMatchObject({ kind: 'no-key' });
      await expect(provider(fetchImpl, { apiKey: '  ' }).listVoices()).rejects.toMatchObject({ kind: 'no-key' });
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('reports a 401 as auth, quoting the server', async () => {
      const fetchImpl = vi.fn(async () => refusal(401, 'unauthorized', 'Unauthorized'));
      await expect(provider(fetchImpl).listVoices()).rejects.toMatchObject({ kind: 'auth', message: /rejected the API key \(401\).*Unauthorized/ });
    });

    it('reports an unreachable server as network', async () => {
      const fetchImpl = vi.fn(async () => {
        throw new TypeError('NetworkError');
      });
      await expect(provider(fetchImpl).listVoices()).rejects.toMatchObject({ kind: 'network', message: /api\.speechify\.ai/ });
    });

    it('reports a reply that is not a voice list as an error, never as an empty catalog', async () => {
      await expect(provider(vi.fn(async () => new Response('<html>', { status: 200 }))).listVoices()).rejects.toMatchObject({ kind: 'unknown' });
      await expect(provider(vi.fn(async () => Response.json({ voices: 'x' }))).listVoices()).rejects.toMatchObject({ kind: 'unknown' });
      await expect(provider(vi.fn(async () => Response.json([]))).listVoices()).rejects.toMatchObject({ kind: 'unknown' });
    });

    // The list routes share the plan's one-request-at-a-time cap with synthesis (measured 2026-09-09)
    it('waits out a 429 on a page and asks again', async () => {
      waits = [];
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(refusal(429, 'concurrency_limit_reached', 'Concurrency limit exceeded', { 'Retry-After': '2' }))
        .mockResolvedValueOnce(page([voice('george', 'en-US')]));
      const voices = await provider(fetchImpl).listVoices();
      expect(voices).toHaveLength(1);
      expect(waits).toEqual([2000]);
    });
  });

  describe('synthesize', () => {
    it('posts the text with the English model, the voice\'s language and the small MP3 format, and takes the audio as MP3', async () => {
      const fetchImpl = vi.fn(async () => reply([['Hello', 0, 5, 43, 213], ['there', 6, 11, 299, 469]]));
      const result = await provider(fetchImpl).synthesize('Hello there', GEORGE);
      const { url, init, body } = call(fetchImpl);
      expect(url).toBe(`${SPEECHIFY_API}/v1/audio/speech`);
      expect(init.method).toBe('POST');
      expect(init.headers.Authorization).toBe('Bearer sk_test');
      expect(init.headers['Content-Type']).toBe('application/json');
      expect(init.signal).toBe(controller.signal);
      expect(body).toEqual({ input: 'Hello there', voice_id: 'george', model: MODEL_ENGLISH, language: 'en-US', audio_format: 'mp3', output_format: OUTPUT_FORMAT });
      expect(result.audio.type).toBe('audio/mpeg');
      expect(new Uint8Array(await result.audio.arrayBuffer())).toEqual(MP3);
      expect(result.timestamps).toEqual([
        { start: 0.043, end: 0.213, charStart: 0, charEnd: 5 },
        { start: 0.299, end: 0.469, charStart: 6, charEnd: 11 },
      ]);
      // The debug line names the model: the proof of the routing in a live run
      expect(result.note).toBe(MODEL_ENGLISH);
    });

    it('runs a voice of another language on the multilingual model, with that language', async () => {
      const fetchImpl = vi.fn(async () => reply([['文献', 0, 2, 0, 400]]));
      const result = await provider(fetchImpl).synthesize('文献', AKARI);
      expect(call(fetchImpl).body).toMatchObject({ voice_id: 'akari', model: MODEL_OTHER, language: 'ja-JP' });
      expect(result.note).toBe(MODEL_OTHER);
    });

    it('sends no language for a voice in the multilingual group', async () => {
      const fetchImpl = vi.fn(async () => reply([]));
      await provider(fetchImpl).synthesize('Hi', { ...GEORGE, voice: 'mul/x' });
      expect(call(fetchImpl).body).not.toHaveProperty('language');
      expect(call(fetchImpl).body.model).toBe(MODEL_OTHER);
    });

    // Measured 2026-09-09: after every full-width punctuation mark the offsets are one further off, the values right
    it('aligns the words by their text, never by the offsets the reply claims', async () => {
      const text = '第一句话。第二句话，有逗号。';
      const fetchImpl = vi.fn(async () =>
        reply([
          ['第', 0, 1, 0, 213],
          ['一句', 1, 3, 213, 597],
          ['话', 3, 4, 597, 768],
          ['。', 4, 5, 768, 1024],
          ['第', 6, 7, 1024, 1195],
          ['二句话', 7, 10, 1195, 1664],
          ['，', 10, 11, 1664, 1877],
          ['有', 11, 12, 1877, 2048],
          ['逗号', 12, 14, 2048, 2347],
          ['。.', 14, 16, 2347, 2560],
        ]),
      );
      const result = await provider(fetchImpl).synthesize(text, AKARI);
      // A punctuation chunk extends the word before it (issue #86): the
      // pause after 话 is 话's, and "。." — the normalizer's, not the text's —
      // is 逗号's, never a span of its own
      expect(result.timestamps).toEqual([
        { start: 0, end: 0.213, charStart: 0, charEnd: 1 },
        { start: 0.213, end: 0.597, charStart: 1, charEnd: 3 },
        { start: 0.597, end: 1.024, charStart: 3, charEnd: 4 },
        { start: 1.024, end: 1.195, charStart: 5, charEnd: 6 },
        { start: 1.195, end: 1.877, charStart: 6, charEnd: 9 },
        { start: 1.877, end: 2.048, charStart: 10, charEnd: 11 },
        { start: 2.048, end: 2.56, charStart: 11, charEnd: 13 },
      ]);
    });

    it('omits the timestamps, with a note, when the reply carries no chunks — the English model given another language', async () => {
      const fetchImpl = vi.fn(async () => reply([]));
      const result = await provider(fetchImpl).synthesize('文献', GEORGE);
      expect('timestamps' in result).toBe(false);
      expect(result.note).toMatch(/simba-3\.2.*no word timings/);
    });

    it('takes a reply without speech marks at all, or with unusable chunks, the same way', async () => {
      const fetchImpl = vi.fn(async () => Response.json({ audio_data: b64(MP3), audio_format: 'mp3' }));
      const result = await provider(fetchImpl).synthesize('Hi', GEORGE);
      expect('timestamps' in result).toBe(false);
      const odd = vi.fn(async () => Response.json({ audio_data: b64(MP3), audio_format: 'mp3', speech_marks: { chunks: [{ value: 'Hi', start_time: 'x' }, { start_time: 0, end_time: 5 }] } }));
      expect('timestamps' in (await provider(odd).synthesize('Hi', GEORGE))).toBe(false);
    });

    it('types the audio by the format the reply names', async () => {
      const fetchImpl = vi.fn(async () => reply([], new Uint8Array([0x4f, 0x67, 0x67, 0x53]), 'ogg'));
      expect((await provider(fetchImpl).synthesize('Hi', GEORGE)).audio.type).toBe('audio/ogg');
    });

    it('answers empty audio for text with no letter and no digit, without a request: the remote interface plays a pause', async () => {
      const fetchImpl = vi.fn();
      const result = await provider(fetchImpl).synthesize('* * *', GEORGE);
      expect(result.audio.size).toBe(0);
      expect('timestamps' in result).toBe(false);
      expect(result.note).toBe('no speakable text');
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('refuses a voice id it does not know before any request', async () => {
      const fetchImpl = vi.fn();
      await expect(provider(fetchImpl).synthesize('Hi', { ...GEORGE, voice: 'george' })).rejects.toMatchObject({ kind: 'unknown', message: /george/ });
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('refuses without the key before any request', async () => {
      const fetchImpl = vi.fn();
      await expect(provider(fetchImpl, { apiKey: '' }).synthesize('Hi', GEORGE)).rejects.toMatchObject({ kind: 'no-key' });
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('quotes the server\'s reason on a refusal, and types the status', async () => {
      const bad = (status: number, code: string, message: string) => provider(vi.fn(async () => refusal(status, code, message))).synthesize('Hi', GEORGE);
      await expect(bad(400, 'validation_failed', 'validation failed:\nField input must not exceed 2000 characters')).rejects.toMatchObject({
        kind: 'unknown',
        message: /400.*must not exceed 2000 characters/,
      });
      await expect(bad(404, 'voice_not_found', 'Voice not found. List the voices available to your workspace with GET /v1/voices.')).rejects.toMatchObject({ kind: 'unknown', message: /404.*Voice not found/ });
      await expect(bad(401, 'unauthorized', 'Unauthorized')).rejects.toMatchObject({ kind: 'auth', message: /Speechify rejected the API key \(401\)/ });
      await expect(bad(403, 'forbidden', 'Forbidden')).rejects.toMatchObject({ kind: 'auth' });
      await expect(bad(402, 'payment_required', 'Payment required')).rejects.toMatchObject({ kind: 'quota' });
      // What the free plan's hard cap answers is not documented (2026-09-09): a code or message naming the allowance is read as quota
      await expect(bad(403, 'quota_exceeded', 'Monthly character allowance used up')).rejects.toMatchObject({ kind: 'quota', message: /allowance/ });
      await expect(bad(429, 'usage_limit_reached', 'Plan limit reached')).rejects.toMatchObject({ kind: 'quota' });
    });

    it('reports a refusal without a readable body by its status alone', async () => {
      await expect(provider(vi.fn(async () => new Response('<html>', { status: 503 }))).synthesize('Hi', GEORGE)).rejects.toMatchObject({ kind: 'unknown', message: /HTTP 503/ });
    });

    it('reports a reply without audio, one that is not JSON, or one whose audio is not base64 as an error', async () => {
      await expect(provider(vi.fn(async () => Response.json({ speech_marks: marks([]) }))).synthesize('Hi', GEORGE)).rejects.toMatchObject({ kind: 'unknown', message: /no audio/ });
      await expect(provider(vi.fn(async () => new Response('not json', { status: 200 }))).synthesize('Hi', GEORGE)).rejects.toMatchObject({ kind: 'unknown', message: /not JSON/ });
      await expect(provider(vi.fn(async () => Response.json({ audio_data: '@@@', audio_format: 'mp3' }))).synthesize('Hi', GEORGE)).rejects.toMatchObject({ kind: 'unknown', message: /base64/ });
    });

    it('reports an unreachable server as network', async () => {
      const fetchImpl = vi.fn(async () => {
        throw new TypeError('NetworkError');
      });
      await expect(provider(fetchImpl).synthesize('Hi', GEORGE)).rejects.toMatchObject({ kind: 'network' });
    });

    // The Free plan allows one request at a time and one per second; a 429 says how long to wait (measured 2026-09-09)
    it('waits what Retry-After says on a 429 and asks again, and the note counts the waits', async () => {
      waits = [];
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(refusal(429, 'concurrency_limit_reached', 'Concurrency limit exceeded', { 'Retry-After': '1' }))
        .mockResolvedValueOnce(refusal(429, 'rate_limited', 'Rate limit exceeded', { 'Retry-After': '3' }))
        .mockResolvedValueOnce(reply([['Hi', 0, 2, 0, 300]]));
      const result = await provider(fetchImpl).synthesize('Hi', GEORGE);
      expect(fetchImpl).toHaveBeenCalledTimes(3);
      expect(waits).toEqual([1000, 3000]);
      expect(result.note).toBe(`${MODEL_ENGLISH} after 2 rate-limit waits`);
    });

    it('waits a second without a Retry-After, never more than five with one, and gives up as rate-limit after three waits', async () => {
      waits = [];
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(refusal(429, 'rate_limited', 'Rate limit exceeded'))
        .mockResolvedValueOnce(refusal(429, 'rate_limited', 'Rate limit exceeded', { 'Retry-After': '60' }))
        .mockResolvedValueOnce(refusal(429, 'rate_limited', 'Rate limit exceeded', { 'Retry-After': '0' }))
        .mockResolvedValueOnce(refusal(429, 'rate_limited', 'Rate limit exceeded'));
      await expect(provider(fetchImpl).synthesize('Hi', GEORGE)).rejects.toMatchObject({ kind: 'rate-limit', message: /429.*Rate limit exceeded/ });
      expect(fetchImpl).toHaveBeenCalledTimes(4);
      expect(waits).toEqual([1000, 5000, 1000]);
    });

    it('retries a 5xx once, after the pause, and says so in the note', async () => {
      waits = [];
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(refusal(502, 'upstream_failure', 'Bad Gateway'))
        .mockResolvedValueOnce(reply([['Hi', 0, 2, 0, 300]]));
      const result = await provider(fetchImpl).synthesize('Hi', GEORGE);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(waits).toEqual([500]);
      expect(result.note).toBe(`${MODEL_ENGLISH} after a retry of HTTP 502`);
    });

    it('gives up after the one retry, quoting the second refusal, and never retries a refusal below 500', async () => {
      waits = [];
      const twice = vi.fn().mockResolvedValueOnce(refusal(502, 'upstream_failure', 'first')).mockResolvedValueOnce(refusal(500, 'internal', 'second'));
      await expect(provider(twice).synthesize('Hi', GEORGE)).rejects.toMatchObject({ kind: 'unknown', message: /500.*second/ });
      expect(twice).toHaveBeenCalledTimes(2);
      const once = vi.fn(async () => refusal(400, 'validation_failed', 'bad'));
      await expect(provider(once).synthesize('Hi', GEORGE)).rejects.toMatchObject({ kind: 'unknown' });
      expect(once).toHaveBeenCalledTimes(1);
    });

    it('sends one request at a time: the second waits for the first reply, whoever asked first goes first', async () => {
      const first = deferred<Response>();
      const fetchImpl = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce(reply([['Two', 0, 3, 0, 300]]));
      const p = provider(fetchImpl);
      const one = p.synthesize('One', GEORGE);
      const two = p.synthesize('Two', GEORGE);
      await new Promise((r) => setTimeout(r, 0));
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(call(fetchImpl, 0).body.input).toBe('One');
      first.resolve(reply([['One', 0, 3, 0, 300]]));
      await one;
      await two;
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(call(fetchImpl, 1).body.input).toBe('Two');
    });

    it('shares the queue between instances, since a provider is built per call', async () => {
      const queue = new SerialQueue();
      const first = deferred<Response>();
      const fetchImpl = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce(reply([]));
      const one = provider(fetchImpl, {}, { queue }).synthesize('One', GEORGE);
      const two = provider(fetchImpl, {}, { queue }).synthesize('Two', GEORGE);
      await new Promise((r) => setTimeout(r, 0));
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      first.resolve(reply([]));
      await Promise.all([one, two]);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it('drops a request whose signal was aborted while it waited, unsent, and goes on with the next', async () => {
      const first = deferred<Response>();
      const fetchImpl = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce(reply([]));
      const p = provider(fetchImpl);
      const aborter = new AbortController();
      const one = p.synthesize('One', GEORGE);
      const two = p.synthesize('Two', { voice: GEORGE.voice, signal: aborter.signal });
      const three = p.synthesize('Three', GEORGE);
      aborter.abort();
      first.resolve(reply([]));
      await one;
      await expect(two).rejects.toMatchObject({ kind: 'unknown', message: /aborted/ });
      await three;
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(call(fetchImpl, 1).body.input).toBe('Three');
    });

    // The route takes 2,000 characters at most (400 "Field input must not exceed 2000 characters", 2026-09-09)
    it('splits a segment over the cap, asks for PCM piece by piece, joins the pieces into one WAV and shifts the later words', async () => {
      const piece1 = 'First sentence. '.repeat(125); // 2,000 characters, the cap exactly
      const piece2 = 'Second sentence here.';
      const text = piece1 + piece2;
      const pcm = (samples: number) => new Uint8Array(samples * 2).fill(1);
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(reply([['First', 0, 5, 0, 200]], pcm(24_000), 'pcm')) // one second of audio
        .mockResolvedValueOnce(reply([['Second', 0, 6, 100, 400]], pcm(12_000), 'pcm'));
      const result = await provider(fetchImpl).synthesize(text, GEORGE);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(call(fetchImpl, 0).body).toMatchObject({ input: piece1, audio_format: 'pcm', output_format: 'pcm_24000', model: MODEL_ENGLISH });
      expect(call(fetchImpl, 1).body).toMatchObject({ input: piece2 });
      expect(result.audio.type).toBe('audio/wav');
      const bytes = new Uint8Array(await result.audio.arrayBuffer());
      expect(wavDataLength(bytes)).toBe(72_000);
      expect(new DataView(bytes.buffer).getUint32(24, true)).toBe(24_000);
      expect(result.timestamps).toEqual([
        { start: 0, end: 0.2, charStart: 0, charEnd: 5 },
        { start: 1.1, end: 1.4, charStart: piece1.length, charEnd: piece1.length + 6 },
      ]);
      expect(result.note).toBe(`${MODEL_ENGLISH} in 2 pieces`);
    });

    it('refuses a piece that did not come back as PCM instead of joining bytes of two kinds', async () => {
      const text = 'x '.repeat(1100);
      const fetchImpl = vi.fn(async () => reply([], MP3, 'mp3'));
      await expect(provider(fetchImpl).synthesize(text, GEORGE)).rejects.toMatchObject({ kind: 'unknown', message: /PCM/ });
    });
  });

  describe('checkSynthesis', () => {
    it('synthesizes two letters with the voice, through the same route, and discards the audio', async () => {
      const fetchImpl = vi.fn(async () => reply([['Hi', 0, 2, 0, 300]]));
      await expect(provider(fetchImpl).checkSynthesis!('hi-IN/aadi')).resolves.toBeUndefined();
      expect(call(fetchImpl).body).toMatchObject({ input: 'Hi', voice_id: 'aadi', model: MODEL_OTHER, language: 'hi-IN' });
    });

    it('rejects with the server\'s reason, so Test connection can show it', async () => {
      const fetchImpl = vi.fn(async () => refusal(402, 'payment_required', 'Payment required'));
      await expect(provider(fetchImpl).checkSynthesis!('en-US/george')).rejects.toMatchObject({ kind: 'quota' });
    });
  });
});
