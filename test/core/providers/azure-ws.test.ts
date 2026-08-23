import { describe, expect, it } from 'vitest';
import {
  buildSSML,
  buildTextFrame,
  parseBinaryFrame,
  parseTextFrame,
  parseWordBoundaries,
} from '../../../src/core/providers/azure-ws';

describe('buildTextFrame', () => {
  it('writes header lines, a blank line, then the body', () => {
    const frame = buildTextFrame({ Path: 'ssml', 'X-RequestId': 'abc' }, '<speak/>');
    expect(frame).toBe('Path: ssml\r\nX-RequestId: abc\r\n\r\n<speak/>');
  });
});

describe('parseTextFrame', () => {
  it('splits headers from the body', () => {
    const { headers, body } = parseTextFrame('Path: turn.start\r\nX-RequestId: abc\r\n\r\n{}');
    expect(headers.Path).toBe('turn.start');
    expect(headers['X-RequestId']).toBe('abc');
    expect(body).toBe('{}');
  });

  it('keeps a body that itself contains blank lines intact', () => {
    const { body } = parseTextFrame('Path: x\r\n\r\nline1\r\n\r\nline2');
    expect(body).toBe('line1\r\n\r\nline2');
  });
});

describe('parseBinaryFrame', () => {
  it('reads the two-byte big-endian header length, then headers, then payload', () => {
    const headerText = 'Path: audio\r\n';
    const headerBytes = new TextEncoder().encode(headerText);
    const payload = new Uint8Array([1, 2, 3, 4]);

    const buf = new Uint8Array(2 + headerBytes.length + payload.length);
    new DataView(buf.buffer).setUint16(0, headerBytes.length, false);
    buf.set(headerBytes, 2);
    buf.set(payload, 2 + headerBytes.length);

    const frame = parseBinaryFrame(buf.buffer);
    expect(frame.headers.Path).toBe('audio');
    expect(Array.from(frame.payload)).toEqual([1, 2, 3, 4]);
  });
});

describe('buildSSML', () => {
  it('wraps the text with the voice, at the natural pace', () => {
    const ssml = buildSSML('Hello', 'en-US-AvaNeural');
    expect(ssml).toContain('<voice name="en-US-AvaNeural">Hello</voice>');
    // No <prosody rate>: Read Aloud's own slider time-stretches the audio on playback
    expect(ssml).not.toContain('<prosody');
  });

  it('escapes characters that would break the XML', () => {
    const ssml = buildSSML('a < b & c > d', 'v');
    expect(ssml).toContain('a &lt; b &amp; c &gt; d');
  });
});

describe('parseWordBoundaries', () => {
  it('converts 100-nanosecond ticks into seconds', () => {
    const body = JSON.stringify({
      Metadata: [
        {
          Type: 'WordBoundary',
          Data: { Offset: 5_000_000, Duration: 2_500_000, text: { Text: 'Hello', Length: 5 } },
        },
      ],
    });
    expect(parseWordBoundaries(body)).toEqual([{ text: 'Hello', start: 0.5, end: 0.75 }]);
  });

  it('ignores metadata entries that are not word boundaries', () => {
    const body = JSON.stringify({
      Metadata: [
        { Type: 'SentenceBoundary', Data: { Offset: 0, Duration: 10, text: { Text: 'x' } } },
        { Type: 'WordBoundary', Data: { Offset: 0, Duration: 10_000_000, text: { Text: 'ok' } } },
      ],
    });
    expect(parseWordBoundaries(body)).toEqual([{ text: 'ok', start: 0, end: 1 }]);
  });

  it('returns an empty array for a body it cannot understand, rather than throwing', () => {
    expect(parseWordBoundaries('not json')).toEqual([]);
    expect(parseWordBoundaries('{}')).toEqual([]);
  });
});
