import { describe, expect, it } from 'vitest';
import { silentWav } from '../../src/core/silence';
import { wavDataLength } from '../../src/core/wav';

/** A RIFF/WAVE file from named chunks, the way both .NET's writer and macOS's say lay one out. */
function wav(chunks: { name: string; size: number; declared?: number }[]): Uint8Array {
  const body = chunks.reduce((n, c) => n + 8 + c.size, 0);
  const out = new Uint8Array(12 + body);
  const view = new DataView(out.buffer);
  const ascii = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) out[at + i] = s.charCodeAt(i);
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 4 + body, true);
  ascii(8, 'WAVE');
  let at = 12;
  for (const c of chunks) {
    ascii(at, c.name);
    view.setUint32(at + 4, c.declared ?? c.size, true);
    at += 8 + c.size;
  }
  return out;
}

describe('wavDataLength', () => {
  it('reads the data chunk of a plain 44-byte-header file, which is what silentWav writes', async () => {
    const bytes = new Uint8Array(await silentWav(100, 8000).arrayBuffer());
    expect(wavDataLength(bytes)).toBe(1600);
  });

  // say --file-format=WAVE writes fmt, then a 4044-byte FLLR filler that
  // aligns the samples to 4096, then data (measured 2026-09-06)
  it('skips the chunks it does not know, as say’s FLLR filler', () => {
    expect(wavDataLength(wav([{ name: 'fmt ', size: 16 }, { name: 'FLLR', size: 4044 }, { name: 'data', size: 512 }]))).toBe(512);
  });

  it('answers 0 for a file with a data chunk and no samples, which is what say writes for empty text', () => {
    expect(wavDataLength(wav([{ name: 'fmt ', size: 16 }, { name: 'FLLR', size: 4044 }, { name: 'data', size: 0 }]))).toBe(0);
  });

  it('caps a declared size at what the file holds, so a truncated file is not counted as longer', () => {
    expect(wavDataLength(wav([{ name: 'fmt ', size: 16 }, { name: 'data', size: 100, declared: 100000 }]))).toBe(100);
  });

  it('answers null for anything that is not a WAV, or that ends before its data chunk', () => {
    expect(wavDataLength(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(wavDataLength(new TextEncoder().encode('RIFF....WAVEfmt '))).toBeNull();
    expect(wavDataLength(wav([{ name: 'fmt ', size: 16 }]))).toBeNull();
    expect(wavDataLength(new Uint8Array(0))).toBeNull();
  });
});

describe('pcm16ToWav', () => {
  it('writes a 44-byte header for mono 16-bit samples at the given rate, and the samples byte for byte', async () => {
    const { pcm16ToWav } = await import('../../src/core/wav');
    const samples = new Uint8Array([1, 0, 2, 0, 3, 0]);
    const blob = pcm16ToWav(samples, 24_000);
    expect(blob.type).toBe('audio/wav');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(bytes.length).toBe(50);
    expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...bytes.subarray(8, 16))).toBe('WAVEfmt ');
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(4, true)).toBe(42);
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(24_000);
    expect(view.getUint32(28, true)).toBe(48_000);
    expect(view.getUint16(32, true)).toBe(2);
    expect(view.getUint16(34, true)).toBe(16);
    expect(wavDataLength(bytes)).toBe(6);
    expect([...bytes.subarray(44)]).toEqual([1, 0, 2, 0, 3, 0]);
  });
});
