import { describe, expect, it, vi } from 'vitest';
import { createMiMoProvider, MIMO_URL, MIMO_VOICES } from '../../../src/core/providers/mimo';
import { MULTILINGUAL } from '../../../src/core/providers/types';

// The Xiaomi MiMo section (issues #50, #113): api.xiaomimimo.com and nothing
// else, a key required, the chat completions route — the only one its TTS
// has — and its documented voices when nothing is typed, since it publishes
// no list.
const cfg = { apiKey: 'mimo-key', model: 'mimo-v2.5-tts', voices: '' };
const provider = (fetchImpl: unknown, over: Partial<typeof cfg> = {}) => createMiMoProvider({ ...cfg, ...over }, { fetch: fetchImpl as typeof fetch });
const opts = { voice: '冰糖', signal: new AbortController().signal };
const audioReply = () => new Response(JSON.stringify({ choices: [{ message: { audio: { data: btoa('mp3') } } }] }), { status: 200 });

describe('createMiMoProvider', () => {
  it('is the mimo provider, speaking to api.xiaomimimo.com through chat completions', async () => {
    const fetchImpl = vi.fn(async () => audioReply());
    const p = provider(fetchImpl);
    expect(p.id).toBe('mimo');
    expect(MIMO_URL).toBe('https://api.xiaomimimo.com');
    const result = await p.synthesize('Hello', opts);
    const [url, init] = (fetchImpl as any).mock.calls[0];
    expect(url).toBe('https://api.xiaomimimo.com/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer mimo-key');
    expect(JSON.parse(init.body)).toEqual({ model: 'mimo-v2.5-tts', messages: [{ role: 'assistant', content: 'Hello' }], audio: { format: 'mp3', voice: '冰糖' } });
    expect(await result.audio.text()).toBe('mp3');
    expect(p.capabilities.wordTimestamps).toBe(false);
  });

  it('insists on a key before any request', async () => {
    const fetchImpl = vi.fn();
    await expect(provider(fetchImpl, { apiKey: '' }).synthesize('Hi', opts)).rejects.toMatchObject({ kind: 'no-key', message: 'Xiaomi MiMo API key is not set' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('offers the documented voices, all multilingual, unless the user typed some', async () => {
    const notFound = vi.fn(async () => new Response('', { status: 404 }));
    const voices = await provider(notFound).listVoices();
    expect(voices.map((v) => v.id)).toEqual([...MIMO_VOICES]);
    for (const voice of voices) expect(voice.locale).toBe(MULTILINGUAL);
    expect(MIMO_VOICES[0]).toBe('mimo_default');
    expect((await provider(notFound, { voices: 'Mia' }).listVoices()).map((v) => v.id)).toEqual(['Mia']);
  });
});
