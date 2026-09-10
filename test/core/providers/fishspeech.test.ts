import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_FISH_SPEECH_URL, createFishSpeechProvider, type FishSpeechConfig } from '../../../src/core/providers/fishspeech';

const cfg: FishSpeechConfig = { baseURL: 'http://h200:8080/v1/' };
function provider(fetchImpl: unknown, over: Partial<FishSpeechConfig> = {}) {
  return createFishSpeechProvider({ ...cfg, ...over }, { fetch: fetchImpl as typeof fetch });
}
const controller = new AbortController();
const VOICE = { voice: 'myvoice', signal: controller.signal };
const MP3 = new Uint8Array([0xff, 0xfb, 0x90, 0x01]);

const call = (fetchImpl: any, index = 0): { url: string; init: RequestInit & { headers: Record<string, string> }; body: any } => {
  const [url, init] = fetchImpl.mock.calls[index];
  return { url, init, body: init?.body ? JSON.parse(init.body as string) : undefined };
};

describe('listVoices', () => {
  it('asks the references list as JSON and offers every reference under the multilingual group', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ success: true, reference_ids: ['myvoice', 'narrator', '', 3], message: 'Found 4 reference voices' }));
    const voices = await provider(fetchImpl).listVoices({ signal: controller.signal });
    expect(voices).toEqual([
      { id: 'myvoice', label: 'myvoice', locale: 'mul' },
      { id: 'narrator', label: 'narrator', locale: 'mul' },
    ]);
    // The SDK's trailing /v1/ is tolerated: the paths carry their own
    expect(call(fetchImpl).url).toBe('http://h200:8080/v1/references/list');
    expect(call(fetchImpl).init.headers).toEqual({ Accept: 'application/json' });
    expect(call(fetchImpl).init.signal).toBe(controller.signal);
  });

  it('sends the extra headers with every request, a bearer token for a server started with --api-key included', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ success: true, reference_ids: [] }));
    await provider(fetchImpl, { headers: { Authorization: 'Bearer secret', 'CF-Access-Client-Id': 'x' } }).listVoices();
    expect(call(fetchImpl).init.headers).toEqual({ Authorization: 'Bearer secret', 'CF-Access-Client-Id': 'x', Accept: 'application/json' });
  });

  it('names the address when the server cannot be reached, and reports 401 as the credentials', async () => {
    const down = vi.fn(async () => {
      throw new TypeError('NetworkError when attempting to fetch resource.');
    });
    await expect(provider(down).listVoices()).rejects.toMatchObject({ kind: 'local-server-down', message: expect.stringContaining('http://h200:8080') });
    const refused = vi.fn(async () => Response.json({ status: 401, message: 'Invalid token' }, { status: 401 }));
    await expect(provider(refused).listVoices()).rejects.toMatchObject({ kind: 'auth' });
  });

  it('tells a server that is not Fish Speech from an empty one: a reply without reference_ids is a decode failure, a list of none is no voices', async () => {
    const other = vi.fn(async () => Response.json({ voices: [{ id: 'af_bella' }] }));
    await expect(provider(other).listVoices()).rejects.toMatchObject({ kind: 'decode-failed', message: expect.stringContaining('Fish Speech') });
    const msgpack = vi.fn(async () => new Response(new Uint8Array([0x82, 0xa7]), { headers: { 'content-type': 'application/msgpack' } }));
    await expect(provider(msgpack).listVoices()).rejects.toMatchObject({ kind: 'decode-failed' });
    expect(await provider(vi.fn(async () => Response.json({ success: true, reference_ids: [] }))).listVoices()).toEqual([]);
  });
});

describe('checkConnection', () => {
  it('asks the health route', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ status: 'ok' }));
    await provider(fetchImpl).checkConnection!();
    expect(call(fetchImpl).url).toBe('http://h200:8080/v1/health');
    await expect(provider(vi.fn(async () => new Response('', { status: 500 }))).checkConnection!()).rejects.toMatchObject({ kind: 'unknown', message: expect.stringContaining('500') });
  });
});

describe('synthesize', () => {
  it('asks /v1/tts for MP3 with the reference, in JSON, and answers the bytes with no word timestamps', async () => {
    const fetchImpl = vi.fn(async () => new Response(MP3, { headers: { 'content-type': 'audio/mpeg', 'content-disposition': 'attachment; filename=audio.mp3' } }));
    const result = await provider(fetchImpl).synthesize('Hello world.', VOICE);
    const { url, init, body } = call(fetchImpl);
    expect(url).toBe('http://h200:8080/v1/tts');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(init.signal).toBe(controller.signal);
    expect(body).toEqual({ text: 'Hello world.', reference_id: 'myvoice', format: 'mp3', normalize: true, use_memory_cache: 'on' });
    expect(result.timestamps).toBeUndefined();
    expect(result.audio.type).toBe('audio/mpeg');
    expect([...new Uint8Array(await result.audio.arrayBuffer())]).toEqual([...MP3]);
  });

  it('quotes the server\'s reason on a refusal', async () => {
    const fetchImpl = vi.fn(async () => new Response('Text is too long, max length is 500', { status: 400 }));
    await expect(provider(fetchImpl).synthesize('Hello', VOICE)).rejects.toMatchObject({ kind: 'unknown', message: expect.stringContaining('max length is 500') });
    await expect(provider(vi.fn(async () => new Response('', { status: 403 }))).synthesize('Hello', VOICE)).rejects.toMatchObject({ kind: 'auth' });
  });

  it('sends nothing for text with no letter or digit and answers empty audio, which plays as a pause', async () => {
    const fetchImpl = vi.fn();
    const result = await provider(fetchImpl).synthesize('* * *', VOICE);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.audio.size).toBe(0);
  });

  it('is the fishspeech provider, without word timestamps, at port 8080 by default', () => {
    const p = provider(vi.fn());
    expect(p.id).toBe('fishspeech');
    expect(p.capabilities.wordTimestamps).toBe(false);
    expect(DEFAULT_FISH_SPEECH_URL).toBe('http://localhost:8080');
  });
});
