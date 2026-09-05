import { describe, expect, it, vi } from 'vitest';
import { createProvider } from '../../../src/core/providers/factory';
import { SynthesisError } from '../../../src/core/providers/errors';
import { PRESETS } from '../../../src/core/server-presets';
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
});

describe('OpenAI extra headers', () => {
  it('hands the provider the headers typed into the settings', async () => {
    const fetchImpl = vi.fn(async () => new Response(new Blob(['a']), { status: 200 }));
    const settings = {
      ...DEFAULTS,
      openai: { ...DEFAULTS.openai, apiKey: '', baseURL: 'http://localhost:8004', headers: 'X-Token: abc; CF-Access-Client-Id: id' },
    };
    const p = createProvider('openai', settings, { ...deps, fetch: fetchImpl as unknown as typeof fetch });
    await p.synthesize('Hello', { voice: 'Emily.wav', signal: new AbortController().signal });
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
    await p.synthesize('Hello', { voice: 'Emily.wav', signal: new AbortController().signal });
    expect((fetchImpl as any).mock.calls[0][1].headers).not.toHaveProperty('Authorization');
    const voices = await p.listVoices();
    expect(voices.map((v) => v.id)).toEqual(['Emily.wav']);
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

// Xiaomi MiMo (issue #50): the preset's route and its documented voices reach the provider
describe('the Xiaomi MiMo preset', () => {
  it('hands the provider the chat completions route and the documented voices', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.endsWith('/v1/chat/completions')
        ? new Response(JSON.stringify({ choices: [{ message: { audio: { data: btoa('mp3') } } }] }), { status: 200 })
        : new Response('', { status: 404 }),
    );
    const settings = { ...DEFAULTS, openai: { ...DEFAULTS.openai, ...PRESETS.mimo.defaults, server: 'mimo', apiKey: 'k' } };
    const p = createProvider('openai', settings, { ...deps, fetch: fetchImpl as unknown as typeof fetch });
    const result = await p.synthesize('Hello', { voice: '冰糖', signal: new AbortController().signal });
    expect((fetchImpl as any).mock.calls[0][0]).toBe('https://api.xiaomimimo.com/v1/chat/completions');
    expect(await result.audio.text()).toBe('mp3');
    expect((await p.listVoices()).map((v) => v.id)).toEqual([...PRESETS.mimo.voices!]);
  });
});
