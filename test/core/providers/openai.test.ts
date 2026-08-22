import { describe, expect, it, vi } from 'vitest';
import { SynthesisError } from '../../../src/core/providers/errors';
import { createOpenAIProvider, OPENAI_VOICES } from '../../../src/core/providers/openai';
import { ANY_LANGUAGE } from '../../../src/core/providers/types';

const cfg = {
  apiKey: 'sk-test',
  baseURL: 'https://api.openai.com',
  model: 'gpt-4o-mini-tts',
};

function provider(fetchImpl: typeof fetch) {
  return createOpenAIProvider(cfg, { fetch: fetchImpl });
}

const signalController = new AbortController();
const opts = { voice: 'alloy', speed: 1, signal: signalController.signal };

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
    expect(init.signal).toBe(opts.signal);
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
    expect('timestamps' in result).toBe(false);
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
    await expect(provider(fetchImpl as unknown as typeof fetch).synthesize('Hi', opts)).rejects.toMatchObject({
      kind: 'unknown',
    });
  });

  it('maps a thrown fetch into a network error', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('failed to fetch');
    });
    await expect(provider(fetchImpl as unknown as typeof fetch).synthesize('Hi', opts)).rejects.toMatchObject({
      kind: 'network',
    });
  });

  // The voices are multilingual, so each is listed once under Zotero's
  // wildcard locale and appears for every language, instead of under a
  // hand-picked subset of locales
  it('lists every voice once, under the wildcard locale', async () => {
    const voices = await provider(vi.fn()).listVoices();
    expect(voices.map((v) => v.id)).toEqual([...OPENAI_VOICES]);
    for (const voice of voices) expect(voice.locale).toBe(ANY_LANGUAGE);
  });
});
