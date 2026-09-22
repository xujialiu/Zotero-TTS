import { describe, expect, it, vi } from 'vitest';
import { createProvider, getFishVoiceCacheStats } from '../../../src/core/providers/factory';
import { SynthesisError } from '../../../src/core/providers/errors';
import { MIMO_VOICES } from '../../../src/core/providers/mimo';
import { DEFAULTS } from '../../../src/core/settings';

const deps = {
  fetch: vi.fn() as unknown as typeof fetch,
  getWebSocket: vi.fn() as unknown as () => typeof WebSocket,
  newRequestId: () => 'r',
};

describe('createProvider', () => {
  it('builds the OpenAI provider', () => {
    const p = createProvider('openai-official', DEFAULTS, deps);
    expect(p.id).toBe('openai-official');
    expect(p.capabilities.wordTimestamps).toBe(false);
  });

  it('builds the Xiaomi MiMo and OpenAI Compatible providers (issue #113)', () => {
    expect(createProvider('mimo', DEFAULTS, deps).id).toBe('mimo');
    expect(createProvider('compatible', DEFAULTS, deps).id).toBe('compatible');
  });

  it('builds the Azure provider', () => {
    const p = createProvider('azure', DEFAULTS, deps);
    expect(p.id).toBe('azure');
    expect(p.capabilities.wordTimestamps).toBe(true);
  });

  it('builds the Cloudflare provider', () => {
    const p = createProvider('cloudflare', DEFAULTS, deps);
    expect(p.id).toBe('cloudflare');
    expect(p.capabilities.wordTimestamps).toBe(false);
  });

  it('builds the Speechify provider', () => {
    const p = createProvider('speechify', DEFAULTS, deps);
    expect(p.id).toBe('speechify');
    expect(p.capabilities.wordTimestamps).toBe(true);
  });

  it('builds the Fish Audio provider and the Fish Speech server provider', () => {
    const fish = createProvider('fish', DEFAULTS, deps);
    expect(fish.id).toBe('fish');
    expect(fish.capabilities.wordTimestamps).toBe(true);
    const server = createProvider('fishspeech', DEFAULTS, deps);
    expect(server.id).toBe('fishspeech');
    expect(server.capabilities.wordTimestamps).toBe(false);
  });

  it('builds the configured local engine', () => {
    const s = { ...DEFAULTS, local: { enabled: true, engine: 'kokoro', baseURL: 'http://h:1', voice: 'af_bella', headers: '' } };
    const p = createProvider('local', s, deps);
    expect(p.id).toBe('local');
    expect(p.capabilities.wordTimestamps).toBe(true);
  });

  // The enabled flags decide what is published, not what can be built: a
  // voice Zotero remembers may belong to a provider switched off since
  it('builds a provider whether or not it is enabled', () => {
    expect(createProvider('azure', { ...DEFAULTS, azure: { ...DEFAULTS.azure, enabled: false } }, deps).id).toBe('azure');
  });

  it('throws a typed error when the configured local engine is not registered', () => {
    const s = { ...DEFAULTS, local: { enabled: true, engine: 'piper', baseURL: 'http://h:1', voice: 'x', headers: '' } };
    expect(() => createProvider('local', s, deps)).toThrow(SynthesisError);
  });

  it('shares Fish voice-cache counters without exposing account or voice identifiers', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.includes('self=true')
        ? Response.json({ items: [], has_more: false })
        : Response.json({ items: [], has_more: false, window_limited: false, total_is_exact: true }),
    );
    const settings = { ...DEFAULTS, fish: { ...DEFAULTS.fish, apiKey: 'account-a', includeOwn: true } };
    await createProvider('fish', settings, { ...deps, fetch: fetchImpl as unknown as typeof fetch }).listVoices();
    await createProvider('fish', settings, { ...deps, fetch: fetchImpl as unknown as typeof fetch }).listVoices();
    expect(getFishVoiceCacheStats(fetchImpl as unknown as typeof fetch)).toMatchObject({ cacheHits: 2, loads: 2, cachedAccounts: 1 });
    expect(Object.keys(getFishVoiceCacheStats(fetchImpl as unknown as typeof fetch))).not.toContain('apiKey');
  });
});

// The three sections that speak OpenAI's API (issue #113): each provider is
// built from its own section, so nothing typed for one reaches another
describe('the OpenAI, Xiaomi MiMo and OpenAI Compatible sections', () => {
  it('sends the OpenAI section to api.openai.com with its key', async () => {
    const fetchImpl = vi.fn(async () => new Response(new Blob(['a']), { status: 200 }));
    const settings = { ...DEFAULTS, 'openai-official': { ...DEFAULTS['openai-official'], apiKey: 'sk-1' }, compatible: { ...DEFAULTS.compatible, baseURL: 'http://localhost:8004', headers: 'X-Token: abc' } };
    await createProvider('openai-official', settings, { ...deps, fetch: fetchImpl as unknown as typeof fetch }).synthesize('Hello', { voice: 'alloy', signal: new AbortController().signal });
    const [url, init] = (fetchImpl as any).mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/audio/speech');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer sk-1' });
    expect(init.headers).not.toHaveProperty('X-Token');
  });

  it('sends the Xiaomi MiMo section to api.xiaomimimo.com through chat completions, with its documented voices', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.endsWith('/v1/chat/completions')
        ? new Response(JSON.stringify({ choices: [{ message: { audio: { data: btoa('mp3') } } }] }), { status: 200 })
        : new Response('', { status: 404 }),
    );
    const settings = { ...DEFAULTS, mimo: { ...DEFAULTS.mimo, apiKey: 'k' }, compatible: { ...DEFAULTS.compatible, headers: 'CF-Access-Client-Id: other-server' } };
    const p = createProvider('mimo', settings, { ...deps, fetch: fetchImpl as unknown as typeof fetch });
    const result = await p.synthesize('Hello', { voice: '冰糖', signal: new AbortController().signal });
    const [url, init] = (fetchImpl as any).mock.calls[0];
    expect(url).toBe('https://api.xiaomimimo.com/v1/chat/completions');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer k' });
    expect(init.headers).not.toHaveProperty('CF-Access-Client-Id');
    expect(await result.audio.text()).toBe('mp3');
    expect((await p.listVoices()).map((v) => v.id)).toEqual([...MIMO_VOICES]);
  });

  it('hands the OpenAI Compatible section its address and the headers typed, and goes without a key', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.endsWith('/v1/audio/voices') ? new Response(JSON.stringify({ voices: ['Emily.wav'] }), { status: 200 }) : new Response(new Blob(['a']), { status: 200 }),
    );
    const settings = {
      ...DEFAULTS,
      'openai-official': { ...DEFAULTS['openai-official'], apiKey: 'sk-openai' },
      compatible: { ...DEFAULTS.compatible, baseURL: 'http://localhost:8004', headers: 'X-Token: abc; CF-Access-Client-Id: id' },
    };
    const p = createProvider('compatible', settings, { ...deps, fetch: fetchImpl as unknown as typeof fetch });
    await p.synthesize('Hello', { voice: 'Emily.wav', signal: new AbortController().signal });
    const [url, init] = (fetchImpl as any).mock.calls[0];
    expect(url).toBe('http://localhost:8004/v1/audio/speech');
    expect(init.headers).toMatchObject({ 'X-Token': 'abc', 'CF-Access-Client-Id': 'id' });
    expect(init.headers).not.toHaveProperty('Authorization');
    expect((await p.listVoices()).map((v) => v.id)).toEqual(['Emily.wav']);
  });
});

describe('Local engine extra headers', () => {
  it('hands the engine the headers typed into the settings', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ voices: ['af_bella'] }));
    const settings = { ...DEFAULTS, local: { ...DEFAULTS.local, headers: 'CF-Access-Client-Id: id' } };
    await createProvider('local', settings, { ...deps, fetch: fetchImpl as unknown as typeof fetch }).listVoices();
    expect((fetchImpl as any).mock.calls[0][1].headers).toMatchObject({ 'CF-Access-Client-Id': 'id' });
  });
});
