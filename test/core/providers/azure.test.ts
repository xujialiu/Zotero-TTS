import { describe, expect, it, vi } from 'vitest';
import { createAzureProvider } from '../../../src/core/providers/azure';
import { buildTextFrame, parseTextFrame } from '../../../src/core/providers/azure-ws';

const cfg = { apiKey: 'key-1', region: 'eastasia' };
const opts = { voice: 'en-US-AvaNeural', speed: 1, signal: new AbortController().signal };

/** 一个可以由测试驱动的假 socket。 */
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
  }

  /** 模拟服务端回一段音频与词边界，然后结束这一轮。 */
  respond(words: unknown[], audio: number[]) {
    this.onmessage?.({
      data: buildTextFrame({ Path: 'audio.metadata' }, JSON.stringify({ Metadata: words })),
    });

    const headerBytes = new TextEncoder().encode('Path: audio\r\n');
    const payload = new Uint8Array(audio);
    const buf = new Uint8Array(2 + headerBytes.length + payload.length);
    new DataView(buf.buffer).setUint16(0, headerBytes.length, false);
    buf.set(headerBytes, 2);
    buf.set(payload, 2 + headerBytes.length);
    this.onmessage?.({ data: buf.buffer });

    this.onmessage?.({ data: buildTextFrame({ Path: 'turn.end' }, '{}') });
  }
}

function provider() {
  return createAzureProvider(cfg, {
    fetch: vi.fn() as unknown as typeof fetch,
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

  it('closes the socket once the turn ends', async () => {
    const pending = provider().synthesize('Hello', opts);
    await Promise.resolve();
    const socket = FakeSocket.last;
    socket.respond([], [1]);
    await pending;
    expect(socket.closed).toBe(true);
  });
});
