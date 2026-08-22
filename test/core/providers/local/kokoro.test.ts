import { describe, expect, it, vi } from 'vitest';
import { kokoroAdapter, localeForKokoroVoice } from '../../../../src/core/providers/local/kokoro';

const opts = { voice: 'af_bella', speed: 1, signal: new AbortController().signal };

function provider(fetchImpl: unknown) {
  return kokoroAdapter.create('http://localhost:8880', { fetch: fetchImpl as typeof fetch });
}

/** base64 of the bytes [1,2,3] */
const AUDIO_B64 = 'AQID';

describe('localeForKokoroVoice', () => {
  it('derives the locale from the voice id prefix', () => {
    expect(localeForKokoroVoice('af_bella')).toBe('en-US');
    expect(localeForKokoroVoice('am_adam')).toBe('en-US');
    expect(localeForKokoroVoice('bf_emma')).toBe('en-GB');
    expect(localeForKokoroVoice('zf_xiaobei')).toBe('zh-CN');
    expect(localeForKokoroVoice('jf_alpha')).toBe('ja-JP');
  });

  it('falls back to en-US for an unrecognised prefix', () => {
    expect(localeForKokoroVoice('qq_mystery')).toBe('en-US');
    expect(localeForKokoroVoice('nodelimiter')).toBe('en-US');
  });
});

describe('kokoroAdapter', () => {
  it('declares that it can produce word timestamps', () => {
    expect(kokoroAdapter.capabilities.wordTimestamps).toBe(true);
  });

  it('lists voices from the voices endpoint with derived locales', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ voices: ['af_bella', 'zf_xiaobei'] }));
    const voices = await provider(fetchImpl).listVoices();

    expect((fetchImpl as any).mock.calls[0][0]).toBe('http://localhost:8880/v1/audio/voices');
    expect(voices).toEqual([
      { id: 'af_bella', label: 'af_bella', locale: 'en-US' },
      { id: 'zf_xiaobei', label: 'zf_xiaobei', locale: 'zh-CN' },
    ]);
  });

  // Current Kokoro-FastAPI answers `{ voices: [{ id, name }] }`; reading only
  // strings returned an empty list, so no local voice ever reached Zotero
  it('accepts the object form of the voices list that current servers return', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ voices: [{ id: 'af_bella', name: 'Bella' }, { id: 'zf_xiaobei' }, { name: 'no id' }, 7] }),
    );
    const voices = await provider(fetchImpl).listVoices();
    expect(voices).toEqual([
      { id: 'af_bella', label: 'Bella', locale: 'en-US' },
      { id: 'zf_xiaobei', label: 'zf_xiaobei', locale: 'zh-CN' },
    ]);
  });

  it('posts to the captioned endpoint and decodes base64 audio', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ audio: AUDIO_B64, timestamps: [] }));
    const result = await provider(fetchImpl).synthesize('Hello', opts);

    const [url, init] = (fetchImpl as any).mock.calls[0];
    expect(url).toBe('http://localhost:8880/dev/captioned_speech');
    expect(JSON.parse(init.body)).toMatchObject({
      input: 'Hello',
      voice: 'af_bella',
      speed: 1,
      return_timestamps: true,
      // Without this the server streams newline-delimited JSON chunks,
      // which is not one JSON document and fails to parse
      stream: false,
    });
    expect(Array.from(new Uint8Array(await result.audio.arrayBuffer()))).toEqual([1, 2, 3]);
  });

  it('aligns returned word timings onto source character offsets', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        audio: AUDIO_B64,
        timestamps: [
          { word: 'Hello', start_time: 0, end_time: 0.5 },
          { word: 'world', start_time: 0.5, end_time: 1 },
        ],
      }),
    );
    const result = await provider(fetchImpl).synthesize('Hello world', opts);
    expect(result.timestamps).toEqual([
      { start: 0, end: 0.5, charStart: 0, charEnd: 5 },
      { start: 0.5, end: 1, charStart: 6, charEnd: 11 },
    ]);
  });

  it('omits timestamps when the server returns none', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ audio: AUDIO_B64 }));
    const result = await provider(fetchImpl).synthesize('Hello', opts);
    expect('timestamps' in result).toBe(false);
  });

  it('falls back to the plain speech endpoint when captioned speech is missing', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('nope', { status: 404 }))
      .mockResolvedValueOnce(new Response(new Blob([new Uint8Array([9])]), { status: 200 }));

    const result = await provider(fetchImpl).synthesize('Hello', opts);

    expect((fetchImpl as any).mock.calls[1][0]).toBe('http://localhost:8880/v1/audio/speech');
    expect(Array.from(new Uint8Array(await result.audio.arrayBuffer()))).toEqual([9]);
    expect('timestamps' in result).toBe(false);
  });

  it('reports a refused connection as local-server-down, not a generic network error', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('NetworkError when attempting to fetch resource.');
    });
    await expect(provider(fetchImpl).synthesize('Hello', opts)).rejects.toMatchObject({
      kind: 'local-server-down',
    });
  });

  it('reports invalid base64 audio as decode-failed', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ audio: 'not-valid-base64!!!', timestamps: [] }));
    await expect(provider(fetchImpl).synthesize('Hello', opts)).rejects.toMatchObject({
      kind: 'decode-failed',
    });
  });

  it('reports non-JSON listVoices response as decode-failed', async () => {
    const fetchImpl = vi.fn(async () => new Response('not json', { status: 200 }));
    await expect(provider(fetchImpl).listVoices()).rejects.toMatchObject({
      kind: 'decode-failed',
    });
  });

  it('falls back to plain endpoint when captioned response has no audio field', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ timestamps: [] }))
      .mockResolvedValueOnce(new Response(new Blob([new Uint8Array([7])]), { status: 200 }));

    const result = await provider(fetchImpl).synthesize('Hello', opts);

    expect((fetchImpl as any).mock.calls[1][0]).toBe('http://localhost:8880/v1/audio/speech');
    expect(Array.from(new Uint8Array(await result.audio.arrayBuffer()))).toEqual([7]);
    expect('timestamps' in result).toBe(false);
  });
});
