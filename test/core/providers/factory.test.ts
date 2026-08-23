import { describe, expect, it, vi } from 'vitest';
import { createProvider } from '../../../src/core/providers/factory';
import { SynthesisError } from '../../../src/core/providers/errors';
import { DEFAULTS } from '../../../src/core/settings';

const deps = {
  fetch: vi.fn() as unknown as typeof fetch,
  getWebSocket: vi.fn() as unknown as () => typeof WebSocket,
  newRequestId: () => 'r',
};

describe('createProvider', () => {
  it('builds the OpenAI provider', () => {
    const p = createProvider('openai', DEFAULTS, deps);
    expect(p.id).toBe('openai');
    expect(p.capabilities.wordTimestamps).toBe(false);
  });

  it('builds the Azure provider', () => {
    const p = createProvider('azure', DEFAULTS, deps);
    expect(p.id).toBe('azure');
    expect(p.capabilities.wordTimestamps).toBe(true);
  });

  it('builds the configured local engine', () => {
    const s = { ...DEFAULTS, local: { enabled: true, engine: 'kokoro', baseURL: 'http://h:1', voice: 'af_bella' } };
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
    const s = { ...DEFAULTS, local: { enabled: true, engine: 'piper', baseURL: 'http://h:1', voice: 'x' } };
    expect(() => createProvider('local', s, deps)).toThrow(SynthesisError);
  });
});

describe('OpenAI extra headers', () => {
  it('hands the provider the headers typed into the settings', async () => {
    const fetchImpl = vi.fn(async () => new Response(new Blob(['a']), { status: 200 }));
    const settings = {
      ...DEFAULTS,
      openai: { ...DEFAULTS.openai, apiKey: '', baseURL: 'http://localhost:8004', headers: 'X-Token: abc; CF-Access-Client-Id: id' },
    };
    const p = createProvider('openai', settings, { ...deps, fetch: fetchImpl as unknown as typeof fetch });
    await p.synthesize('Hello', { voice: 'Emily.wav', speed: 1, signal: new AbortController().signal });
    expect((fetchImpl as any).mock.calls[0][1].headers).toMatchObject({ 'X-Token': 'abc', 'CF-Access-Client-Id': 'id' });
    expect((fetchImpl as any).mock.calls[0][1].headers).not.toHaveProperty('Authorization');
  });
});

describe('OpenAI server preset', () => {
  it('does not send a key or a typed voice list to a server the preset says ignores them', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.endsWith('/v1/audio/voices')
        ? new Response(JSON.stringify({ voices: ['Emily.wav'] }), { status: 200 })
        : new Response(new Blob(['a']), { status: 200 }),
    );
    const settings = {
      ...DEFAULTS,
      openai: { ...DEFAULTS.openai, server: 'chatterbox', baseURL: 'http://localhost:8004', apiKey: 'stale-key', voices: 'alloy,echo' },
    };
    const p = createProvider('openai', settings, { ...deps, fetch: fetchImpl as unknown as typeof fetch });
    await p.synthesize('Hello', { voice: 'Emily.wav', speed: 1, signal: new AbortController().signal });
    expect((fetchImpl as any).mock.calls[0][1].headers).not.toHaveProperty('Authorization');
    const voices = await p.listVoices();
    expect(voices.map((v) => v.id)).toEqual(['Emily.wav']);
  });
});
