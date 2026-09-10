import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_VOICE,
  FISH_API,
  MODEL_FREE,
  MODEL_PAID,
  MP3_BITRATE,
  PAGE_SIZE,
  RATE_LIMIT_RETRIES,
  RETRY_DELAY_MS,
  createFishProvider,
  decodeFishVoice,
  fishReason,
  fishVoice,
  fishVoiceIds,
  localeOfLanguages,
  mergeEvents,
  parseEventStream,
  type FishConfig,
  type FishDeps,
} from '../../../src/core/providers/fish';

const cfg: FishConfig = { apiKey: 'sk-fish-test', freeOnly: true, voices: '' };

/** Every wait is skipped in the tests; `waits` keeps what was asked for. */
let waits: number[] = [];
function provider(fetchImpl: unknown, over: Partial<FishConfig> = {}, deps: Partial<FishDeps> = {}) {
  return createFishProvider({ ...cfg, ...over }, { fetch: fetchImpl as typeof fetch, wait: async (ms) => void waits.push(ms), ...deps });
}

const controller = new AbortController();
const ID_A = 'a'.repeat(32);
const ID_B = 'b'.repeat(32);
const ID_C = 'c'.repeat(32);
const NARRATOR = { voice: `en/${ID_A}`, signal: controller.signal };
const DEFAULT = { voice: `mul/${DEFAULT_VOICE}`, signal: controller.signal };

/** A model as `GET /model` lists it (measured 2026-09-10): the fields the plugin reads, and some it does not. */
const model = (_id: string, title: string, languages: string[] = ['en']) => ({
  _id,
  type: 'tts',
  title,
  description: '',
  languages,
  tags: [],
  like_count: 1,
  task_count: 2,
  visibility: 'public',
  state: 'trained',
  samples: [],
});
const page = (items: unknown[], has_more = false) =>
  Response.json({ max_offset: 10000, accessible_upper_bound: 0, window_limited: false, total_is_exact: true, total: items.length, items, has_more });
/** A refusal in Fish's shape, plus whatever header the gateway adds. */
const refusal = (status: number, message: string, headers: Record<string, string> = {}) => Response.json({ status, message }, { status, headers });

const MP3_A = new Uint8Array([0xff, 0xfb, 0x90, 0x01]);
const MP3_B = new Uint8Array([0x02, 0x03]);
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
type Seg = [string, number, number];
/** One event of the timestamp route: a chunk of the audio and the latest alignment snapshot of a text chunk (the docs' shape, measured 2026-09-10). */
const event = (audio: Uint8Array | null, segments: Seg[] | null, chunk_seq = 0, chunk_audio_offset_sec = 0, content = '') =>
  JSON.stringify({
    audio_base64: audio ? b64(audio) : '',
    content,
    chunk_seq,
    chunk_audio_offset_sec,
    alignment: segments ? { audio_duration: segments.at(-1)?.[2] ?? 0, segments: segments.map(([text, start, end]) => ({ text, start, end })) } : null,
  });
const stream = (...events: string[]) => new Response(events.map((e) => `data: ${e}\n\n`).join(''), { status: 200, headers: { 'content-type': 'text/event-stream' } });

const call = (fetchImpl: any, index = 0): { url: string; init: RequestInit & { headers: Record<string, string> }; body: any } => {
  const [url, init] = fetchImpl.mock.calls[index];
  return { url, init, body: init?.body ? JSON.parse(init.body as string) : undefined };
};

describe('fishVoiceIds', () => {
  it('finds every 32-hex id in what was pasted — ids, links, any separator — once each, lowercased', () => {
    const text = `https://fish.audio/m/${ID_A}/ , ${ID_B.toUpperCase()}\n${ID_A} ; https://fish.audio/m/${ID_C}`;
    expect(fishVoiceIds(text)).toEqual([ID_A, ID_B, ID_C]);
  });

  it('finds nothing in an empty field or in text without an id', () => {
    expect(fishVoiceIds('')).toEqual([]);
    expect(fishVoiceIds('alloy, nova')).toEqual([]);
  });
});

describe('localeOfLanguages', () => {
  it('files a voice with one language under it and one with several, or none, under the multilingual group', () => {
    expect(localeOfLanguages(['en'])).toBe('en');
    expect(localeOfLanguages(['ZH'])).toBe('zh');
    expect(localeOfLanguages(['es', 'en'])).toBe('mul');
    expect(localeOfLanguages([])).toBe('mul');
    expect(localeOfLanguages(undefined)).toBe('mul');
    expect(localeOfLanguages(['not a code'])).toBe('mul');
  });
});

describe('fishVoice', () => {
  it('keeps the locale in the id and names the voice by its title', () => {
    expect(fishVoice(model(ID_A, 'jjk narrator'))).toEqual({ id: `en/${ID_A}`, label: 'jjk narrator', locale: 'en' });
    expect(fishVoice(model(ID_B, 'Bilingüe', ['es', 'en']))).toEqual({ id: `mul/${ID_B}`, label: 'Bilingüe', locale: 'mul' });
  });

  it('names a voice by its id without a title, and answers null for an entry without an id', () => {
    expect(fishVoice({ _id: ID_A, languages: ['ja'] })).toEqual({ id: `ja/${ID_A}`, label: ID_A, locale: 'ja' });
    expect(fishVoice({ title: 'Nobody' })).toBeNull();
  });
});

describe('decodeFishVoice', () => {
  it('splits a published id into its locale and model id, the default voice included', () => {
    expect(decodeFishVoice(`en/${ID_A}`)).toEqual({ locale: 'en', id: ID_A });
    expect(decodeFishVoice(`mul/${DEFAULT_VOICE}`)).toEqual({ locale: 'mul', id: DEFAULT_VOICE });
  });

  it('answers null for anything else', () => {
    expect(decodeFishVoice(ID_A)).toBeNull();
    expect(decodeFishVoice('en/')).toBeNull();
    expect(decodeFishVoice('en/alloy')).toBeNull();
    expect(decodeFishVoice(`not a locale/${ID_A}`)).toBeNull();
  });
});

describe('parseEventStream', () => {
  it('reads the JSON of every data line and skips comments, other fields, blank lines and a line that is not JSON', () => {
    const body = `: keep-alive\n\nevent: message\ndata: {"chunk_seq":0}\n\ndata: not json\n\ndata: {"chunk_seq":1}\r\n\r\n`;
    expect(parseEventStream(body)).toEqual([{ chunk_seq: 0 }, { chunk_seq: 1 }]);
  });
});

describe('mergeEvents', () => {
  it('concatenates the audio chunks in order, keeps the latest snapshot per text chunk, and moves each chunk by its offset', () => {
    const events = parseEventStream(
      [
        event(MP3_A, null, 0),
        event(null, [['Hello', 0, 0.4]], 0),
        event(MP3_B, [['Hello', 0, 0.4], ['world', 0.4, 0.86]], 0),
        event(null, null, 1, 1),
        event(null, [['again', 0.1, 0.5]], 1, 1),
      ]
        .map((e) => `data: ${e}\n\n`)
        .join(''),
    );
    const merged = mergeEvents(events);
    expect([...merged.audio]).toEqual([...MP3_A, ...MP3_B]);
    expect(merged.words).toEqual([
      { text: 'Hello', start: 0, end: 0.4 },
      { text: 'world', start: 0.4, end: 0.86 },
      { text: 'again', start: 1.1, end: 1.5 },
    ]);
    expect(merged.chunks).toBe(2);
  });

  it('skips a segment without a text or with times that are not numbers, and an event without audio', () => {
    const events = [
      { audio_base64: '', chunk_seq: 0, chunk_audio_offset_sec: 0, alignment: { audio_duration: 1, segments: [{ text: 'a', start: 0, end: 0.5 }, { text: '', start: 0.5, end: 0.6 }, { text: 'b', start: '0.6', end: 1 }, { text: 'c', start: 0.9, end: 0.7 }, null] } },
    ];
    expect(mergeEvents(events).words).toEqual([{ text: 'a', start: 0, end: 0.5 }]);
    expect(mergeEvents(events).audio.length).toBe(0);
  });

  it('throws on audio that is not base64', () => {
    expect(() => mergeEvents([{ audio_base64: '***', chunk_seq: 0 }])).toThrow();
  });
});

describe('fishReason', () => {
  it('reads the message of a refusal, and nothing from any other body', () => {
    expect(fishReason(JSON.stringify({ status: 400, message: 'Reference  not\nfound' }))).toBe('Reference not found');
    expect(fishReason('No permission -- see authorization schemes')).toBe('');
  });
});

describe('listVoices', () => {
  it('lists the account\'s own voices page by page under their locales, then the default voice', async () => {
    const fetchImpl = vi.fn(async (url: string) => (url.includes('page_number=1') ? page([model(ID_A, 'jjk narrator'), model(ID_B, '中文', ['zh'])], true) : page([model(ID_C, 'Both', ['es', 'en'])])));
    const voices = await provider(fetchImpl).listVoices({ signal: controller.signal });
    expect(voices).toEqual([
      { id: `en/${ID_A}`, label: 'jjk narrator', locale: 'en' },
      { id: `zh/${ID_B}`, label: '中文', locale: 'zh' },
      { id: `mul/${ID_C}`, label: 'Both', locale: 'mul' },
      { id: `mul/${DEFAULT_VOICE}`, label: 'Default', locale: 'mul' },
    ]);
    expect(call(fetchImpl).url).toBe(`${FISH_API}/model?self=true&page_size=${PAGE_SIZE}&page_number=1`);
    expect(call(fetchImpl).init.headers.Authorization).toBe('Bearer sk-fish-test');
    expect(call(fetchImpl).init.signal).toBe(controller.signal);
    expect(call(fetchImpl, 1).url).toBe(`${FISH_API}/model?self=true&page_size=${PAGE_SIZE}&page_number=2`);
  });

  it('resolves the pasted ids one by one, skips those the account owns, and lists an id the library does not know as not found', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('self=true')) return page([model(ID_A, 'Own')]);
      if (url.endsWith(`/model/${ID_B}`)) return Response.json(model(ID_B, 'Paddington', ['en']));
      if (url.endsWith(`/model/${ID_C}`)) return refusal(404, 'Model not found');
      throw new Error(`unexpected ${url}`);
    });
    const voices = await provider(fetchImpl, { voices: `https://fish.audio/m/${ID_B}/ ${ID_A} ${ID_C}` }).listVoices();
    expect(voices.map((v) => v.label)).toEqual(['Own', 'Paddington', `${ID_C} (not found)`, 'Default']);
    expect(voices[2]).toEqual({ id: `mul/${ID_C}`, label: `${ID_C} (not found)`, locale: 'mul' });
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([`${FISH_API}/model?self=true&page_size=${PAGE_SIZE}&page_number=1`, `${FISH_API}/model/${ID_B}`, `${FISH_API}/model/${ID_C}`]);
  });

  it('reports a wrong key as an auth error — the list answers 401 in plain text', async () => {
    const fetchImpl = vi.fn(async () => new Response('No permission -- see authorization schemes', { status: 401 }));
    await expect(provider(fetchImpl).listVoices()).rejects.toMatchObject({ kind: 'auth', message: expect.stringContaining('No permission') });
  });

  it('asks nothing without a key', async () => {
    const fetchImpl = vi.fn();
    await expect(provider(fetchImpl, { apiKey: ' ' }).listVoices()).rejects.toMatchObject({ kind: 'no-key' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports a server that cannot be reached as a network error', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('NetworkError');
    });
    await expect(provider(fetchImpl).listVoices()).rejects.toMatchObject({ kind: 'network' });
  });
});

describe('synthesize', () => {
  it('asks the timestamp route for MP3 at 64 kbps on the free model, and aligns the stream\'s words to the text', async () => {
    const fetchImpl = vi.fn(async () => stream(event(MP3_A, null), event(MP3_B, [['Hello', 0, 0.4], ['world', 0.4, 0.86]])));
    const result = await provider(fetchImpl).synthesize('Hello, world!', NARRATOR);
    const { url, init, body } = call(fetchImpl);
    expect(url).toBe(`${FISH_API}/v1/tts/stream/with-timestamp`);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ Authorization: 'Bearer sk-fish-test', 'Content-Type': 'application/json', model: MODEL_FREE });
    expect(init.signal).toBe(controller.signal);
    expect(body).toEqual({ text: 'Hello, world!', reference_id: ID_A, format: 'mp3', mp3_bitrate: MP3_BITRATE, latency: 'normal' });
    expect(result.audio.type).toBe('audio/mpeg');
    expect([...new Uint8Array(await result.audio.arrayBuffer())]).toEqual([...MP3_A, ...MP3_B]);
    expect(result.timestamps).toEqual([
      { start: 0, end: 0.4, charStart: 0, charEnd: 5 },
      { start: 0.4, end: 0.86, charStart: 7, charEnd: 12 },
    ]);
    expect(result.note).toBe(MODEL_FREE);
  });

  it('names the paid model in the header when the switch is off, and sends no reference for the default voice', async () => {
    const fetchImpl = vi.fn(async () => stream(event(MP3_A, [['Hi', 0, 0.3]])));
    await provider(fetchImpl, { freeOnly: false }).synthesize('Hi', DEFAULT);
    expect(call(fetchImpl).init.headers.model).toBe(MODEL_PAID);
    expect(call(fetchImpl).body).toEqual({ text: 'Hi', format: 'mp3', mp3_bitrate: MP3_BITRATE, latency: 'normal' });
  });

  it('moves a later text chunk\'s words by its offset and counts the chunks in the note', async () => {
    const fetchImpl = vi.fn(async () => stream(event(MP3_A, [['One', 0, 0.5]], 0, 0), event(MP3_B, [['two', 0.1, 0.4]], 1, 0.5)));
    const result = await provider(fetchImpl).synthesize('One two', NARRATOR);
    expect(result.timestamps).toEqual([
      { start: 0, end: 0.5, charStart: 0, charEnd: 3 },
      { start: 0.6, end: 0.9, charStart: 4, charEnd: 7 },
    ]);
    expect(result.note).toBe(`${MODEL_FREE}, 2 chunks`);
  });

  it('falls back to the sentence with a note when no event carried an alignment', async () => {
    const fetchImpl = vi.fn(async () => stream(event(MP3_A, null), event(MP3_B, null)));
    const result = await provider(fetchImpl).synthesize('Hello', NARRATOR);
    expect(result.timestamps).toBeUndefined();
    expect(result.note).toBe(`${MODEL_FREE}: no word timings in the stream`);
    expect([...new Uint8Array(await result.audio.arrayBuffer())]).toEqual([...MP3_A, ...MP3_B]);
  });

  it('falls back to the sentence when none of the stream\'s words is in the text', async () => {
    const fetchImpl = vi.fn(async () => stream(event(MP3_A, [['completely', 0, 0.5], ['different', 0.5, 1]])));
    const result = await provider(fetchImpl).synthesize('Hello', NARRATOR);
    expect(result.timestamps).toBeUndefined();
    expect(result.note).toContain('none of the 2 words');
  });

  it('is an error when the stream carried no audio', async () => {
    const fetchImpl = vi.fn(async () => stream(event(null, [['Hello', 0, 0.4]])));
    await expect(provider(fetchImpl).synthesize('Hello', NARRATOR)).rejects.toMatchObject({ kind: 'unknown', message: expect.stringContaining('no audio') });
  });

  it('is an error when a 200 is not an event stream at all', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ ok: true }));
    await expect(provider(fetchImpl).synthesize('Hello', NARRATOR)).rejects.toMatchObject({ kind: 'unknown' });
  });

  it('sends nothing for text with no letter or digit and answers empty audio, which plays as a pause', async () => {
    const fetchImpl = vi.fn();
    const result = await provider(fetchImpl).synthesize('* * *', NARRATOR);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.audio.size).toBe(0);
    expect(result.note).toBe('no speakable text');
  });

  it('refuses a voice id it did not publish', async () => {
    const fetchImpl = vi.fn();
    await expect(provider(fetchImpl).synthesize('Hi', { voice: 'alloy', signal: controller.signal })).rejects.toMatchObject({ kind: 'unknown' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports 401 as the key, 402 as the credit, and a 400 with the server\'s reason', async () => {
    await expect(provider(vi.fn(async () => refusal(401, 'Invalid Token'))).synthesize('Hi', NARRATOR)).rejects.toMatchObject({ kind: 'auth', message: expect.stringContaining('Invalid Token') });
    const credit = 'Insufficient API credit. API credit is managed independently from platform credit.';
    await expect(provider(vi.fn(async () => refusal(402, credit, { 'x-fish-error-code': 'insufficient_balance' })), { freeOnly: false }).synthesize('Hi', NARRATOR)).rejects.toMatchObject({ kind: 'quota', message: expect.stringContaining('Insufficient API credit') });
    await expect(provider(vi.fn(async () => refusal(400, 'Reference not found'))).synthesize('Hi', NARRATOR)).rejects.toMatchObject({ kind: 'unknown', message: `Fish Audio ${MODEL_FREE}: HTTP 400 — Reference not found` });
  });

  it('reads the gateway\'s balance header as the credit whatever the status', async () => {
    await expect(provider(vi.fn(async () => refusal(403, 'nope', { 'x-fish-error-code': 'insufficient_balance' }))).synthesize('Hi', NARRATOR)).rejects.toMatchObject({ kind: 'quota' });
  });

  it('waits what a 429 asks and tries again, then reports the rate limit', async () => {
    waits = [];
    const fetchImpl = vi.fn(async () => refusal(429, 'Too many requests', { 'Retry-After': '2' }));
    await expect(provider(fetchImpl).synthesize('Hi', NARRATOR)).rejects.toMatchObject({ kind: 'rate-limit' });
    expect(fetchImpl).toHaveBeenCalledTimes(RATE_LIMIT_RETRIES + 1);
    expect(waits).toEqual([2000, 2000, 2000]);
  });

  it('asks once more after a 5xx, and says so in the note', async () => {
    waits = [];
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response('Bad Gateway', { status: 502 })).mockResolvedValueOnce(stream(event(MP3_A, [['Hi', 0, 0.3]])));
    const result = await provider(fetchImpl).synthesize('Hi', NARRATOR);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(waits).toEqual([RETRY_DELAY_MS]);
    expect(result.note).toBe(`${MODEL_FREE} after a retry of HTTP 502`);
    await expect(provider(vi.fn(async () => new Response('down', { status: 503 }))).synthesize('Hi', NARRATOR)).rejects.toMatchObject({ kind: 'unknown', message: expect.stringContaining('503') });
  });

  it('reports a server that cannot be reached as a network error', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('NetworkError when attempting to fetch resource.');
    });
    await expect(provider(fetchImpl).synthesize('Hi', NARRATOR)).rejects.toMatchObject({ kind: 'network', message: expect.stringContaining('api.fish.audio') });
  });
});

describe('the checks', () => {
  it('proves the key with the own-voices list, one entry', async () => {
    const fetchImpl = vi.fn(async () => page([]));
    await provider(fetchImpl).checkConnection!();
    expect(call(fetchImpl).url).toBe(`${FISH_API}/model?self=true&page_size=1`);
    await expect(provider(vi.fn(async () => new Response('No permission -- see authorization schemes', { status: 401 }))).checkConnection!()).rejects.toMatchObject({ kind: 'auth' });
  });

  it('proves the account can synthesize with two letters on the voice, through the timestamp route', async () => {
    const fetchImpl = vi.fn(async () => stream(event(MP3_A, [['Hi', 0, 0.3]])));
    await provider(fetchImpl).checkSynthesis!(NARRATOR.voice);
    expect(call(fetchImpl).url).toBe(`${FISH_API}/v1/tts/stream/with-timestamp`);
    expect(call(fetchImpl).body.text).toBe('Hi');
  });

  it('is the fish provider, with word timestamps', () => {
    const p = provider(vi.fn());
    expect(p.id).toBe('fish');
    expect(p.capabilities.wordTimestamps).toBe(true);
  });
});
