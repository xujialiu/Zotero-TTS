import { describe, expect, it } from 'vitest';
import { silentWav } from '../../src/core/silence';

describe('silentWav', () => {
  it('is a well-formed 16-bit mono PCM WAV of the requested length', async () => {
    const blob = silentWav(400, 8000);
    expect(blob.type).toBe('audio/wav');
    const samples = 3200;
    expect(blob.size).toBe(44 + samples * 2);
    const view = new DataView(await blob.arrayBuffer());
    const ascii = (offset: number, n: number) => String.fromCharCode(...new Uint8Array(view.buffer, offset, n));
    expect(ascii(0, 4)).toBe('RIFF');
    expect(view.getUint32(4, true)).toBe(36 + samples * 2);
    expect(ascii(8, 4)).toBe('WAVE');
    expect(ascii(12, 4)).toBe('fmt ');
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(8000);
    expect(view.getUint32(28, true)).toBe(16000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(ascii(36, 4)).toBe('data');
    expect(view.getUint32(40, true)).toBe(samples * 2);
    expect(new Uint8Array(view.buffer, 44).every((b) => b === 0)).toBe(true);
  });

  it('never produces an empty clip', () => {
    expect(silentWav(0).size).toBe(46);
  });
});
