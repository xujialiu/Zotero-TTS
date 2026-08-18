import { describe, expect, it, vi } from 'vitest';
import { SynthesisError } from '../../../src/core/providers/errors';
import { createOpenAIProvider } from '../../../src/core/providers/openai';

const cfg = {
  apiKey: 'sk-test',
  baseURL: 'https://api.openai.com',
  model: 'gpt-4o-mini-tts',
};

function provider(fetchImpl: typeof fetch) {
  return createOpenAIProvider(cfg, { fetch: fetchImpl });
}

const opts = { voice: 'alloy', speed: 1, signal: new AbortController().signal };

describe('createOpenAIProvider', () => {
  it('declares that it cannot produce word timestamps', () => {
    expect(provider(vi.fn()).capabilities.wordTimestamps).toBe(false);
  });

  it('posts the text to the speech endpoint and returns the audio', async () => {
    const fetchImpl = vi.fn(async () => new Response(new Blob(['audio-bytes']), { status: 200 }));
    const result = await provider(fetchImpl as unknown as typeof fetch).synthesize('Hello there', opts);

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = (fetchImpl as any).mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/audio/speech');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer sk-test');
    expect(JSON.parse(init.body)).toEqual({
      model: 'gpt-4o-mini-tts',
      voice: 'alloy',
      input: 'Hello there',
      speed: 1,
      response_format: 'mp3',
    });
    expect(await result.audio.text()).toBe('audio-bytes');
  });

  it('never returns timestamps, so highlighting falls back to sentence level', async () => {
    const fetchImpl = vi.fn(async () => new Response(new Blob(['x']), { status: 200 }));
    const result = await provider(fetchImpl as unknown as typeof fetch).synthesize('Hi', opts);
    expect(result.timestamps).toBeUndefined();
  });

  it('rejects with no-key before making a request when the key is empty', async () => {
    const fetchImpl = vi.fn();
    const p = createOpenAIProvider({ ...cfg, apiKey: '' }, { fetch: fetchImpl as unknown as typeof fetch });
    await expect(p.synthesize('Hi', opts)).rejects.toMatchObject({ kind: 'no-key' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('maps 429 to rate-limit', async () => {
    const fetchImpl = vi.fn(async () => new Response('slow down', { status: 429 }));
    await expect(provider(fetchImpl as unknown as typeof fetch).synthesize('Hi', opts)).rejects.toMatchObject({
      kind: 'rate-limit',
    });
  });

  it('maps other non-2xx responses to unknown', async () => {
    const fetchImpl = vi.fn(async () => new Response('bad request', { status: 400 }));
    await expect(provider(fetchImpl as unknown as typeof fetch).synthesize('Hi', opts)).rejects.toBeInstanceOf(
      SynthesisError,
    );
  });

  it('maps a thrown fetch into a network error', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('failed to fetch');
    });
    await expect(provider(fetchImpl as unknown as typeof fetch).synthesize('Hi', opts)).rejects.toMatchObject({
      kind: 'network',
    });
  });

  it('lists one entry per voice and locale combination', async () => {
    const voices = await provider(vi.fn()).listVoices();
    const ids = new Set(voices.map((v) => v.id));
    const locales = new Set(voices.map((v) => v.locale));
    expect(ids.has('alloy')).toBe(true);
    expect(locales.has('en-US')).toBe(true);
    expect(locales.has('zh-CN')).toBe(true);
    expect(voices).toHaveLength(ids.size * locales.size);
  });
});
