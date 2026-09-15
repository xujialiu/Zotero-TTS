import { describe, expect, it, vi } from 'vitest';
import { COMPATIBLE_LABEL, createCompatibleProvider } from '../../../src/core/providers/compatible';
import { OPENAI_DEFAULT_VOICES } from '../../../src/core/providers/openai';

// The OpenAI Compatible section (issue #113): any server that speaks
// OpenAI's API — Chatterbox-TTS-Server, a hosted service, a proxy of OpenAI
// — at the address typed, with a key only if the server wants one and
// gateway headers if one sits in front of it.
const cfg = { baseURL: 'http://localhost:8004', apiKey: '', model: 'tts-1', voices: '', headers: {} as Record<string, string> };
const provider = (fetchImpl: unknown, over: Partial<typeof cfg> = {}) => createCompatibleProvider({ ...cfg, ...over }, { fetch: fetchImpl as typeof fetch });
const opts = { voice: 'Emily.wav', signal: new AbortController().signal };
const audio = () => new Response(new Blob(['audio']), { status: 200 });

describe('createCompatibleProvider', () => {
  it('is the compatible provider, named OpenAI Compatible, at the address typed', async () => {
    const fetchImpl = vi.fn(async () => audio());
    const p = provider(fetchImpl, { baseURL: 'http://localhost:8004/v1/' });
    expect(p.id).toBe('compatible');
    expect(COMPATIBLE_LABEL).toBe('OpenAI Compatible');
    await p.synthesize('Hello', opts);
    const [url, init] = (fetchImpl as any).mock.calls[0];
    expect(url).toBe('http://localhost:8004/v1/audio/speech');
    expect(JSON.parse(init.body)).toMatchObject({ model: 'tts-1', voice: 'Emily.wav', input: 'Hello' });
  });

  it('goes without a key, and sends one as a bearer when given', async () => {
    const fetchImpl = vi.fn(async () => audio());
    await provider(fetchImpl).synthesize('Hello', opts);
    expect((fetchImpl as any).mock.calls[0][1].headers).not.toHaveProperty('Authorization');
    await provider(fetchImpl, { apiKey: 'gsk-1' }).synthesize('Hello', opts);
    expect((fetchImpl as any).mock.calls[1][1].headers.Authorization).toBe('Bearer gsk-1');
  });

  it('sends the gateway headers with every request', async () => {
    const fetchImpl = vi.fn(async (url: string) => (url.endsWith('/v1/audio/voices') ? Response.json({ voices: ['Emily.wav'] }) : audio()));
    const headers = { 'CF-Access-Client-Id': 'id', 'CF-Access-Client-Secret': 'secret' };
    const p = provider(fetchImpl, { headers });
    await p.listVoices();
    await p.synthesize('Hello', opts);
    for (const [, init] of (fetchImpl as any).mock.calls) expect(init.headers).toMatchObject(headers);
  });

  it("takes the server's own voices, and OpenAI's documented ones from a server that publishes none, such as a proxy of OpenAI", async () => {
    const own = vi.fn(async () => Response.json({ voices: ['Emily.wav', 'Adrian.wav'] }));
    expect((await provider(own).listVoices()).map((v) => v.id)).toEqual(['Emily.wav', 'Adrian.wav']);
    const none = vi.fn(async () => new Response('', { status: 404 }));
    expect((await provider(none).listVoices()).map((v) => v.id)).toEqual([...OPENAI_DEFAULT_VOICES]);
  });

  it('names the server in its errors', async () => {
    await expect(provider(vi.fn(async () => new Response('', { status: 500 }))).synthesize('x', opts)).rejects.toMatchObject({ message: 'OpenAI Compatible speech: HTTP 500' });
  });

  it('refuses every call while no address is typed, without a request', async () => {
    const fetchImpl = vi.fn();
    const p = provider(fetchImpl, { baseURL: '  ' });
    for (const call of [() => p.listVoices(), () => p.listModels!(), () => p.checkConnection!(), () => p.checkSynthesis!('x'), () => p.synthesize('x', opts)]) {
      await expect(call()).rejects.toMatchObject({ kind: 'network', message: expect.stringMatching(/no server address/i) });
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
