import { describe, expect, it, vi } from 'vitest';
import { createOpenAIProvider, OPENAI_DEFAULT_VOICES, OPENAI_URL } from '../../../src/core/providers/openai';

// The OpenAI section (issue #113): api.openai.com and nothing else, a key
// required, OpenAI's documented voices when nothing is typed — a proxy or a
// mirror goes through the OpenAI Compatible section instead.
const cfg = { apiKey: 'sk-test', model: 'gpt-4o-mini-tts', voices: '' };
const provider = (fetchImpl: unknown, over: Partial<typeof cfg> = {}) => createOpenAIProvider({ ...cfg, ...over }, { fetch: fetchImpl as typeof fetch });
const opts = { voice: 'alloy', signal: new AbortController().signal };

describe('createOpenAIProvider', () => {
  it('is the openai provider, speaking to api.openai.com on the speech route', async () => {
    const fetchImpl = vi.fn(async () => new Response(new Blob(['audio']), { status: 200 }));
    const p = provider(fetchImpl);
    expect(p.id).toBe('openai-official');
    expect(OPENAI_URL).toBe('https://api.openai.com');
    await p.synthesize('Hello', opts);
    const [url, init] = (fetchImpl as any).mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/audio/speech');
    expect(init.headers.Authorization).toBe('Bearer sk-test');
    expect(JSON.parse(init.body)).toMatchObject({ model: 'gpt-4o-mini-tts', voice: 'alloy', input: 'Hello' });
  });

  it('insists on a key before any request', async () => {
    const fetchImpl = vi.fn();
    await expect(provider(fetchImpl, { apiKey: '' }).synthesize('Hi', opts)).rejects.toMatchObject({ kind: 'no-key', message: 'OpenAI API key is not set' });
    await expect(provider(fetchImpl, { apiKey: '' }).listModels!()).rejects.toMatchObject({ kind: 'no-key' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("offers OpenAI's documented voices, which the API does not list, unless the user typed some", async () => {
    const notFound = vi.fn(async () => new Response('', { status: 404 }));
    expect((await provider(notFound).listVoices()).map((v) => v.id)).toEqual([...OPENAI_DEFAULT_VOICES]);
    expect((await provider(notFound, { voices: 'alloy, verse' }).listVoices()).map((v) => v.id)).toEqual(['alloy', 'verse']);
    expect(OPENAI_DEFAULT_VOICES).toContain('alloy');
  });
});
