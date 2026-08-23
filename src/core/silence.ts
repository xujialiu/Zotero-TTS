/**
 * A clip of silence as a WAV Blob (16-bit mono PCM). Used in place of a
 * segment the server refuses to speak, so playback pauses briefly and moves
 * on instead of stopping. WAV needs no encoder, and Zotero decodes audio
 * with decodeAudioData, which takes it.
 */
export function silentWav(durationMs: number, sampleRate = 8000): Blob {
  const samples = Math.max(1, Math.round((sampleRate * durationMs) / 1000));
  const dataBytes = samples * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const ascii = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, 'data');
  view.setUint32(40, dataBytes, true);
  // The sample bytes are already zero: silence
  return new Blob([buffer], { type: 'audio/wav' });
}
