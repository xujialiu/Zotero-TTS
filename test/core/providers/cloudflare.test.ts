import { describe, expect, it, vi } from 'vitest';
import {
  CLOUDFLARE_MODELS,
  cloudflareVoices,
  createCloudflareProvider,
  decodeCloudflareVoice,
  type CloudflareConfig,
} from '../../../src/core/providers/cloudflare';

const cfg: CloudflareConfig = { accountId: 'acc0123456789abcdef0123456789abcd', apiToken: 'tok-1' };
const API = 'https://api.cloudflare.com/client/v4/accounts/acc0123456789abcdef0123456789abcd/ai';

/** The wait before a retry is skipped in the tests; `waits` counts the calls. */
let waits = 0;
function provider(fetchImpl: unknown, over: Partial<CloudflareConfig> = {}) {
  return createCloudflareProvider({ ...cfg, ...over }, { fetch: fetchImpl as typeof fetch, wait: async () => void waits++ });
}

const controller = new AbortController();
const AURA = { voice: '@cf/deepgram/aura-2-en/luna', signal: controller.signal };
const MELO = { voice: '@cf/myshell-ai/melotts/zh', signal: controller.signal };

/** The model list as `GET …/ai/models/search?task=Text-to-Speech` answers it (measured 2026-09-07). */
const modelList = (names: string[] = CLOUDFLARE_MODELS.map((m) => m.id)) =>
  Response.json({ success: true, result: names.map((name) => ({ name, task: { name: 'Text-to-Speech' } })), errors: [], messages: [] });

/** A refusal in Cloudflare's envelope. */
const refusal = (status: number, code: number, message: string) =>
  Response.json({ success: false, result: null, errors: [{ code, message }], messages: [] }, { status });

/** MeloTTS's reply: the WAV as base64 inside the envelope. */
const meloReply = (wav: string) => Response.json({ success: true, result: { audio: btoa(wav) }, errors: [], messages: [] });

const call = (fetchImpl: any, index = 0): { url: string; init: RequestInit & { headers: Record<string, string> } } => {
  const [url, init] = fetchImpl.mock.calls[index];
  return { url, init };
};

describe('the voice table', () => {
  it('lists every speaker of the three Aura models and one MeloTTS voice per language the API accepts', () => {
    const ids = cloudflareVoices().map((v) => v.id);
    expect(ids).toHaveLength(12 + 40 + 10 + 4);
    expect(ids).toContain('@cf/deepgram/aura-1/angus');
    expect(ids).toContain('@cf/deepgram/aura-2-en/luna');
    expect(ids).toContain('@cf/deepgram/aura-2-es/aquila');
    expect(ids).toContain('@cf/myshell-ai/melotts/en');
    expect(ids).toContain('@cf/myshell-ai/melotts/zh');
    expect(ids).toContain('@cf/myshell-ai/melotts/ja');
    expect(ids).toContain('@cf/myshell-ai/melotts/ko');
    // Refused by the API on 2026-09-07 (404 "Invalid input"), whatever the model page says
    expect(ids).not.toContain('@cf/myshell-ai/melotts/es');
    expect(ids).not.toContain('@cf/myshell-ai/melotts/fr');
  });

  it('names a voice after its model, with the gender, and files it under its accent', () => {
    const byId = new Map(cloudflareVoices().map((v) => [v.id, v]));
    expect(byId.get('@cf/deepgram/aura-2-en/luna')).toEqual({ id: '@cf/deepgram/aura-2-en/luna', label: 'Aura-2 Luna (female)', locale: 'en-US' });
    expect(byId.get('@cf/deepgram/aura-1/angus')).toMatchObject({ label: 'Aura-1 Angus (male)', locale: 'en-IE' });
    expect(byId.get('@cf/deepgram/aura-1/athena')).toMatchObject({ locale: 'en-GB' });
    expect(byId.get('@cf/deepgram/aura-2-en/hyperion')).toMatchObject({ locale: 'en-AU' });
    expect(byId.get('@cf/deepgram/aura-2-en/amalthea')).toMatchObject({ locale: 'en-PH' });
    expect(byId.get('@cf/deepgram/aura-2-es/nestor')).toMatchObject({ label: 'Aura-2 Nestor (male)', locale: 'es-ES' });
    expect(byId.get('@cf/deepgram/aura-2-es/aquila')).toMatchObject({ locale: 'es-419' });
    expect(byId.get('@cf/myshell-ai/melotts/zh')).toEqual({ id: '@cf/myshell-ai/melotts/zh', label: 'MeloTTS Chinese', locale: 'zh-CN' });
    expect(byId.get('@cf/myshell-ai/melotts/ja')).toMatchObject({ locale: 'ja-JP' });
    expect(byId.get('@cf/myshell-ai/melotts/ko')).toMatchObject({ locale: 'ko-KR' });
  });

  it('decodes a voice id into its model and speaker, and nothing else', () => {
    expect(decodeCloudflareVoice('@cf/deepgram/aura-2-en/luna')).toMatchObject({ model: { id: '@cf/deepgram/aura-2-en' }, speaker: 'luna' });
    expect(decodeCloudflareVoice('@cf/myshell-ai/melotts/ko')).toMatchObject({ model: { id: '@cf/myshell-ai/melotts' }, speaker: 'ko' });
    expect(decodeCloudflareVoice('@cf/deepgram/aura-2-en/nobody')).toBeNull();
    expect(decodeCloudflareVoice('@cf/deepgram/aura-9/luna')).toBeNull();
    expect(decodeCloudflareVoice('luna')).toBeNull();
  });
});

describe('createCloudflareProvider', () => {
  it('declares that it cannot produce word timestamps', () => {
    expect(provider(vi.fn()).capabilities.wordTimestamps).toBe(false);
    expect(provider(vi.fn()).id).toBe('cloudflare');
  });

  describe('listVoices', () => {
    it('lists the account\'s text-to-speech models with the token and publishes the known ones\' voices', async () => {
      const fetchImpl = vi.fn(async () => modelList());
      const voices = await provider(fetchImpl).listVoices({ signal: controller.signal });
      const { url, init } = call(fetchImpl);
      expect(url).toBe(`${API}/models/search?task=Text-to-Speech&per_page=100`);
      expect(init.headers.Authorization).toBe('Bearer tok-1');
      expect(init.signal).toBe(controller.signal);
      expect(voices).toEqual(cloudflareVoices());
    });

    it('leaves out the voices of a model the account no longer lists, and skips a model it does not know', async () => {
      const fetchImpl = vi.fn(async () => modelList(['@cf/myshell-ai/melotts', '@cf/deepgram/aura-3-en']));
      const voices = await provider(fetchImpl).listVoices();
      expect(voices.map((v) => v.id)).toEqual(['@cf/myshell-ai/melotts/en', '@cf/myshell-ai/melotts/zh', '@cf/myshell-ai/melotts/ja', '@cf/myshell-ai/melotts/ko']);
    });

    it('lists MeloTTS first, so the pane\'s synthesis probe with the first voice costs the least', async () => {
      const voices = await provider(vi.fn(async () => modelList())).listVoices();
      expect(voices[0].id).toBe('@cf/myshell-ai/melotts/en');
    });

    it('refuses before any request when the account id or the token is missing', async () => {
      const fetchImpl = vi.fn();
      await expect(provider(fetchImpl, { apiToken: '' }).listVoices()).rejects.toMatchObject({ kind: 'no-key' });
      await expect(provider(fetchImpl, { accountId: '' }).listVoices()).rejects.toMatchObject({ kind: 'unknown', message: /account ID/ });
      await expect(provider(fetchImpl, { accountId: ' ' }).listVoices()).rejects.toMatchObject({ kind: 'unknown', message: /account ID/ });
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('reports a 401 as auth, naming both values Cloudflare checks, and quotes the server', async () => {
      const fetchImpl = vi.fn(async () => refusal(401, 10000, 'Authentication error'));
      await expect(provider(fetchImpl).listVoices()).rejects.toMatchObject({
        kind: 'auth',
        message: expect.stringMatching(/API token or the account ID.*401.*Authentication error/),
      });
    });

    it('reports an unreachable server as network', async () => {
      const fetchImpl = vi.fn(async () => {
        throw new TypeError('NetworkError');
      });
      await expect(provider(fetchImpl).listVoices()).rejects.toMatchObject({ kind: 'network' });
    });

    it('reports a reply that is not the model list as an error, never as an empty catalog', async () => {
      await expect(provider(vi.fn(async () => new Response('<html>', { status: 200 }))).listVoices()).rejects.toMatchObject({ kind: 'unknown' });
      await expect(provider(vi.fn(async () => Response.json({ success: true, result: 'x' }))).listVoices()).rejects.toMatchObject({ kind: 'unknown' });
    });
  });

  describe('synthesize', () => {
    it('posts an Aura request with the text and the speaker and takes the bytes as MP3', async () => {
      const fetchImpl = vi.fn(async () => new Response(new Blob([new Uint8Array([0xff, 0xf3, 0x60, 0xc4])]), { status: 200, headers: { 'Content-Type': 'audio/mpeg' } }));
      const result = await provider(fetchImpl).synthesize('Hello there', AURA);
      const { url, init } = call(fetchImpl);
      expect(url).toBe(`${API}/run/@cf/deepgram/aura-2-en`);
      expect(init.method).toBe('POST');
      expect(init.headers.Authorization).toBe('Bearer tok-1');
      expect(init.headers['Content-Type']).toBe('application/json');
      expect(init.signal).toBe(controller.signal);
      expect(JSON.parse(init.body as string)).toEqual({ text: 'Hello there', speaker: 'luna' });
      expect(result.audio.type).toBe('audio/mpeg');
      expect(new Uint8Array(await result.audio.arrayBuffer())).toEqual(new Uint8Array([0xff, 0xf3, 0x60, 0xc4]));
      // Never estimated; the note names the model for the debug line
      expect('timestamps' in result).toBe(false);
      expect(result.note).toBe('audio from @cf/deepgram/aura-2-en');
    });

    it('posts a MeloTTS request with the prompt and the language and decodes the base64 WAV', async () => {
      const fetchImpl = vi.fn(async () => meloReply('RIFF....WAVEfmt '));
      const result = await provider(fetchImpl).synthesize('你好', MELO);
      const { url, init } = call(fetchImpl);
      expect(url).toBe(`${API}/run/@cf/myshell-ai/melotts`);
      expect(JSON.parse(init.body as string)).toEqual({ prompt: '你好', lang: 'zh' });
      expect(result.audio.type).toBe('audio/wav');
      expect(await result.audio.text()).toBe('RIFF....WAVEfmt ');
      expect('timestamps' in result).toBe(false);
      expect(result.note).toBe('audio from @cf/myshell-ai/melotts');
    });

    it('reports a MeloTTS reply without audio, or one that is not JSON, as an error', async () => {
      await expect(provider(vi.fn(async () => Response.json({ success: true, result: {} }))).synthesize('Hi', MELO)).rejects.toMatchObject({
        kind: 'unknown',
        message: /no audio/,
      });
      await expect(provider(vi.fn(async () => new Response('not json', { status: 200 }))).synthesize('Hi', MELO)).rejects.toMatchObject({
        kind: 'unknown',
        message: /not JSON/,
      });
      await expect(provider(vi.fn(async () => Response.json({ success: true, result: { audio: '@@@' } }))).synthesize('Hi', MELO)).rejects.toMatchObject({
        kind: 'unknown',
        message: /base64/,
      });
    });

    it('refuses a voice id it does not know before any request', async () => {
      const fetchImpl = vi.fn();
      await expect(provider(fetchImpl).synthesize('Hi', { ...AURA, voice: 'alloy' })).rejects.toMatchObject({ kind: 'unknown', message: /alloy/ });
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('refuses without the credentials before any request', async () => {
      const fetchImpl = vi.fn();
      await expect(provider(fetchImpl, { apiToken: '' }).synthesize('Hi', AURA)).rejects.toMatchObject({ kind: 'no-key' });
      await expect(provider(fetchImpl, { accountId: '' }).synthesize('Hi', AURA)).rejects.toMatchObject({ kind: 'unknown' });
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('quotes the server\'s reason on a refusal, and types the status', async () => {
      const bad = (status: number, code: number, message: string) => provider(vi.fn(async () => refusal(status, code, message))).synthesize('Hi', AURA);
      await expect(bad(400, 5006, 'AiError: Bad input: Error: enum nobody not in angus,asteria')).rejects.toMatchObject({
        kind: 'unknown',
        message: /400.*enum nobody not in angus,asteria/,
      });
      await expect(bad(401, 10000, 'Authentication error')).rejects.toMatchObject({ kind: 'auth', message: /401.*Authentication error/ });
      await expect(bad(403, 10000, 'Forbidden')).rejects.toMatchObject({ kind: 'auth' });
      await expect(bad(429, 10429, 'Rate limited')).rejects.toMatchObject({ kind: 'rate-limit', message: /429.*Rate limited/ });
      await expect(bad(429, 10429, 'Daily neuron allocation exceeded')).rejects.toMatchObject({ kind: 'quota' });
      await expect(bad(402, 10402, 'Payment required')).rejects.toMatchObject({ kind: 'quota' });
      await expect(bad(500, 3043, 'AiError: Internal server error')).rejects.toMatchObject({ kind: 'unknown', message: /500.*Internal server error/ });
    });

    it('reports a refusal without a readable body by its status alone', async () => {
      await expect(provider(vi.fn(async () => new Response('<html>', { status: 502 }))).synthesize('Hi', AURA)).rejects.toMatchObject({
        kind: 'unknown',
        message: /HTTP 502/,
      });
    });

    // Cloudflare's MeloTTS answered 500 to one request in four on 2026-09-07, and the same request succeeded a moment later
    it('retries a 5xx once, after the wait, and takes the second reply', async () => {
      waits = 0;
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(refusal(500, 3043, 'AiError: AiError: Internal server error (abc)'))
        .mockResolvedValueOnce(meloReply('RIFF'));
      const result = await provider(fetchImpl).synthesize('Hi', MELO);
      expect(await result.audio.text()).toBe('RIFF');
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(waits).toBe(1);
      expect(JSON.parse(call(fetchImpl, 1).init.body as string)).toEqual({ prompt: 'Hi', lang: 'zh' });
      // The debug line says so, which is how a live run proves the retry
      expect(result.note).toBe('audio from @cf/myshell-ai/melotts after a retry of HTTP 500');
    });

    it('gives up after the one retry, quoting the second refusal', async () => {
      waits = 0;
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(refusal(500, 3043, 'first'))
        .mockResolvedValueOnce(refusal(503, 3043, 'second'));
      await expect(provider(fetchImpl).synthesize('Hi', MELO)).rejects.toMatchObject({ kind: 'unknown', message: /503.*second/ });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(waits).toBe(1);
    });

    it('never retries a refusal below 500: the answer would be the same', async () => {
      waits = 0;
      const fetchImpl = vi.fn(async () => refusal(400, 5006, 'Bad input'));
      await expect(provider(fetchImpl).synthesize('Hi', AURA)).rejects.toMatchObject({ kind: 'unknown' });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(waits).toBe(0);
    });

    it('does not retry the model list', async () => {
      const fetchImpl = vi.fn(async () => refusal(500, 3043, 'down'));
      await expect(provider(fetchImpl).listVoices()).rejects.toMatchObject({ kind: 'unknown', message: /500/ });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('reports an unreachable server as network', async () => {
      const fetchImpl = vi.fn(async () => {
        throw new TypeError('NetworkError');
      });
      await expect(provider(fetchImpl).synthesize('Hi', AURA)).rejects.toMatchObject({ kind: 'network' });
    });
  });

  describe('checkSynthesis', () => {
    it('synthesizes two letters with the voice and discards the audio', async () => {
      const fetchImpl = vi.fn(async () => meloReply('RIFF'));
      await expect(provider(fetchImpl).checkSynthesis!('@cf/myshell-ai/melotts/en')).resolves.toBeUndefined();
      expect(JSON.parse(call(fetchImpl).init.body as string)).toEqual({ prompt: 'Hi', lang: 'en' });
    });

    it('rejects with the server\'s reason, so Test connection can show it', async () => {
      const fetchImpl = vi.fn(async () => refusal(429, 10000, 'Daily allocation exceeded'));
      await expect(provider(fetchImpl).checkSynthesis!('@cf/deepgram/aura-1/angus')).rejects.toMatchObject({ kind: 'quota' });
    });
  });
});
