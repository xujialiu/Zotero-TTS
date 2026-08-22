import { describe, expect, it, vi } from 'vitest';
import { createAzureProvider } from '../../../src/core/providers/azure';
import { buildTextFrame, parseTextFrame } from '../../../src/core/providers/azure-ws';

const cfg = { apiKey: 'key-1', region: 'eastasia' };
const opts = { voice: 'en-US-AvaNeural', speed: 1, signal: new AbortController().signal };

/** A fake socket that tests can drive. */
class FakeSocket {
  static last: FakeSocket;
  url: string;
  sent: string[] = [];
  binaryType = '';
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string | ArrayBuffer }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
    FakeSocket.last = this;
    queueMicrotask(() => this.onopen?.());
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
    // Real sockets fire `close` asynchronously, and only after `close()` is
    // called -- never synchronously within the call itself. Mirror that so
    // tests can exercise the "onclose after we already settled" ordering.
    queueMicrotask(() => this.onclose?.());
  }

  /**
   * Simulates the server replying with a word-boundary segment, then a
   * number of audio segments in order, then ending the turn. Multiple
   * audio chunks can be passed to simulate several frames arriving.
   */
  respond(words: unknown[], ...audioChunks: number[][]) {
    this.onmessage?.({
      data: buildTextFrame({ Path: 'audio.metadata' }, JSON.stringify({ Metadata: words })),
    });

    for (const audio of audioChunks) {
      const headerBytes = new TextEncoder().encode('Path: audio\r\n');
      const payload = new Uint8Array(audio);
      const buf = new Uint8Array(2 + headerBytes.length + payload.length);
      new DataView(buf.buffer).setUint16(0, headerBytes.length, false);
      buf.set(headerBytes, 2);
      buf.set(payload, 2 + headerBytes.length);
      this.onmessage?.({ data: buf.buffer });
    }

    this.onmessage?.({ data: buildTextFrame({ Path: 'turn.end' }, '{}') });
  }
}

function provider(fetchImpl: typeof fetch = vi.fn() as unknown as typeof fetch) {
  return createAzureProvider(cfg, {
    fetch: fetchImpl,
    getWebSocket: () => FakeSocket as unknown as typeof WebSocket,
    newRequestId: () => 'req-1',
  });
}

describe('createAzureProvider', () => {
  it('declares that it can produce word timestamps', () => {
    expect(provider().capabilities.wordTimestamps).toBe(true);
  });

  it('rejects with no-key before opening a socket when the key is empty', async () => {
    const getWebSocket = vi.fn();
    const p = createAzureProvider(
      { ...cfg, apiKey: '' },
      { fetch: vi.fn() as unknown as typeof fetch, getWebSocket: getWebSocket as never, newRequestId: () => 'r' },
    );
    await expect(p.synthesize('Hi', opts)).rejects.toMatchObject({ kind: 'no-key' });
    expect(getWebSocket).not.toHaveBeenCalled();
  });

  it('rejects immediately without opening a socket when the signal is already aborted', async () => {
    const getWebSocket = vi.fn();
    const controller = new AbortController();
    controller.abort();
    const p = createAzureProvider(cfg, {
      fetch: vi.fn() as unknown as typeof fetch,
      getWebSocket: getWebSocket as never,
      newRequestId: () => 'req-1',
    });

    await expect(p.synthesize('Hi', { ...opts, signal: controller.signal })).rejects.toMatchObject({
      kind: 'unknown',
    });
    expect(getWebSocket).not.toHaveBeenCalled();
  });

  it('connects to the region endpoint and sends config, context, then ssml', async () => {
    const pending = provider().synthesize('Hello world', opts);
    await Promise.resolve();

    const socket = FakeSocket.last;
    expect(socket.url).toContain('wss://eastasia.tts.speech.microsoft.com/cognitiveservices/websocket/v1');

    const paths = socket.sent.map((f) => parseTextFrame(f).headers.Path);
    expect(paths).toEqual(['speech.config', 'synthesis.context', 'ssml']);

    const context = JSON.parse(parseTextFrame(socket.sent[1]).body);
    expect(context.synthesis.audio.metadataOptions.wordBoundaryEnabled).toBe(true);

    socket.respond([], [1, 2]);
    await pending;
  });

  it('returns the concatenated audio payload', async () => {
    const pending = provider().synthesize('Hello', opts);
    await Promise.resolve();
    FakeSocket.last.respond([], [7, 8, 9]);

    const result = await pending;
    const bytes = new Uint8Array(await result.audio.arrayBuffer());
    expect(Array.from(bytes)).toEqual([7, 8, 9]);
  });

  it('concatenates multiple audio frames in arrival order', async () => {
    const pending = provider().synthesize('Hello', opts);
    await Promise.resolve();
    // Three chunks of differing lengths: an off-by-one in the offset
    // accumulation (`at += c.length`) would misplace or drop bytes here,
    // even though it could pass a single-chunk test.
    FakeSocket.last.respond([], [1, 2], [3, 4, 5], [6]);

    const result = await pending;
    const bytes = new Uint8Array(await result.audio.arrayBuffer());
    expect(Array.from(bytes)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('converts word boundaries into timestamps aligned to the source text', async () => {
    const pending = provider().synthesize('Hello world', opts);
    await Promise.resolve();
    FakeSocket.last.respond(
      [
        { Type: 'WordBoundary', Data: { Offset: 0, Duration: 5_000_000, text: { Text: 'Hello' } } },
        { Type: 'WordBoundary', Data: { Offset: 5_000_000, Duration: 5_000_000, text: { Text: 'world' } } },
      ],
      [1],
    );

    const result = await pending;
    expect(result.timestamps).toEqual([
      { start: 0, end: 0.5, charStart: 0, charEnd: 5 },
      { start: 0.5, end: 1, charStart: 6, charEnd: 11 },
    ]);
  });

  it('omits timestamps entirely when no word boundary arrived', async () => {
    const pending = provider().synthesize('Hello', opts);
    await Promise.resolve();
    FakeSocket.last.respond([], [1]);

    const result = await pending;
    // Assert true key absence, not just an undefined value: `toBeUndefined()`
    // cannot distinguish an absent key from one present with value `undefined`,
    // and the project rule is that the key is absent.
    expect('timestamps' in result).toBe(false);
  });

  it('rejects with a network error when the socket errors', async () => {
    const pending = provider().synthesize('Hello', opts);
    await Promise.resolve();
    FakeSocket.last.onerror?.();
    await expect(pending).rejects.toMatchObject({ kind: 'network' });
  });

  it('rejects instead of hanging when onopen throws while sending the handshake', async () => {
    class ThrowOnSendSocket extends FakeSocket {
      send(): void {
        throw new Error('send failed');
      }
    }
    const p = createAzureProvider(cfg, {
      fetch: vi.fn() as unknown as typeof fetch,
      getWebSocket: () => ThrowOnSendSocket as unknown as typeof WebSocket,
      newRequestId: () => 'req-1',
    });

    await expect(p.synthesize('Hello', opts)).rejects.toMatchObject({ kind: 'unknown' });
  });

  it('rejects with a SynthesisError instead of a raw value when the WebSocket constructor throws', async () => {
    class ThrowingSocket {
      constructor() {
        throw new Error('bad url');
      }
    }
    const p = createAzureProvider(cfg, {
      fetch: vi.fn() as unknown as typeof fetch,
      getWebSocket: () => ThrowingSocket as unknown as typeof WebSocket,
      newRequestId: () => 'req-1',
    });

    await expect(p.synthesize('Hello', opts)).rejects.toMatchObject({ kind: 'unknown' });
  });

  it(
    'rejects with a SynthesisError instead of hanging when a binary frame is truncated',
    async () => {
      const pending = provider().synthesize('Hello', opts);
      await Promise.resolve();
      const socket = FakeSocket.last;

      // A 1-byte buffer cannot even hold the 2-byte header-length prefix that
      // parseBinaryFrame reads first -- it throws a RangeError. The onmessage
      // try/catch must turn that into a rejection, not a hang.
      socket.onmessage?.({ data: new ArrayBuffer(1) });

      await expect(pending).rejects.toMatchObject({ kind: 'unknown' });
    },
    1000,
  );

  it('closes the socket once the turn ends', async () => {
    const pending = provider().synthesize('Hello', opts);
    await Promise.resolve();
    const socket = FakeSocket.last;
    socket.respond([], [1]);
    await pending;
    expect(socket.closed).toBe(true);
  });

  it('resolves rather than rejecting when onclose fires after a successful resolve', async () => {
    const pending = provider().synthesize('Hello', opts);
    await Promise.resolve();
    const socket = FakeSocket.last;
    socket.respond([], [1]);

    const result = await pending;
    expect(socket.closed).toBe(true);

    // Flush the queued onclose (fired by finish()'s own socket.close() call)
    // and prove it does not flip the already-settled promise to rejected.
    await new Promise((r) => setTimeout(r, 0));
    await expect(pending).resolves.toBe(result);
  });

  describe('listVoices', () => {
    it('maps ShortName/LocalName/Locale into VoiceInfo', async () => {
      const body = [
        { ShortName: 'en-US-AvaNeural', LocalName: 'Ava', Locale: 'en-US' },
        { ShortName: 'ja-JP-NanamiNeural', Locale: 'ja-JP' },
        // Multilingual voices — named so in the ShortName, the DisplayName,
        // or a localized LocalName — go under the wildcard locale so every
        // language offers them
        { ShortName: 'en-US-AvaMultilingualNeural', DisplayName: 'Ava Multilingual', LocalName: 'Ava Multilingual', Locale: 'en-US' },
        { ShortName: 'zh-CN-XiaoxiaoMultilingualNeural', LocalName: '晓晓 多语言', Locale: 'zh-CN' },
      ];
      const fetchImpl = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));

      const voices = await provider(fetchImpl as unknown as typeof fetch).listVoices();

      expect(voices).toEqual([
        { id: 'en-US-AvaNeural', label: 'Ava', locale: 'en-US' },
        { id: 'ja-JP-NanamiNeural', label: 'ja-JP-NanamiNeural', locale: 'ja-JP' },
        { id: 'en-US-AvaMultilingualNeural', label: 'Ava Multilingual', locale: 'mul' },
        { id: 'zh-CN-XiaoxiaoMultilingualNeural', label: '晓晓 多语言', locale: 'mul' },
      ]);

      const [url, init] = (fetchImpl as any).mock.calls[0];
      expect(url).toBe('https://eastasia.tts.speech.microsoft.com/cognitiveservices/voices/list');
      expect(init.headers['Ocp-Apim-Subscription-Key']).toBe('key-1');
    });

    it('rejects with no-key before fetching when the key is empty', async () => {
      const fetchImpl = vi.fn();
      const p = createAzureProvider(
        { ...cfg, apiKey: '' },
        {
          fetch: fetchImpl as unknown as typeof fetch,
          getWebSocket: () => FakeSocket as unknown as typeof WebSocket,
          newRequestId: () => 'r',
        },
      );
      await expect(p.listVoices()).rejects.toMatchObject({ kind: 'no-key' });
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('maps a non-2xx response to unknown', async () => {
      const fetchImpl = vi.fn(async () => new Response('nope', { status: 500 }));
      await expect(provider(fetchImpl as unknown as typeof fetch).listVoices()).rejects.toMatchObject({
        kind: 'unknown',
      });
    });

    it('maps a thrown fetch into a network error', async () => {
      const fetchImpl = vi.fn(async () => {
        throw new TypeError('failed to fetch');
      });
      await expect(provider(fetchImpl as unknown as typeof fetch).listVoices()).rejects.toMatchObject({
        kind: 'network',
      });
    });
  });
});
