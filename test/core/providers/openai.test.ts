import { describe, expect, it, vi } from 'vitest';
import { SynthesisError } from '../../../src/core/providers/errors';
import {
  createOpenAIProvider,
  OPENAI_DEFAULT_VOICES,
  parseModelList,
  parseVoiceIds,
  parseVoiceList,
} from '../../../src/core/providers/openai';
import { MULTILINGUAL } from '../../../src/core/providers/types';

const cfg = {
  apiKey: 'sk-test',
  baseURL: 'https://api.openai.com',
  model: 'gpt-4o-mini-tts',
};

function provider(fetchImpl: unknown, over: Partial<typeof cfg & { voices: string }> = {}) {
  return createOpenAIProvider({ ...cfg, ...over }, { fetch: fetchImpl as typeof fetch });
}

const signalController = new AbortController();
const opts = { voice: 'alloy', speed: 1, signal: signalController.signal };

const notFound = () => new Response('', { status: 404 });

describe('createOpenAIProvider', () => {
  it('declares that it cannot produce word timestamps', () => {
    expect(provider(vi.fn()).capabilities.wordTimestamps).toBe(false);
  });

  it('posts the text to the speech endpoint and returns the audio', async () => {
    const fetchImpl = vi.fn(async () => new Response(new Blob(['audio-bytes']), { status: 200 }));
    const result = await provider(fetchImpl).synthesize('Hello there', opts);

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = (fetchImpl as any).mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/audio/speech');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer sk-test');
    expect(init.signal).toBe(signalController.signal);
    expect(JSON.parse(init.body)).toEqual({
      model: 'gpt-4o-mini-tts',
      voice: 'alloy',
      input: 'Hello there',
      speed: 1,
      response_format: 'mp3',
    });
    expect(await result.audio.text()).toBe('audio-bytes');
    expect('timestamps' in result).toBe(false);
  });

  it('refuses to synthesize without a key', async () => {
    const fetchImpl = vi.fn();
    await expect(provider(fetchImpl, { apiKey: '' }).synthesize('Hi', opts)).rejects.toMatchObject({ kind: 'no-key' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('maps failures to typed errors', async () => {
    const cases: [() => Promise<Response>, string][] = [
      [async () => new Response('', { status: 429 }), 'rate-limit'],
      [async () => new Response('', { status: 401 }), 'auth'],
      [async () => new Response('', { status: 500 }), 'unknown'],
      [
        async () => {
          throw new TypeError('NetworkError');
        },
        'network',
      ],
    ];
    for (const [fetchImpl, kind] of cases) {
      await expect(provider(vi.fn(fetchImpl)).synthesize('Hi', opts)).rejects.toMatchObject({ kind });
    }
  });

  // The OpenAI SDK documents base_url="http://localhost:8880/v1"; written
  // that way the plugin must not request /v1/v1/audio/speech
  it("accepts a base URL written with the SDK's /v1 suffix", async () => {
    const fetchImpl = vi.fn(async () => new Response(new Blob(['x']), { status: 200 }));
    await provider(fetchImpl, { baseURL: 'http://localhost:8880/v1/' }).synthesize('Hi', opts);
    expect((fetchImpl as any).mock.calls[0][0]).toBe('http://localhost:8880/v1/audio/speech');
  });
});

// Many servers speak OpenAI's API with their own voices; OpenAI's names must
// only be a last resort, never assumed
describe('listVoices', () => {
  it('uses the voices the user typed, without asking the server', async () => {
    const fetchImpl = vi.fn();
    const voices = await provider(fetchImpl, { voices: 'af_bella, zf_xiaobei;am_adam\naf_bella' }).listVoices();
    expect(voices).toEqual([
      { id: 'af_bella', label: 'af_bella', locale: MULTILINGUAL },
      { id: 'zf_xiaobei', label: 'zf_xiaobei', locale: MULTILINGUAL },
      { id: 'am_adam', label: 'am_adam', locale: MULTILINGUAL },
    ]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('otherwise asks the server for its voice list, with the key', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ voices: [{ id: 'af_bella', name: 'Bella' }, { id: 'am_adam' }] }));
    const voices = await provider(fetchImpl, { baseURL: 'http://localhost:8880' }).listVoices();
    const [url, init] = (fetchImpl as any).mock.calls[0];
    expect(url).toBe('http://localhost:8880/v1/audio/voices');
    expect(init.headers.Authorization).toBe('Bearer sk-test');
    expect(voices).toEqual([
      { id: 'af_bella', label: 'Bella', locale: MULTILINGUAL },
      { id: 'am_adam', label: 'am_adam', locale: MULTILINGUAL },
    ]);
  });

  it("falls back to OpenAI's documented voices when the server has no voice list", async () => {
    const voices = await provider(vi.fn(notFound)).listVoices();
    expect(voices.map((v) => v.id)).toEqual([...OPENAI_DEFAULT_VOICES]);
    for (const voice of voices) expect(voice.locale).toBe(MULTILINGUAL);
  });

  it('falls back as well when the route answers something unusable', async () => {
    for (const fetchImpl of [
      vi.fn(async () => new Response('<html>', { status: 200 })),
      vi.fn(async () => Response.json({ voices: [] })),
      vi.fn(async () => Response.json({ unrelated: true })),
    ]) {
      const voices = await provider(fetchImpl).listVoices();
      expect(voices).toHaveLength(OPENAI_DEFAULT_VOICES.length);
    }
  });

  it('reports a rejected key rather than listing default voices for it', async () => {
    await expect(provider(vi.fn(async () => new Response('', { status: 401 }))).listVoices()).rejects.toMatchObject({ kind: 'auth' });
  });

  it('reports an unreachable server rather than listing default voices for it', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('NetworkError');
    });
    await expect(provider(fetchImpl).listVoices()).rejects.toMatchObject({ kind: 'network' });
  });
});

describe('listModels / checkConnection', () => {
  it('asks the server for its model list, with the key', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ data: [{ id: 'tts-1' }, { id: 'gpt-4o-mini-tts' }] }));
    const models = await provider(fetchImpl).listModels!();
    const [url, init] = (fetchImpl as any).mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/models');
    expect(init.headers.Authorization).toBe('Bearer sk-test');
    expect(models).toEqual(['tts-1', 'gpt-4o-mini-tts']);
  });

  it('reports a rejected key', async () => {
    for (const status of [401, 403]) {
      const fetchImpl = vi.fn(async () => new Response('', { status }));
      await expect(provider(fetchImpl).listModels!()).rejects.toMatchObject({ kind: 'auth' });
      await expect(provider(fetchImpl).checkConnection!()).rejects.toMatchObject({ kind: 'auth' });
    }
  });

  it('reports an unreachable server', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('NetworkError when attempting to fetch resource.');
    });
    await expect(provider(fetchImpl).checkConnection!()).rejects.toMatchObject({ kind: 'network' });
  });

  it('reports any other failure with its status', async () => {
    await expect(provider(vi.fn(async () => new Response('', { status: 500 }))).listModels!()).rejects.toThrow(/500/);
  });

  it('reports a missing key without calling the server', async () => {
    const fetchImpl = vi.fn();
    await expect(provider(fetchImpl, { apiKey: '' }).listModels!()).rejects.toMatchObject({ kind: 'no-key' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('tolerates a model list that is not JSON', async () => {
    expect(await provider(vi.fn(async () => new Response('ok', { status: 200 }))).listModels!()).toEqual([]);
  });
});

describe('parsers', () => {
  it('parseVoiceIds splits on commas, semicolons and whitespace and drops duplicates', () => {
    expect(parseVoiceIds(' a, b;c\nd  a ')).toEqual(['a', 'b', 'c', 'd']);
    expect(parseVoiceIds('')).toEqual([]);
  });

  it('parseVoiceList reads the shapes OpenAI-compatible servers use', () => {
    expect(parseVoiceList({ voices: [{ id: 'x', name: 'X' }] })).toEqual([{ id: 'x', label: 'X' }]);
    expect(parseVoiceList({ voices: ['x', 'y'] })).toEqual([{ id: 'x', label: 'x' }, { id: 'y', label: 'y' }]);
    expect(parseVoiceList({ data: [{ voice_id: 'v' }] })).toEqual([{ id: 'v', label: 'v' }]);
    expect(parseVoiceList(['a'])).toEqual([{ id: 'a', label: 'a' }]);
    expect(parseVoiceList({ voices: [{ name: 'only-name' }, {}, 7, ''] })).toEqual([{ id: 'only-name', label: 'only-name' }]);
    expect(parseVoiceList(null)).toEqual([]);
  });

  it('parseModelList reads OpenAI-style and bare lists', () => {
    expect(parseModelList({ data: [{ id: 'a' }, { id: 'a' }, { id: 'b' }] })).toEqual(['a', 'b']);
    expect(parseModelList({ models: ['m'] })).toEqual(['m']);
    expect(parseModelList(['x', { id: 'y' }, 3])).toEqual(['x', 'y']);
    expect(parseModelList('nope')).toEqual([]);
  });
});

describe('SynthesisError', () => {
  it('carries the auth kind', () => {
    expect(new SynthesisError('auth').kind).toBe('auth');
  });
});

describe('checkSynthesis', () => {
  it('posts a tiny request to the speech endpoint with the configured model', async () => {
    const fetchImpl = vi.fn(async () => new Response(new Blob(['mp3']), { status: 200 }));
    await provider(fetchImpl).checkSynthesis!('alloy');
    const [url, init] = (fetchImpl as any).mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/audio/speech');
    expect(JSON.parse(init.body)).toMatchObject({ model: 'gpt-4o-mini-tts', voice: 'alloy', input: 'Hi' });
  });

  // OpenAI reports an exhausted balance as 429 insufficient_quota — the
  // same status as rate limiting, told apart only by the body
  it('tells quota exhaustion apart from rate limiting on 429', async () => {
    const quota = vi.fn(async () => new Response(JSON.stringify({ error: { code: 'insufficient_quota' } }), { status: 429 }));
    await expect(provider(quota).checkSynthesis!('alloy')).rejects.toMatchObject({ kind: 'quota' });

    const rate = vi.fn(async () => new Response('slow down', { status: 429 }));
    await expect(provider(rate).checkSynthesis!('alloy')).rejects.toMatchObject({ kind: 'rate-limit' });
  });

  it('maps 401 to auth and an empty key to no-key without fetching', async () => {
    const rejected = vi.fn(async () => new Response('', { status: 401 }));
    await expect(provider(rejected).checkSynthesis!('alloy')).rejects.toMatchObject({ kind: 'auth' });

    const fetchImpl = vi.fn();
    await expect(provider(fetchImpl, { apiKey: '' }).checkSynthesis!('alloy')).rejects.toMatchObject({ kind: 'no-key' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
